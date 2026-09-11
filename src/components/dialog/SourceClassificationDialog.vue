<script setup lang="ts">
import api, { getApiBusinessErrorMessage } from '@/api'
import type { DownloadHistory, MediaDataSource, MusicEntityType } from '@/api/types'
import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { useMediaSources } from '@/composables/useMediaSources'
import { useToast } from 'vue-toastification'

type MediaTypeName = '电影' | '电视剧' | '音乐'
type OrganizationMode = 'recognize' | 'manual'

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
}

const props = defineProps<{ task: DownloadHistory }>()
const emit = defineEmits(['close'])
const toast = useToast()

const normalizeType = (value?: string): MediaTypeName | undefined =>
  ['电影', '电视剧', '音乐'].includes(value || '') ? (value as MediaTypeName) : undefined

const mode = ref<OrganizationMode>('recognize')
const typeName = ref<MediaTypeName | undefined>(normalizeType(props.task.type))
const mediaSource = ref<MediaDataSource | null>(props.task.media_source || null)
const mediaId = ref(props.task.media_id || '')
const musicType = ref<MusicEntityType>(props.task.music_type === 'artist' ? 'artist' : 'album')
const episodeGroup = ref('')
const targetPath = ref('')
const targetPathItems = ref<{ title: string; value: string }[]>([])
const smartRename = ref(true)
const selectorVisible = ref(false)
const busy = ref(false)
const error = ref('')
const plan = ref<OrganizationPlan>()

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
  { title: '自动（使用下载历史）', value: undefined },
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
  plan.value = undefined
  error.value = ''
}

watch([mode, typeName, mediaSource, mediaId, musicType, episodeGroup, targetPath, smartRename], invalidatePlan)
watch(typeName, () => {
  const allowed = sourceItems.value.some(item => item.value === mediaSource.value)
  if (!allowed) {
    mediaSource.value = null
    mediaId.value = ''
  }
})
watch(mediaSource, (next, previous) => {
  if (next !== previous) mediaId.value = ''
})

function selectMedia(item: { music_type?: MusicEntityType }) {
  if (item.music_type === 'album' || item.music_type === 'recording' || item.music_type === 'artist')
    musicType.value = item.music_type
  selectorVisible.value = false
}

async function submit(execute = false) {
  if (!props.task.download_hash || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.post<OrganizationPlan>(
      `download/${props.task.download_hash}/classify-source`,
      {
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
    if (execute) {
      toast.success(result.executed ? '已由下载器执行识别归类计划' : '任务已符合当前规则')
      emit('close')
    }
  } catch (reason) {
    error.value = getApiBusinessErrorMessage(reason) || '识别或预览失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <VDialog :model-value="true" max-width="920" scrollable @update:model-value="emit('close')">
    <VCard title="识别与资源归类">
      <VCardText>
        <div class="text-subtitle-1 mb-4">{{ task.title || task.torrent_name }}</div>
        <VAlert type="info" variant="tonal" class="mb-5">
          复用 MoviePilot 的媒体识别，并且只通过下载器改保存位置或种子根目录名。不会刮削媒体，也不会修改音频标签。
        </VAlert>

        <VBtnToggle v-model="mode" mandatory divided color="primary" class="mb-5">
          <VBtn value="recognize" prepend-icon="mdi-auto-fix">系统识别归类</VBtn>
          <VBtn value="manual" prepend-icon="mdi-folder-edit-outline">手动指定目录</VBtn>
        </VBtnToggle>

        <VRow>
          <VCol cols="12" md="4">
            <VSelect v-model="typeName" :items="typeItems" label="类型" :disabled="busy" clearable />
          </VCol>
          <VCol cols="12" md="4">
            <VSelect v-model="mediaSource" :items="sourceItems" label="数据源" :disabled="busy" />
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
              :disabled="busy"
            />
          </VCol>
          <VCol v-if="typeName === '电视剧'" cols="12" md="4">
            <VTextField v-model="episodeGroup" label="剧集组（可选）" :disabled="busy" />
          </VCol>
          <VCol v-if="mediaSource" cols="12">
            <VTextField v-model="mediaId" label="数据源原生 ID" :disabled="busy">
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
              :disabled="busy"
              clearable
            />
          </VCol>
        </VRow>

        <VSwitch
          v-model="smartRename"
          color="primary"
          label="识别后规范化种子根目录名"
          hint="仅支持 qBittorrent 的单根目录任务，由 qBittorrent 执行 renameFolder，保持做种关系"
          persistent-hint
          class="mb-3"
        />

        <VAlert v-if="error" type="error" variant="tonal" class="mt-3">{{ error }}</VAlert>
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
              <b>当前根目录：</b><code>{{ plan.current_root_name || '无单一根目录' }}</code>
            </div>
            <div class="mt-2">
              <b>规范根目录：</b><code>{{ plan.proposed_root_name || '-' }}</code>
            </div>
            <VAlert v-if="!plan.changed" type="success" variant="tonal" class="mt-4">任务已符合当前规则</VAlert>
          </VCardText>
        </VCard>
      </VCardText>
      <VCardActions>
        <VBtn :disabled="busy" @click="emit('close')">关闭</VBtn>
        <VSpacer />
        <VBtn :loading="busy" :disabled="busy || (mode === 'manual' && !targetPath.trim())" @click="submit(false)">
          识别并预览
        </VBtn>
        <VBtn v-if="plan?.changed" color="primary" variant="flat" :disabled="busy" @click="submit(true)">
          确认由下载器执行
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>

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
