<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { copyToClipboard } from '@/@core/utils/navigator'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import { listCustomIdentifiers, replaceCustomIdentifiers } from '@/api/customIdentifiers'
import type { Context, MediaDataSource, MediaInfo, TransferNamePreview } from '@/api/types'
import { getMediaSubscribeIdentity } from '@/composables/useMediaSubscribe'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { isMusicMediaSource } from '@/utils/mediaId'
import { useMediaSources } from '@/composables/useMediaSources'

/** 整理预览中的单项路径或目录展示。 */
interface TransferPreviewItem {
  icon: string
  key: string
  label: string
  monospace?: boolean
  muted?: boolean
  value: string
}

/** 发起整理预览时冻结的识别表单快照，避免异步返回前表单已被改写。 */
interface TransferPreviewRequestSnapshot {
  customWords?: string
  source: MediaDataSource
  subtitle: string | null
  title: string
}

/** 识别结果中一个可阅读的解析阶段，身份链接只在匹配成功时提供。 */
interface PipelineStep {
  icon: string
  identity?: MediaIdentity
  source?: MediaSourceDisplay
  title: string
  value: string
}

/** 媒体源的原生标识与详情链接，避免跨数据源误用 TMDB ID。 */
interface MediaIdentity {
  id: string
  link?: string
  source: string
  sourceKey: string
}

/** 媒体源的展示信息，在结果和解析阶段共用。 */
interface MediaSourceDisplay {
  icon?: string
  iconColor?: string
  image?: string
  key: string
  label: string
}

/** 本次识别测试的临时输入，不直接写入全局配置。 */
interface NameTestForm {
  customWords: string | null
  source: MediaDataSource
  subtitle: string | null
  title: string | null
}

const MEDIA_SOURCE_LABELS: Record<string, string> = {
  anilist: 'AniList',
  bangumi: 'Bangumi',
  douban: 'Douban',
  doubanmusic: '豆瓣音乐',
  musicbrainz: 'MusicBrainz',
  theaudiodb: 'TheAudioDB',
  themoviedb: 'TheMovieDb',
}

const MEDIA_SOURCE_LOGOS: Record<string, string> = {
  bangumi: getLogoUrl('bangumi'),
  douban: getLogoUrl('douban'),
  themoviedb: getLogoUrl('tmdb'),
}

// 无专属 logo 的数据源使用品牌色图标展示
const MEDIA_SOURCE_ICONS: Record<string, { icon: string; color: string }> = {
  anilist: { icon: 'mdi-alpha-a-circle', color: '#02a9ff' },
  musicbrainz: { icon: 'mdi-album', color: '#eb743b' },
  theaudiodb: { icon: 'mdi-music-box-multiple', color: '#35a7a0' },
  doubanmusic: { icon: 'mdi-music-circle', color: '#00b51d' },
}

const emit = defineEmits<{ close: [] }>()

// 国际化
const { t } = useI18n()
const globalSettingsStore = useGlobalSettingsStore()
const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const mediaSourceItems = getMediaSourceItems()

// 获取后台默认识别数据源，未知值兼容回退到TheMovieDb。
function getDefaultMediaSource(): MediaDataSource {
  const configuredSource = globalSettingsStore.globalSettings.RECOGNIZE_SOURCE as MediaDataSource
  return mediaSourceItems.value.some(item => item.value === configuredSource) ? configuredSource : 'themoviedb'
}

// 提示
const $toast = useToast()

// 识别结果
const nameTestResult = ref<Context>()

// 名称识别表单
const nameTestForm = reactive<NameTestForm>({
  title: null,
  subtitle: null,
  customWords: null,
  source: getDefaultMediaSource(),
})

// 音乐识别不应用影视自定义识别词，隐藏输入区避免误导。
const showCustomWords = computed(() => !isMusicMediaSource(nameTestForm.source))

// 识别按钮状态
const nameTestLoading = ref(false)

// 识别按钮文本
const nameTestText = ref(t('nameTest.recognize'))

// 是否显示结果
const showResult = ref(false)

// 请求错误提示
const nameTestError = ref('')

// 识别词保存中状态
const savingCustomWords = ref(false)

