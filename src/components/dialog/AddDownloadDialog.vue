<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api, { isApiBusinessFailure, isApiResponse } from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type {
  DownloaderConf,
  MediaDataSource,
  MediaInfo,
  MusicEntityType,
  TorrentInfo,
  TransferDirectoryConf,
} from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { VCardTitle, VChip } from 'vuetify/lib/components/index.mjs'
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { isMediaDataSource, isMusicMediaSource, isValidMediaSourceId } from '@/utils/mediaId'
import { useGlobalSettingsStore } from '@/stores'
import { useConfirm } from '@/composables/useConfirm'

interface DownloadAddedData {
  requires_confirmation?: boolean
}

// 多语言支持
const { t } = useI18n()

// 从 provide 中获取全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前识别类型
const props = defineProps({
  title: String,
  media: Object as PropType<MediaInfo>,
  torrent: Object as PropType<TorrentInfo>,
})

// 当前识别类型：优先使用已随媒体或种子传入的完整身份，否则使用识别上下文。
const mediaSource = computed<MediaDataSource>(() => {
  if (isMediaDataSource(props.media?.media_source) && props.media?.media_id?.trim()) return props.media.media_source
  if (isMediaDataSource(props.torrent?.media_source) && props.torrent?.media_id?.trim())
    return props.torrent.media_source
  if (isMediaDataSource(props.media?.media_source)) return props.media.media_source
  if (isMediaDataSource(props.torrent?.media_source)) return props.torrent.media_source
  if (props.torrent?.category === '音乐' || props.torrent?.category === 'music') return 'musicbrainz'
  if (isMediaDataSource(globalSettings.RECOGNIZE_SOURCE)) return globalSettings.RECOGNIZE_SOURCE
  return 'themoviedb'
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()
const createConfirm = useConfirm()

// 选择的下载器
const selectedDownloader = ref<string | null>(null)

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

// 下载器
const downloaders = ref<Array<Pick<DownloaderConf, 'name' | 'type'>>>([])

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)

// 是否显示高级选项
const showAdvancedOptions = ref(false)

// 当前数据源的原生媒体ID
const mediaId = ref<string | undefined>(undefined)

// 无完整媒体上下文时，音乐原生 ID 需要实体命名空间才能区分单曲和专辑。
const musicType = ref<Exclude<MusicEntityType, 'artist'>>(props.media?.music_type === 'album' ? 'album' : 'recording')

const isMusicSelection = computed(() => isMusicMediaSource(mediaSource.value))

const musicEntityOptions = computed(() => [
  { title: t('setting.cache.musicType.recording'), value: 'recording' },
  { title: t('setting.cache.musicType.album'), value: 'album' },
])

// 打开对话框时预填媒体或种子携带的完整身份，不从辅助 ID 字段推导。
watch(
  () => [props.media, props.torrent] as const,
  ([media, torrent]) => {
    if (isMediaDataSource(media?.media_source) && media.media_id?.trim()) {
      mediaId.value = media.media_id.trim()
    } else if (isMediaDataSource(torrent?.media_source) && torrent.media_id?.trim()) {
      mediaId.value = torrent.media_id.trim()
    } else {
      mediaId.value = undefined
    }
    if (media?.music_type === 'recording' || media?.music_type === 'album') {
      musicType.value = media.music_type
    }
  },
  { immediate: true },
)

// 同步媒体选择器返回的音乐实体，避免只保存 ID 后默认回落到单曲。
function handleMediaSelected(item: Pick<MediaInfo, 'music_type'>) {
  if (item.music_type === 'recording' || item.music_type === 'album') {
    musicType.value = item.music_type
  }
}

// 当前数据源对应的原生ID标签。
const mediaIdLabel = computed(() => {
  const labels: Partial<Record<MediaDataSource, string>> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
    imdb: 'IMDb ID',
    tvdb: 'TVDB ID',
    musicbrainz: 'MusicBrainz ID',
    theaudiodb: 'TheAudioDB ID',
    doubanmusic: t('dialog.reorganize.doubanId'),
  }
  return labels[mediaSource.value] ?? t('dialog.reorganize.mediaId')
})

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 计算按钮图标
const icon = computed(() => (loading.value ? 'mdi-progress-download' : 'mdi-download'))

// 计算按钮文字
const buttonText = computed(() =>
  loading.value ? t('dialog.addDownload.downloading') : t('dialog.addDownload.startDownload'),
)

// 下载确认副标题，未传媒体标题时回退到种子标题。
const dialogSubtitle = computed(() => {
  const siteName = props.torrent?.site_name?.trim()
  const displayTitle = props.title?.trim() || props.torrent?.title?.trim()

  return [siteName, displayTitle].filter(Boolean).join(' - ')
})

// 加载目录设置
async function loadDirectories() {
  try {
    const result = await api.get<{ value?: TransferDirectoryConf[] }>('system/setting/public/Directories')
    directories.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 将下载目录配置转换为下载器可识别的存储路径。
function convertToUri(item: TransferDirectoryConf) {
  if (!item.download_path) {
    return undefined
  }
  // storage 缺省是受支持的本地目录配置，不能生成 undefined/null 前缀。
  if (item.storage === undefined || item.storage === null || item.storage === 'local') {
    return item.download_path
  }
  return item.storage + ':' + item.download_path
}

// 获取保存目录
const targetDirectories = computed(() => {
  const downloadDirectories = directories.value
    .map(item => convertToUri(item))
    .filter((item): item is string => item !== undefined)
  return [...new Set(downloadDirectories)]
})

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    downloaders.value = await api.get<
      Array<Pick<DownloaderConf, 'name' | 'type'>>,
      Array<Pick<DownloaderConf, 'name' | 'type'>>
    >('download/clients')
  } catch (error) {
    console.log(error)
  }
}

