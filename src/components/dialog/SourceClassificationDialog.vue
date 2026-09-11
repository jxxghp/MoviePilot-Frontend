<script setup lang="ts">
import api, { getApiBusinessErrorMessage } from '@/api'
import type { DownloadHistory, FileItem, MediaDataSource, MusicEntityType } from '@/api/types'
import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { useMediaSources } from '@/composables/useMediaSources'
import { useToast } from 'vue-toastification'
import { VDialog } from 'vuetify/components'

type MediaTypeName = '电影' | '电视剧' | '音乐'
type OrganizationMode = 'keep' | 'recognize' | 'manual'

interface OrganizationPlan {
  hash: string
  downloader: string
  mode: OrganizationMode
  recognized: boolean
  media_type?: string
  media_source?: string
  media_id?: string
  title?: string
  year?: string
  current_save_path: string
  target_save_path: string
  current_content_path?: string
  target_content_path?: string
  rename_kind?: 'folder' | 'file'
  category?: string
  secondary_categories: string[]
  current_root_name?: string
  proposed_root_name?: string
  rename_supported: boolean
  rename_required: boolean
  changed: boolean
  executed: boolean
  relocated: boolean
  renamed: boolean
  operation_id?: string
  state?: 'preview' | 'prepared' | 'rename_requested' | 'move_requested' | 'complete' | 'needs_attention'
  message?: string
}

const props = defineProps<{ task?: Partial<DownloadHistory>; sourceFile?: FileItem; embedded?: boolean }>()
const task = computed(() => props.task || {})
const emit = defineEmits(['close', 'done'])
const toast = useToast()

const normalizeType = (value?: string): MediaTypeName | undefined =>
  ['电影', '电视剧', '音乐'].includes(value || '') ? (value as MediaTypeName) : undefined

const mode = ref<OrganizationMode>('keep')
const typeName = ref<MediaTypeName | undefined>(normalizeType(task.value.type))
const mediaSource = ref<MediaDataSource | null>(
  typeName.value === '音乐' ? 'musicbrainz' : task.value.media_source || null,
)
const mediaId = ref(task.value.media_source === mediaSource.value ? task.value.media_id || '' : '')
const musicType = ref<MusicEntityType>(task.value.music_type || 'album')
const episodeGroup = ref('')
const targetPath = ref('')
const targetPathItems = ref<{ title: string; value: string }[]>([])
const smartRename = ref(true)
const selectorVisible = ref(false)
const busy = ref(false)
const error = ref('')
const plan = ref<OrganizationPlan>()
const pending = computed(() => Boolean(plan.value?.operation_id && plan.value.state !== 'complete'))
let statusTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
onBeforeUnmount(() => {
  disposed = true
  if (statusTimer) clearTimeout(statusTimer)
})

function scheduleStatus() {
  if (disposed || !pending.value || plan.value?.state === 'needs_attention') return
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(checkStatus, 3000)
}

async function checkStatus() {
  const operation = plan.value
  if (!operation?.operation_id || busy.value) return
  busy.value = true
  try {
    plan.value = await api.post<OrganizationPlan>(
      `download/${operation.hash}/source-status`,
      {
        downloader: operation.downloader,
        operation_id: operation.operation_id,
      },
      { feedback: 'silent' },
    )
    error.value = ''
    if (plan.value.state === 'complete') {
      toast.success('qB 路径核验完成，MP 下载记录已同步')
      emit('done')
    } else scheduleStatus()
  } catch (reason) {
    error.value = getApiBusinessErrorMessage(reason) || '暂时无法核验，可稍后继续核验；不会重复改名'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    const directories =
      await api.get<
        { name?: string; download_path?: string; save_path?: string; media_type?: string; media_category?: string }[]
      >('download/paths')
    targetPathItems.value = directories
      .filter(item => item.download_path)
      .map(item => ({
        title: [item.name, item.media_type, item.media_category, item.download_path].filter(Boolean).join(' · '),
        value: item.download_path || item.save_path || '',
      }))
  } catch {
    // 目录列表加载失败时仍允许管理员输入配置根下的完整路径。
  }
})

const typeItems = [
  { title: '自动（使用对应下载任务）', value: undefined },
  { title: '电影', value: '电影' },
  { title: '电视剧', value: '电视剧' },
  { title: '音乐', value: '音乐' },
]

const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const mediaSourceItems = getMediaSourceItems('media')
const musicSourceItems = getMediaSourceItems('music')

const sourceItems = computed(() => {
  const automatic = [{ title: '自动', value: null }]
  if (typeName.value === '音乐') {
    return [...automatic, ...musicSourceItems.value]
  }
  return [...automatic, ...mediaSourceItems.value]
})

function invalidatePlan() {
  if (pending.value) return
  plan.value = undefined
  error.value = ''
}