// 整理预览结果、加载态及失败提示，与主识别流程解耦，避免预览失败影响识别结果
const transferPreview = ref<TransferNamePreview | null>(null)
const transferPreviewLoading = ref(false)
const transferPreviewError = ref('')
// 递增请求序号，防止快速连续识别时旧预览响应覆盖最新结果
let transferPreviewRequestSeq = 0

const metaInfo = computed(() => nameTestResult.value?.meta_info)
const mediaInfo = computed(() => nameTestResult.value?.media_info)
// 音乐识别结果按曲目、艺术家和专辑展示，且元信息没有 name 字段
const isMusicResult = computed(() => mediaInfo.value?.type === '音乐' || metaInfo.value?.type === '音乐')
// 识别成功以匹配到媒体信息为准；识别失败时同样返回解析元数据，但不代表识别成功
const isRecognized = computed(() => Boolean(mediaInfo.value))
// 识别失败时保持失败标题，解析出的名称只在解析链路中展示
const resultTitle = computed(() =>
  isRecognized.value
    ? mediaInfo.value?.title || metaInfo.value?.name || t('nameTest.unrecognized')
    : t('nameTest.unrecognized'),
)
const resultSubtitle = computed(() => {
  const parts = [mediaInfo.value?.year || metaInfo.value?.year]
  if (isMusicResult.value) {
    // 音乐结果没有季集信息，展示艺术家和专辑辅助确认
    const artistText = mediaInfo.value?.artist || metaInfo.value?.artist
    if (artistText) parts.push(artistText)
    if (mediaInfo.value?.album) parts.push(mediaInfo.value.album)
  } else if (metaInfo.value?.season_episode) {
    parts.push(metaInfo.value.season_episode)
  }
  return parts.filter(Boolean).join(' · ') || t('nameTest.waitingResult')
})
const mediaClassification = computed(() => {
  const libraryCategory = mediaInfo.value?.library_category || mediaInfo.value?.category
  return [mediaInfo.value?.type || metaInfo.value?.type, libraryCategory].filter(Boolean).join(' · ') || '-'
})
const resourceChips = computed(() => {
  if (isMusicResult.value) {
    return [
      mediaInfo.value?.music_type,
      metaInfo.value?.audio_format,
      metaInfo.value?.audio_specs,
      mediaInfo.value?.metadata_category,
    ].filter(Boolean) as string[]
  }
  return [
    metaInfo.value?.web_source,
    metaInfo.value?.edition,
    metaInfo.value?.resource_pix,
    metaInfo.value?.video_encode,
    metaInfo.value?.audio_encode,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
// 是否已匹配到具体媒体，决定是否展示查看详情入口
const canViewMediaDetail = computed(() => Boolean(getMediaSubscribeIdentity(mediaInfo.value)))

/** 生成媒体源官方详情页地址。 */
function getMediaOfficialLink(media: MediaInfo, source: string, mediaId: string) {
  const encodedId = encodeURIComponent(mediaId)

  switch (source) {
    case 'themoviedb': {
      const mediaType = media.type?.trim().toLowerCase()
      return `https://www.themoviedb.org/${mediaType === '电影' || mediaType === 'movie' ? 'movie' : 'tv'}/${encodedId}`
    }
    case 'douban':
      return `https://movie.douban.com/subject/${encodedId}`
    case 'bangumi':
      return `https://bgm.tv/subject/${encodedId}`
    case 'anilist':
      return `https://anilist.co/anime/${encodedId}`
    case 'musicbrainz':
      // MusicBrainz 各实体共用 UUID，优先使用识别结果自带的详情页地址
      return media.detail_link || `https://musicbrainz.org/recording/${encodedId}`
    case 'theaudiodb':
      return media.detail_link || `https://www.theaudiodb.com/track/${encodedId}`
    case 'doubanmusic':
      return media.detail_link || `https://music.douban.com/subject/${encodedId}`
    default:
      return undefined
  }
}

/** 生成识别结果中的数据源原生 ID。 */
function getMediaIdentity(media?: MediaInfo): MediaIdentity | undefined {
  if (!media) return undefined

  const identity = getMediaSubscribeIdentity(media)
  if (!identity) return undefined

  return {
    id: identity.mediaId,
    link: getMediaOfficialLink(media, identity.source, identity.mediaId),
    source: MEDIA_SOURCE_LABELS[identity.source] || identity.source,
    sourceKey: identity.source,
  }
}

const mediaIdentity = computed(() => getMediaIdentity(mediaInfo.value))
const recognizedMediaSource = computed<MediaSourceDisplay>(() => {
  const sourceKey = mediaIdentity.value?.sourceKey || nameTestForm.source
  const iconInfo = MEDIA_SOURCE_ICONS[sourceKey]

  return {
    icon: iconInfo?.icon,
    iconColor: iconInfo?.color,
    image: MEDIA_SOURCE_LOGOS[sourceKey],
    key: sourceKey,
    label: mediaIdentity.value?.source || MEDIA_SOURCE_LABELS[sourceKey] || sourceKey,
  }
})

const pipelineSteps = computed<PipelineStep[]>(() => [
  {
    icon: 'mdi-file-document-outline',
    title: t('nameTest.steps.original.title'),
    value: metaInfo.value?.org_string || nameTestForm.title || '-',
  },
  {
    icon: 'mdi-puzzle-check-outline',
    title: t('nameTest.steps.meta.title'),
    value: isMusicResult.value
      ? // 音乐元信息展示曲名、艺术家、专辑和音频格式
        [metaInfo.value?.title, metaInfo.value?.artist, metaInfo.value?.album, metaInfo.value?.audio_format]
          .filter(Boolean)
          .join(' · ') || '-'
      : [metaInfo.value?.name, metaInfo.value?.resource_term, metaInfo.value?.release_group]
          .filter(Boolean)
          .join(' · ') || '-',
  },
  {
    icon: 'mdi-shape-outline',
    title: t('nameTest.steps.classification.title'),
    value: mediaClassification.value,
  },
  {
    icon: 'mdi-database-search-outline',
    source: recognizedMediaSource.value,
    title: t('nameTest.steps.source.title'),
    value: recognizedMediaSource.value.label,
  },
  {
    icon: 'mdi-identifier',
    identity: mediaIdentity.value,
    title: t('nameTest.steps.media.title'),
    value: mediaIdentity.value?.id || t('nameTest.unrecognized'),
  },
])

const transferPreviewCopyText = computed(
  () => transferPreview.value?.full_path || transferPreview.value?.rename_path || '',
)

const transferPreviewItems = computed<TransferPreviewItem[]>(() => {
  const preview = transferPreview.value
  if (!preview) return []

  const items: TransferPreviewItem[] = [
    {
      icon: 'mdi-folder-outline',
      key: 'category',
      label: t('nameTest.transferPreview.category'),
      muted: !preview.category,
      value: preview.category || t('nameTest.transferPreview.noCategory'),
    },
  ]
  if (preview.target_dir) {
    items.push({
      icon: 'mdi-folder-star-outline',
      key: 'targetDir',
      label: t('nameTest.transferPreview.targetDir'),
      monospace: true,
      value: preview.target_dir,
    })
  }
  if (preview.file_name) {
    items.push({
      icon: 'mdi-file-video-outline',
      key: 'fileName',
      label: t('nameTest.transferPreview.fileName'),
      monospace: true,
      value: preview.file_name,
    })
  }
  if (preview.full_path) {
    items.push({
      icon: 'mdi-file-tree-outline',
      key: 'fullPath',
      label: t('nameTest.transferPreview.fullPath'),
      monospace: true,
      value: preview.full_path,
    })
  } else if (preview.rename_path) {
    items.push({
      icon: 'mdi-file-tree-outline',
      key: 'renamePath',
      label: t('nameTest.transferPreview.renamePath'),
      monospace: true,
      value: preview.rename_path,
    })
  }
  return items
})

const showTransferPreviewSection = computed(
  () =>
    showResult.value &&
    isRecognized.value &&
    (transferPreviewLoading.value || Boolean(transferPreviewError.value) || Boolean(transferPreview.value)),
)

/** 检查整理预览接口返回值是否包含至少一项可展示字段。 */
function hasTransferPreviewContent(preview?: TransferNamePreview | null): preview is TransferNamePreview {
  if (!preview || typeof preview !== 'object') return false
  return Boolean(
    preview.category || preview.target_dir || preview.file_name || preview.rename_path || preview.full_path,
  )
}

/** 异步拉取按当前重命名模板与目录配置生成的整理预览。 */
async function loadTransferPreview(seq: number, snapshot: TransferPreviewRequestSnapshot, recognizedMedia: MediaInfo) {
  transferPreviewLoading.value = true
  transferPreviewError.value = ''
  transferPreview.value = null

  const identity = getMediaSubscribeIdentity(recognizedMedia)
  try {
    const preview = await api.get<TransferNamePreview | undefined, TransferNamePreview | undefined>(
      'transfer/name/preview',
      {
        params: {
          title: snapshot.title,
          subtitle: snapshot.subtitle || undefined,
          custom_words: snapshot.customWords,
          media_source: identity?.source || snapshot.source,
          media_id: identity?.mediaId,
          mtype: recognizedMedia.type || undefined,
          music_type: recognizedMedia.music_type || undefined,
        },
        feedback: 'silent',
      },
    )
    if (seq !== transferPreviewRequestSeq) return
    if (hasTransferPreviewContent(preview)) {
      transferPreview.value = preview
    }
  } catch (error) {
    if (seq !== transferPreviewRequestSeq) return
    console.error(error)
    transferPreviewError.value =
      error instanceof Error && error.message ? error.message : t('nameTest.transferPreview.failed')
  } finally {
    if (seq === transferPreviewRequestSeq) {
      transferPreviewLoading.value = false
    }
  }
}

/** 复制整理预览中的完整目标路径或相对路径。 */
async function copyTransferPreviewPath() {
  const pathText = transferPreviewCopyText.value
  if (!pathText) return
  try {
    const copied = await copyToClipboard(pathText)
    if (copied) {
      $toast.success(t('nameTest.transferPreview.copied'))
    } else {
      $toast.error(t('nameTest.transferPreview.copyFailed'))
    }
  } catch (error) {
    console.error(error)
    $toast.error(t('nameTest.transferPreview.copyFailed'))
  }
}

/** 将 TMDB 原始图片地址转换为弹窗内更轻量的海报缩略图。 */
function getPosterImage(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

/** 关闭识别测试弹窗后，跳转查看当前识别结果匹配到的媒体详情。 */
async function viewMediaDetail() {
  if (!canViewMediaDetail.value || !mediaInfo.value) return
  const identity = getMediaSubscribeIdentity(mediaInfo.value)
  if (!identity) return

  const target = {
    path: '/media',
    query: {
      media_source: identity.source,
      media_id: identity.mediaId,
      title: mediaInfo.value.title,
      year: mediaInfo.value.year,
      type: mediaInfo.value.type,
    },
  }

  emit('close')
  await nextTick()
  await router.push(target)
}

/** 调用媒体识别接口并刷新解析工作台，输入的识别词会临时应用于本次识别测试。 */
async function nameTest() {
  const normalizedTitle = nameTestForm.title?.trim() || ''
  if (!normalizedTitle) return

  nameTestForm.title = normalizedTitle
  const previewSeq = ++transferPreviewRequestSeq
  const requestSnapshot: TransferPreviewRequestSnapshot = {
    title: normalizedTitle,
    subtitle: nameTestForm.subtitle,
    // 音乐识别不应用识别词，隐藏状态下不随请求携带
    customWords: showCustomWords.value ? nameTestForm.customWords?.trim() || undefined : undefined,
    source: nameTestForm.source,
  }

  try {
    nameTestLoading.value = true
    nameTestText.value = t('nameTest.recognizing')
    nameTestError.value = ''
    showResult.value = false
    transferPreview.value = null
    transferPreviewError.value = ''
    transferPreviewLoading.value = false
    const result = await api.get<Context, Context>('media/recognize', {
      params: {
        title: requestSnapshot.title,
        subtitle: requestSnapshot.subtitle,
        custom_words: requestSnapshot.customWords,
        media_source: requestSnapshot.source,
      },
    })
    if (previewSeq !== transferPreviewRequestSeq) return
    nameTestResult.value = result
    nameTestText.value = t('nameTest.recognizeAgain')
    showResult.value = true
    if (result?.media_info) {
      void loadTransferPreview(previewSeq, requestSnapshot, result.media_info)
    }
  } catch (error) {
    console.error(error)
    nameTestError.value = error instanceof Error ? error.message : t('nameTest.requestFailed')
  } finally {
    nameTestLoading.value = false
  }
}

/** 将识别词文本拆分为按行的规则列表，过滤空白行与仅供临时引用的 @global 占位符。 */
function parseCustomWordLines(text: string) {
  return text.split('\n').filter(line => {
    const trimmed = line.trim()
    return trimmed.length > 0 && trimmed.toLowerCase() !== '@global'
  })
}

/** 将当前输入的识别词追加保存到系统识别词表末尾。 */
async function saveCustomWords() {
  if (savingCustomWords.value) return

  const newLines = parseCustomWordLines(nameTestForm.customWords || '')
  if (!newLines.length) return

  savingCustomWords.value = true
  try {
    const existingLines = await listCustomIdentifiers()
    const appendLines = newLines.filter(line => !existingLines.includes(line))

    if (!appendLines.length) {
      $toast.warning(t('nameTest.saveWordsNoChange'))
      return
    }

    await replaceCustomIdentifiers([...existingLines, ...appendLines], existingLines)
    $toast.success(t('nameTest.saveWordsSuccess'))
  } catch (error) {
    console.error(error)
    $toast.error(t('nameTest.saveWordsFailed'))
  } finally {
    savingCustomWords.value = false
  }
}
</script>

<template>
  <div class="shortcut-workbench">
    <section class="shortcut-panel shortcut-input-panel">
      <VForm validate-on="submit lazy" @submit.prevent="nameTest">
        <VRow class="shortcut-form">
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.title"
              :label="t('nameTest.title')"
              :hint="t('nameTest.titleHint')"
              persistent-hint
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-movie-open"
              rows="2"
              auto-grow
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VSelect
              v-model="nameTestForm.source"
              :items="mediaSourceItems"
              :label="t('nameTest.source')"
              :hint="t('nameTest.sourceHint')"
              persistent-hint
              prepend-inner-icon="mdi-database-search"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.subtitle"
              :label="t('nameTest.subtitle')"
              :hint="t('nameTest.subtitleHint')"
              persistent-hint
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-subtitles"
            />
          </VCol>
          <VCol v-if="showCustomWords" cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="nameTestForm.customWords"
              :label="t('nameTest.customWords')"
              :placeholder="t('nameTest.customWordsPlaceholder')"
              :hint="t('nameTest.customWordsHint')"
              persistent-hint
              rows="3"
              auto-grow
              prepend-inner-icon="mdi-tag-text-outline"
            />
            <div class="custom-words-toolbar">
              <VBtn
                type="button"
                size="small"
                variant="tonal"
                color="primary"
                :disabled="!nameTestForm.customWords?.trim()"
                :loading="savingCustomWords"
                @click="saveCustomWords"
              >
                <template #prepend>
                  <VIcon icon="mdi-content-save-outline" />
                </template>
                {{ t('nameTest.saveWords') }}
              </VBtn>
            </div>
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VBtn block type="submit" :disabled="nameTestLoading" :loading="nameTestLoading">
              <template #prepend>
                <VIcon icon="mdi-movie-search-outline" />
              </template>
              {{ nameTestText }}
            </VBtn>
          </VCol>
        </VRow>
      </VForm>

      <VAlert
        v-if="nameTestError"
        class="mt-4"
        density="comfortable"
        icon="mdi-alert-circle-outline"
        type="error"
        variant="tonal"
      >
        {{ nameTestError }}
      </VAlert>
    </section>

    <section class="shortcut-panel shortcut-result-panel">
      <div v-if="showResult" class="result-stack">
        <div class="result-hero" :class="{ 'result-hero--failed': !isRecognized }">
          <div v-if="mediaInfo?.poster_path" class="hero-poster">
            <VImg :src="getPosterImage(mediaInfo.poster_path)" aspect-ratio="2/3" cover>
              <template #placeholder>
                <VSkeletonLoader class="h-100 w-100" />
              </template>
            </VImg>
          </div>
          <div v-else class="hero-poster hero-poster--empty">
            <VIcon :icon="isRecognized ? 'mdi-movie-open-check' : 'mdi-movie-open-remove'" size="32" />
          </div>

          <div class="min-w-0 hero-body">
            <div class="hero-heading">
              <VIcon v-if="!isRecognized" icon="mdi-alert-circle-outline" color="primary" size="20" />
              <span class="hero-title-text text-subtitle-1 font-weight-bold text-truncate">{{ resultTitle }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{ resultSubtitle }}
            </div>
            <div v-if="resourceChips.length" class="hero-chips mt-3">
              <VChip
                v-for="chip in resourceChips"
                :key="chip"
                class="hero-chip"
                color="primary"
                size="small"
                variant="tonal"
              >
                {{ chip }}
              </VChip>
            </div>
            <p v-if="mediaInfo?.overview" class="hero-overview text-body-2 text-medium-emphasis mt-3">
              {{ mediaInfo.overview }}
            </p>
            <VBtn
              v-if="canViewMediaDetail"
              class="mt-3"
              size="small"
              variant="tonal"
              color="primary"
              append-icon="mdi-chevron-right"
              @click="viewMediaDetail"
            >
              {{ t('common.viewDetails') }}
            </VBtn>
          </div>
        </div>

        <div class="pipeline">
          <div v-for="(step, idx) in pipelineSteps" :key="step.title" class="pipeline-step">
            <div class="pipeline-marker">
              <VIcon :icon="step.icon" color="primary" size="18" />
              <span v-if="idx < pipelineSteps.length - 1" class="pipeline-connector" />
            </div>
            <div class="pipeline-body">
              <div class="text-caption text-medium-emphasis pipeline-label">
                {{ step.title }}
              </div>
              <div class="text-body-2 font-weight-medium pipeline-value">
                <span
                  v-if="step.source"
                  class="media-source-display"
                  :aria-label="step.source.label"
                  :data-source="step.source.key"
                  :title="step.source.label"
                  data-testid="recognition-source"
                >
                  <VImg
                    v-if="step.source.image"
                    class="media-source-logo"
                    :src="step.source.image"
                    :alt="step.source.label"
                  />
                  <VIcon
                    v-else-if="step.source.icon"
                    class="media-source-logo"
                    :color="step.source.iconColor || '#02a9ff'"
                    :icon="step.source.icon"
                  />
                  <span>{{ step.source.label }}</span>
                </span>
                <template v-else-if="step.identity">
                  <a
                    v-if="step.identity.link"
                    class="media-id-link"
                    :href="step.identity.link"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click.stop
                  >
                    {{ step.identity.id }}
                  </a>
                  <span v-else>{{ step.identity.id }}</span>
                </template>
                <template v-else>{{ step.value }}</template>
              </div>
            </div>
          </div>
        </div>

        <div v-if="showTransferPreviewSection" class="transfer-preview" data-testid="transfer-preview">
          <div class="transfer-preview-header">
            <div class="transfer-preview-title text-caption text-medium-emphasis">
              <VIcon icon="mdi-folder-move-outline" size="16" />
              <span>{{ t('nameTest.transferPreview.title') }}</span>
            </div>
            <VBtn
              v-if="transferPreviewCopyText"
              type="button"
              size="x-small"
              variant="text"
              color="primary"
              prepend-icon="mdi-content-copy"
              @click="copyTransferPreviewPath"
            >
              {{ t('nameTest.transferPreview.copyPath') }}
            </VBtn>
          </div>

          <div v-if="transferPreviewLoading" class="transfer-preview-state text-body-2 text-medium-emphasis">
            <VProgressCircular indeterminate size="16" width="2" color="primary" />
            <span>{{ t('nameTest.transferPreview.loading') }}</span>
          </div>

          <div v-else-if="transferPreviewError" class="transfer-preview-state text-body-2 text-medium-emphasis">
            <VIcon icon="mdi-information-outline" size="16" />
            <span>{{ transferPreviewError }}</span>
          </div>

          <dl v-else-if="transferPreviewItems.length" class="transfer-preview-list">
            <div
              v-for="item in transferPreviewItems"
              :key="item.key"
              class="transfer-preview-row"
              :data-preview-field="item.key"
            >
              <dt class="transfer-preview-label text-caption text-medium-emphasis">
                <VIcon :icon="item.icon" size="15" />
                <span>{{ item.label }}</span>
              </dt>
              <dd
                class="transfer-preview-value text-body-2 font-weight-medium"
                :class="{
                  'transfer-preview-value--mono': item.monospace,
                  'text-medium-emphasis': item.muted,
                }"
              >
                {{ item.value }}
              </dd>
            </div>
          </dl>
        </div>

        <div v-if="metaInfo?.apply_words?.length" class="applied-words">
          <div class="text-caption text-medium-emphasis applied-words-label">
            {{ t('nameTest.steps.words.title') }}
          </div>
          <div class="words-chips">
            <VChip v-for="word in metaInfo.apply_words" :key="word" size="small" variant="tonal">
              {{ word }}
            </VChip>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <VIcon icon="mdi-movie-search-outline" size="36" />
        <div class="text-body-2 text-medium-emphasis">
          {{ t('nameTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.shortcut-workbench {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  padding-block: 0.25rem 1rem;
}

.shortcut-panel {
  padding: 0;
  border: 0;
  border-radius: 0;
  backdrop-filter: none;
  background: transparent;
  box-shadow: none;
}

/* 桌面用分栏分隔，窄屏的输入与结果按阅读顺序纵向排列。 */
.shortcut-result-panel {
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-inline-start: 1.5rem;
}

.shortcut-form {
  margin: 0;
}

.shortcut-form-col {
  padding-inline: 0;
}

.shortcut-form-col:first-child {
  padding-block-start: 0;
}

.shortcut-form-col:last-child {
  padding-block-end: 0;
}

.custom-words-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-block-start: 0.5rem;
}

.result-stack {
  display: grid;
  gap: 1.5rem;
}

.result-hero {
  display: grid;
  align-items: start;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  gap: 1rem;
  grid-template-columns: 4.25rem minmax(0, 1fr);
}

.hero-poster {
  overflow: hidden;
  border: 0;
  border-radius: 0.75rem;
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.hero-poster--empty {
  display: grid;
  place-items: center;
}

.hero-body {
  min-inline-size: 0;
}

.hero-heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hero-title-text {
  min-inline-size: 0;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.hero-chip {
  max-inline-size: 100%;
}

.hero-overview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.5;
}

/* stylelint-disable selector-pseudo-class-no-unknown -- Vue scoped 样式需要穿透 Vuetify 子组件。 */
.hero-chips :deep(.v-chip) {
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
}

.pipeline-marker :deep(.text-primary) {
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
}
/* stylelint-enable selector-pseudo-class-no-unknown */

.pipeline {
  display: flex;
  flex-direction: column;
}

.pipeline-step {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1.75rem minmax(0, 1fr);
}

.pipeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-block-size: 100%;
}

.pipeline-connector {
  flex: 1;
  background: rgba(var(--v-theme-on-surface), 0.12);
  inline-size: 1px;
  margin-block-start: 0.3rem;
}

.pipeline-body {
  min-inline-size: 0;
  padding-block-end: 1.15rem;
}

.pipeline-step:last-child .pipeline-body {
  padding-block-end: 0;
}

.pipeline-label {
  letter-spacing: 0.02em;
}

.pipeline-value {
  margin-block-start: 0.2rem;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.media-id-link {
  color: var(--mp-primary-fg);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.media-source-display {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.media-source-logo {
  flex: 0 0 1.4rem;
  block-size: 1.4rem;
  inline-size: 1.4rem;
}

.transfer-preview {
  display: grid;
  border-block-start: var(--app-surface-border);
  gap: 0.75rem;
  padding-block-start: 1rem;
}

.transfer-preview-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.transfer-preview-title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  letter-spacing: 0.02em;
}

.transfer-preview-state {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.transfer-preview-list {
  display: grid;
  padding: 0;
  margin: 0;
  gap: 0.65rem;
}

.transfer-preview-row {
  display: grid;
  gap: 0.2rem;
}

.transfer-preview-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  letter-spacing: 0.02em;
}

.transfer-preview-value {
  margin: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.transfer-preview-value--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  line-height: 1.45;
}

.applied-words {
  display: grid;
  border-block-start: var(--app-surface-border);
  gap: 0.5rem;
  padding-block: 0.4rem;
}

.applied-words-label {
  letter-spacing: 0.02em;
}

.words-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.empty-state {
  display: grid;
  align-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 0.5rem;
  min-block-size: 8rem;
  place-items: center;
  text-align: center;
}

@media (width <= 760px) {
  .shortcut-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .shortcut-result-panel {
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-inline-start: 0;
    padding-block-start: 1.5rem;
    padding-inline-start: 0;
  }

  .hero-heading {
    flex-wrap: wrap;
  }

  .hero-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}
</style>
