import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { ManualTransferPreviewData, ManualTransferPreviewItem } from '@/api/types'
import { canCorrectMusicGroup, groupMusicPreview, previewFileScope, replaceMusicGroup } from '../state'

/** 构造来自后端实际范围的文件投影，独立发行可以共享父目录。 */
function row(group: string, path: string, storage = 'local'): ManualTransferPreviewItem {
  return {
    source: path,
    source_storage: storage,
    source_item: { path, storage, name: path, type: 'file' },
    success: true,
    music: {
      status: 'local_tags',
      online_confirmed: false,
      artists: ['Artist'],
      album: 'Same name',
      field_sources: {},
      candidates: [],
      read_status: 'tags',
      file_role: 'audio',
      group_id: group,
      group_directory: '/music',
    },
  }
}

/** 汇总响应保留每项结果，测试范围替换时不依赖组件内部状态。 */
function data(items: ManualTransferPreviewItem[]): ManualTransferPreviewData {
  return { items, summary: { total: items.length, success: items.length, failed: 0 } }
}

describe('music preview file boundaries', () => {
  it('keeps distinct editions and storage namespaces apart even with identical names and parent paths', () => {
    const rows = [row('a', '/music/01.flac'), row('b', '/music/02.flac'), row('a', '/music/01.flac', 'alist')]
    expect(groupMusicPreview(rows).map(group => group.items.length)).toEqual([1, 1, 1])
    expect(previewFileScope(rows)).toHaveLength(3)
    expect(canCorrectMusicGroup(groupMusicPreview(rows)[2])).toBe(false)
  })
  it('rejects directories, duplicate source files, missing identities and contradictory storage', () => {
    const original = row('a', '/music/01.flac')
    const invalid = [
      { ...original, source_item: { ...original.source_item!, type: 'dir' } },
      { ...original, source_item: undefined },
      { ...original, source_storage: 'alist' },
      { ...original, source: '/another/file.flac' },
    ]
    invalid.forEach(item => expect(previewFileScope([item])).toBeUndefined())
    expect(previewFileScope([original, original])).toBeUndefined()
  })
  it('requires affirmative audio readability instead of treating unknown reads as editable', () => {
    for (const read_status of ['unreadable', 'name_only', 'unknown'] as const) {
      const item = row('a', '/music/01.flac')
      item.music!.read_status = read_status
      expect(canCorrectMusicGroup(groupMusicPreview([item])[0])).toBe(false)
    }
    const item = row('a', '/music/01.flac')
    item.music!.read_status = 'stream_only'
    expect(canCorrectMusicGroup(groupMusicPreview([item])[0])).toBe(true)
  })
  it('replaces only the chosen edition while preserving other albums and CUE companions', () => {
    const rows = [row('a', '/music/image.flac'), row('a', '/music/album.cue'), row('b', '/music/other.flac')]
    rows[1].music!.file_role = 'companion'
    const changed = rows.slice(0, 2).map(item => ({ ...item, target: '/library/' + item.source_item!.name }))
    const result = replaceMusicGroup(data(rows), groupMusicPreview(rows)[0], data(changed))
    expect(result?.items).toEqual([...changed, rows[2]])
  })
  it('refuses shortened, expanded or duplicate correction responses without altering the original preview', () => {
    const rows = [row('a', '/music/01.flac'), row('a', '/music/02.flac')]
    const original = ref(data(rows)).value
    const group = groupMusicPreview(rows)[0]
    for (const items of [[rows[0]], [rows[0], rows[0]], [...rows, row('a', '/music/new.flac')]]) {
      expect(replaceMusicGroup(original, group, data(items))).toBeUndefined()
    }
    expect(original.items).toEqual(rows)
  })
})