watch([mode, typeName, mediaSource, mediaId, musicType, episodeGroup, targetPath, smartRename], invalidatePlan)
watch(typeName, () => {
  if (typeName.value === '音乐') {
    mediaSource.value = 'musicbrainz'
    return
  }
  const allowed = sourceItems.value.some(item => item.value === mediaSource.value)
  if (!allowed) {
    mediaSource.value = null
    mediaId.value = ''
  }
})
watch(mediaSource, (next, previous) => {
  if (next !== previous) mediaId.value = ''
})
watch(mode, value => {
  if (value === 'keep') smartRename.value = true
})

function selectMedia(item: { music_type?: MusicEntityType }) {
  if (item.music_type === 'album' || item.music_type === 'recording' || item.music_type === 'artist')
    musicType.value = item.music_type
  selectorVisible.value = false
}

async function submit(execute = false) {
  if ((!task.value.download_hash && !props.sourceFile) || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.post<OrganizationPlan>(
      props.sourceFile ? 'download/source/normalize' : `download/${task.value.download_hash}/classify-source`,
      {
        downloader: task.value.downloader,
        source_path: props.sourceFile?.path,
        storage: props.sourceFile?.storage,
        execute,
        mode: mode.value,
        target_path: mode.value === 'manual' ? targetPath.value.trim() : undefined,
        type_name: typeName.value,
        media_source: mediaSource.value || undefined,
        media_id: mediaSource.value && mediaId.value.trim() ? mediaId.value.trim() : undefined,
        music_type: typeName.value === '音乐' ? musicType.value : undefined,
        episode_group: typeName.value === '电视剧' && episodeGroup.value.trim() ? episodeGroup.value.trim() : undefined,
        smart_rename: smartRename.value,
        expected_current_path: execute ? plan.value?.current_save_path : undefined,
        expected_target_path: execute ? plan.value?.target_save_path : undefined,
        expected_content_path: execute ? plan.value?.current_content_path : undefined,
        expected_root_name: execute ? plan.value?.proposed_root_name : undefined,
      },
      { feedback: 'silent' },
    )
    plan.value = result
    if (result.state === 'complete') {
      toast.success('qB 路径核验完成，MP 下载记录已同步')
      emit('done')
    } else if (result.operation_id) scheduleStatus()
  } catch (reason) {
    error.value = getApiBusinessErrorMessage(reason) || '识别或预览失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <component
    :is="embedded ? 'div' : VDialog"
    :model-value="true"
    max-width="920"
    scrollable
    @update:model-value="emit('close')"
  >
    <VCard title="资源规范化命名">
      <VCardText>
        <div class="text-subtitle-1 mb-4">{{ task.title || task.torrent_name || sourceFile?.path }}</div>
        <VAlert v-if="sourceFile" type="info" variant="tonal" class="mb-4">
          此工具只规范所选下载任务的一级名称，不执行整理入库。无法唯一匹配 qB 任务时停止，不直接修改磁盘文件。
        </VAlert>
        <VAlert type="info" variant="tonal" class="mb-5">
          音乐默认由 MusicBrainz 识别。只通过 qBittorrent
          修改任务最外层目录名或单文件名，专辑和合集内部保持原样，不修改音频标签。
        </VAlert>

        <VBtnToggle v-model="mode" mandatory divided color="primary" class="mb-5">
          <VBtn value="keep" prepend-icon="mdi-rename-outline" :disabled="busy || pending">仅规范名称</VBtn>
          <VBtn value="recognize" prepend-icon="mdi-auto-fix" :disabled="busy || pending">同时按类别归档</VBtn>
          <VBtn value="manual" prepend-icon="mdi-folder-edit-outline" :disabled="busy || pending"
            >同时指定保存目录</VBtn
          >
        </VBtnToggle>
        <VAlert v-if="mode === 'keep'" type="info" variant="tonal" class="mb-4">
          保持当前保存位置；识别后先预览，确认后再更新 qBittorrent 的内容路径。
        </VAlert>
        <VAlert v-if="mode === 'recognize'" type="info" variant="tonal" class="mb-4">
          源目录按“MusicBrainz 主类别 / 艺人 / 作品（年份）”归档。Artist Collection 是 MP
          的艺术家合集扩展类别，不改变媒体库整理设置。
        </VAlert>

        <VRow>
          <VCol cols="12" md="4">
            <VSelect v-model="typeName" :items="typeItems" label="类型" :disabled="busy || pending" clearable />
          </VCol>
          <VCol cols="12" md="4">
            <VSelect v-model="mediaSource" :items="sourceItems" label="数据源" :disabled="busy || pending" />
          </VCol>
          <VCol v-if="typeName === '音乐'" cols="12" md="4">
            <VSelect
              v-model="musicType"
              :items="[
                { title: '专辑', value: 'album' },
                { title: '单曲', value: 'recording' },
                { title: '艺术家合集', value: 'artist' },
              ]"
              label="音乐实体"
              :disabled="busy || pending"
              @update:model-value="mediaId = ''"
            />
          </VCol>
          <VCol v-if="typeName === '电视剧'" cols="12" md="4">
            <VTextField v-model="episodeGroup" label="剧集组（可选）" :disabled="busy || pending" />
          </VCol>
          <VCol v-if="mediaSource" cols="12">
            <VTextField v-model="mediaId" label="数据源原生 ID" :disabled="busy || pending">
              <template #append-inner>
                <IconBtn aria-label="搜索媒体 ID" @click="selectorVisible = true">
                  <VIcon icon="mdi-magnify" />
                </IconBtn>
              </template>
            </VTextField>
          </VCol>
          <VCol v-if="mode === 'manual'" cols="12">
            <VCombobox
              v-model="targetPath"
              :items="targetPathItems"
              label="目标资源目录"
              placeholder="/volume1/UT/Musics/Album"
              hint="必须位于 MoviePilot 已配置的资源目录内"
              persistent-hint
              :disabled="busy || pending"
              clearable
            />
          </VCol>
        </VRow>

        <VSwitch
          v-model="smartRename"
          color="primary"
          label="根据识别结果规范化名称"
          hint="目录：艺人 - 专辑（年份）或艺人 - 艺术家合集；单文件：艺人 - 曲名，保留原扩展名。多根任务不处理。"
          persistent-hint
          class="mb-3"
          :disabled="busy || pending || mode === 'keep'"
        />

        <VAlert v-if="error" type="error" variant="tonal" class="mt-3">{{ error }}</VAlert>
        <VAlert
          v-if="plan?.message"
          :type="plan.state === 'complete' ? 'success' : 'warning'"
          variant="tonal"
          class="mt-3"
        >
          {{ plan.message }}
        </VAlert>
        <VCard v-if="plan" variant="tonal" class="mt-5">
          <VCardTitle class="text-subtitle-1">执行预览</VCardTitle>
          <VCardText style="overflow-wrap: anywhere">
            <VRow dense>
              <VCol cols="12" md="6"
                ><b>识别：</b>{{ plan.title || '未识别' }}{{ plan.year ? ` (${plan.year})` : '' }}</VCol
              >
              <VCol cols="12" md="6"><b>类型：</b>{{ plan.media_type || '-' }}</VCol>
              <VCol cols="12" md="6"><b>主分类：</b>{{ plan.category || '-' }}</VCol>
              <VCol cols="12" md="6"><b>副分类：</b>{{ plan.secondary_categories.join('、') || '-' }}</VCol>
            </VRow>
            <VDivider class="my-3" />
            <div>
              <b>当前位置：</b><code>{{ plan.current_save_path }}</code>
            </div>
            <div class="mt-2">
              <b>目标位置：</b><code>{{ plan.target_save_path }}</code>
            </div>
            <div class="mt-3">
              <b>{{ plan.rename_kind === 'file' ? '当前文件名：' : '当前根目录：' }}</b>
              <code>{{ plan.current_root_name || '无单一根目录' }}</code>
            </div>
            <div class="mt-2">
              <b>规范名称：</b><code>{{ plan.proposed_root_name || '-' }}</code>
            </div>
            <div class="mt-2">
              <b>最终内容路径：</b><code>{{ plan.target_content_path || '-' }}</code>
            </div>
            <VAlert v-if="!plan.changed" type="success" variant="tonal" class="mt-4">任务已符合当前规则</VAlert>
          </VCardText>
        </VCard>
      </VCardText>
      <VCardActions>
        <VBtn :disabled="busy" @click="emit('close')">关闭</VBtn>
        <VSpacer />
        <VBtn v-if="pending" :loading="busy" :disabled="busy" @click="checkStatus">继续核验</VBtn>
        <VBtn
          v-else
          :loading="busy"
          :disabled="busy || (mode === 'manual' && !targetPath.trim())"
          @click="submit(false)"
        >
          识别并预览
        </VBtn>
        <VBtn
          v-if="plan?.changed && !plan.operation_id"
          color="primary"
          variant="flat"
          :disabled="busy"
          @click="submit(true)"
        >
          确认由下载器执行
        </VBtn>
      </VCardActions>
    </VCard>
  </component>

  <VDialog v-if="mediaSource" v-model="selectorVisible" max-width="50rem">
    <MediaIdSelector
      v-model="mediaId"
      :type="mediaSource"
      :music-types="typeName === '音乐' ? [musicType] : undefined"
      @select="selectMedia"
      @close="selectorVisible = false"
    />
  </VDialog>
</template>