// 下载器可选项
const downloaderOptions = computed(() => {
  return downloaders.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 添加下载
async function addDownload() {
  startNProgress()
  loading.value = true
  try {
    const payload: {
      downloader: string | null
      media_id?: string
      media_in?: MediaInfo
      media_source?: MediaDataSource
      music_type?: Exclude<MusicEntityType, 'artist'>
      allow_unrecognized?: boolean
      save_path: string | null
      torrent_in: TorrentInfo | undefined
    } = {
      torrent_in: props.torrent,
      downloader: selectedDownloader.value,
      save_path: selectedDirectory.value,
    }

    if (props.media) {
      payload.media_in = props.media
    }

    const normalizedMediaId = mediaId.value?.trim()
    if (normalizedMediaId && isValidMediaSourceId(normalizedMediaId, mediaSource.value)) {
      payload.media_source = mediaSource.value
      payload.media_id = normalizedMediaId
      if (isMusicSelection.value) payload.music_type = musicType.value
    }

    const endpoint = props.media ? 'download/' : 'download/add'

    try {
      await api.post<null>(endpoint, payload, { feedback: 'silent' })
    } catch (error) {
      if (
        !isApiBusinessFailure(error) ||
        !isApiResponse<DownloadAddedData>(error.payload) ||
        error.payload.data?.requires_confirmation !== true
      ) {
        throw error
      }

      const confirmed = await createConfirm({
        type: 'warn',
        title: t('dialog.addDownload.unrecognizedTitle'),
        content: t('dialog.addDownload.unrecognizedContent'),
        confirmText: t('dialog.addDownload.continueDownload'),
      })
      if (!confirmed) return

      payload.allow_unrecognized = true
      await api.post<null>(endpoint, payload, { feedback: 'silent' })
    }

    // 添加下载成功
    $toast.success(
      t('dialog.addDownload.downloadSuccess', { site: props.torrent?.site_name, title: props.torrent?.title }),
    )
    // 下载成功，返回链接
    emit('done', props.torrent?.enclosure)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : String(error)
    $toast.error(
      t('dialog.addDownload.downloadFailed', {
        site: props.torrent?.site_name,
        title: props.torrent?.title,
        message,
      }),
    )
    emit('error', message)
  } finally {
    loading.value = false
    doneNProgress()
  }
}

onMounted(() => {
  loadDirectories()
  loadDownloaderSetting()
})
</script>
<template>
  <VDialog max-width="35rem" scrollable>
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-monitor-arrow-down-variant" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.addDownload.confirmDownload') }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VList lines="one">
          <VListItem>
            <template #prepend>
              <VIcon icon="mdi-web"></VIcon>
            </template>
            <VListItemTitle>
              <span class="whitespace-break-spaces me-2">{{ torrent?.title }}</span>
              <span class="text-green-700 ms-2 text-sm">↑{{ torrent?.seeders }}</span>
              <span class="text-orange-700 ms-2 text-sm">↓{{ torrent?.peers }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="torrent?.description">
            <template #prepend>
              <VIcon icon="mdi-subtitles-outline"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2 whitespace-break-spaces">{{ torrent?.description }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="torrent?.size">
            <template #prepend>
              <VIcon icon="mdi-database"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2">
                <VChip variant="tonal" label>
                  {{ formatFileSize(torrent?.size || 0) }}
                </VChip>
              </span>
            </VListItemTitle>
          </VListItem>
        </VList>
        <VRow class="px-5">
          <VCol cols="12" md="6">
            <VSelect
              v-model="selectedDownloader"
              :items="downloaderOptions"
              :label="t('dialog.addDownload.downloader')"
              variant="underlined"
              :placeholder="t('dialog.addDownload.defaultPlaceholder')"
              density="comfortable"
              prepend-inner-icon="mdi-download"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VCombobox
              v-model="selectedDirectory"
              :items="targetDirectories"
              :label="t('dialog.addDownload.saveDirectory')"
              :placeholder="t('dialog.addDownload.autoPlaceholder')"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-folder"
            />
          </VCol>
        </VRow>
        <VRow class="px-5 mt-2">
          <VCol cols="12">
            <VBtn
              variant="text"
              :prepend-icon="showAdvancedOptions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="showAdvancedOptions = !showAdvancedOptions"
            >
              {{
                showAdvancedOptions
                  ? t('dialog.addDownload.hideAdvancedOptions')
                  : t('dialog.addDownload.showAdvancedOptions')
              }}
            </VBtn>
          </VCol>
        </VRow>
        <VRow v-show="showAdvancedOptions" class="px-5">
          <VCol v-if="isMusicSelection" cols="12">
            <VSelect
              v-model="musicType"
              :items="musicEntityOptions"
              :label="t('dialog.reorganize.musicEntity')"
              prepend-inner-icon="mdi-music-box-multiple-outline"
              variant="underlined"
              density="comfortable"
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="mediaId"
              :label="mediaIdLabel"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[
                (value: any) => isValidMediaSourceId(value, mediaSource) || t('dialog.reorganize.mediaIdInvalid'),
              ]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              variant="underlined"
              density="comfortable"
              @click:append-inner="mediaSelectorDialog = true"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardText class="text-center">
        <VBtn variant="elevated" :disabled="loading" @click="addDownload" :prepend-icon="icon" class="px-5">
          {{ buttonText }}
        </VBtn>
      </VCardText>
    </VCard>
    <!-- 媒体ID选择器 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-model="mediaId"
        :type="mediaSource"
        :music-types="isMusicSelection ? ['recording', 'album'] : undefined"
        @select="handleMediaSelected"
        @close="mediaSelectorDialog = false"
      />
    </VDialog>
  </VDialog>
</template>
