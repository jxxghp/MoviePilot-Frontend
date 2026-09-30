import { computed, ref, type Ref } from 'vue'
import type {
  FileItem,
  ManualTransferPayload,
  ManualTransferPreviewData,
  ManualTransferPreviewItem,
  MediaDataSource,
} from '@/api/types'

/** 用户确认的专辑及可选具体发行，身份字段始终按来源传递。 */
export interface MusicAlbumSelection {
  media_source: MediaDataSource
  media_id: string
  musicbrainz_release_id?: string
}

/** 分组只使用后端范围标识，不能以同名专辑或父目录重新猜测。 */
export interface MusicPreviewGroup {
  id: string
  items: ManualTransferPreviewItem[]
}

/** 存储是文件身份的一部分，跨存储同名路径不能合并。 */
export function previewSourceKey(item: ManualTransferPreviewItem) {
  return JSON.stringify([item.source_item?.storage ?? item.source_storage, item.source_item?.path ?? item.source])
}

/** 未提供范围的旧响应保持逐文件展示，不赋予专辑纠正能力。 */
export function groupMusicPreview(items: ManualTransferPreviewItem[]): MusicPreviewGroup[] {
  const groups = new Map<string, MusicPreviewGroup>()
  items.forEach((item, index) => {
    const id = item.music?.group_id
      ? JSON.stringify([item.source_storage ?? item.source_item?.storage, item.music.group_id])
      : `file:${previewSourceKey(item)}:${index}`
    const group = groups.get(id) ?? { id, items: [] }
    group.items.push(item)
    groups.set(id, group)
  })
  return [...groups.values()]
}

/** 仅完整且唯一的真实源文件范围可以从目录预览转为显式执行。 */
export function previewFileScope(items: ManualTransferPreviewItem[]): FileItem[] | undefined {
  const files: FileItem[] = []
  const keys = new Set<string>()
  for (const item of items) {
    const source = item.source_item
    const key = previewSourceKey(item)
    if (
      !source?.path ||
      !source.storage ||
      source.type !== 'file' ||
      keys.has(key) ||
      (item.source && source.path !== item.source) ||
      (item.source_storage && source.storage !== item.source_storage)
    )
      return
    keys.add(key)
    files.push({ ...source })
  }
  return files.length ? files : undefined
}

/** 手选专辑需要读取本地音频对位，并保留同组CUE/歌词等配套文件。 */
export function canCorrectMusicGroup(group: MusicPreviewGroup) {
  return Boolean(
    group.items.length &&
    group.items.every(item => item.music?.group_id && item.source_item?.storage === 'local') &&
    group.items.some(item => item.music?.file_role === 'audio') &&
    group.items.every(
      item =>
        (item.music?.file_role === 'companion'
          ? item.music.read_status === 'companion'
          : ['tags', 'stream_only'].includes(item.music?.read_status ?? '')) && item.music?.status !== 'unsupported',
    ) &&
    previewFileScope(group.items),
  )
}

/** 按同一完整范围替换预览，拒绝服务返回缺项、额外文件或重复文件。 */
export function replaceMusicGroup(
  data: ManualTransferPreviewData,
  group: MusicPreviewGroup,
  replacement: ManualTransferPreviewData,
) {
  const expected = new Set(group.items.map(previewSourceKey))
  const actual = replacement.items.map(previewSourceKey)
  if (!previewFileScope(replacement.items) || actual.length !== expected.size || actual.some(key => !expected.has(key)))
    return
  const updated = new Map(replacement.items.map(item => [previewSourceKey(item), item]))
  const items = data.items.map(item => updated.get(previewSourceKey(item)) ?? item)
  return {
    ...data,
    items,
    message: '',
    summary: {
      total: items.length,
      success: items.filter(item => item.success !== false).length,
      failed: items.filter(item => item.success === false).length,
    },
  }
}

/** 保存已重预览的文件范围与选择；旧异步响应不能恢复已失效的纠正。 */
export function useMusicTransferCorrection(data: Ref<ManualTransferPreviewData | undefined>) {
  const selections = ref(new Map<string, MusicAlbumSelection>())
  const busy = ref(false)
  let generation = 0
  const groups = computed(() => groupMusicPreview(data.value?.items ?? []))
  const hasCorrections = computed(() => selections.value.size > 0)
  const scopeComplete = computed(() => Boolean(previewFileScope(data.value?.items ?? [])))

  /** 任何全局参数或源输入变动都使旧选择和在途响应失效。 */
  function reset() {
    generation += 1
    selections.value = new Map()
    busy.value = false
  }

  /** 重预览成功且范围不变后才保存选择，执行使用完全相同的专辑和发行身份。 */
  async function correct(
    group: MusicPreviewGroup,
    selection: MusicAlbumSelection,
    request: (items: FileItem[], selection: MusicAlbumSelection) => Promise<ManualTransferPreviewData>,
  ) {
    if (busy.value || !scopeComplete.value || !canCorrectMusicGroup(group)) return false
    const files = previewFileScope(group.items)
    if (!files) return false
    const current = generation
    busy.value = true
    try {
      const result = await request(files, selection)
      if (current !== generation || !data.value) return false
      const next = replaceMusicGroup(data.value, group, result)
      if (!next) throw new Error('music-transfer-scope-changed')
      // 新响应可能修正发行分组，覆盖以稳定源文件身份保存，不能依赖展示标题。
      for (const item of group.items) selections.value.set(previewSourceKey(item), { ...selection })
      data.value = next
      return true
    } catch (error) {
      if (current !== generation) return false
      throw error
    } finally {
      if (current === generation) busy.value = false
    }
  }

  /** 发生专辑纠正后，全部请求只包含预览过的文件，禁止再次递归展开原始目录。 */
  function executionPayloads(createPayload: (items: FileItem[]) => ManualTransferPayload) {
    if (!hasCorrections.value) return undefined
    if (busy.value || !scopeComplete.value) throw new Error('music-transfer-scope-changed')
    return groups.value.flatMap(group => {
      const buckets = new Map<string, { items: ManualTransferPreviewItem[]; selection?: MusicAlbumSelection }>()
      for (const item of group.items) {
        const selection = selections.value.get(previewSourceKey(item))
        const key = JSON.stringify(selection ?? null)
        const bucket = buckets.get(key) ?? { items: [], selection }
        bucket.items.push(item)
        buckets.set(key, bucket)
      }
      return [...buckets.values()].map(bucket => {
        const items = previewFileScope(bucket.items)
        if (!items) throw new Error('music-transfer-scope-changed')
        const payload = createPayload(items)
        return bucket.selection
          ? { ...payload, ...bucket.selection, music_type: 'album' as const, type_name: '音乐', from_history: false }
          : payload
      })
    })
  }

  return { groups, busy, hasCorrections, scopeComplete, reset, correct, executionPayloads }
}
