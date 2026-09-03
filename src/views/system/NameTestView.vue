<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useToast } from 'vue-toastification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context, MediaDataSource, MediaInfo } from '@/api/types'
import { getMediaSubscribeIdentity } from '@/composables/useMediaSubscribe'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { isMusicMediaSource } from '@/utils/mediaId'
import { useMediaSources } from '@/composables/useMediaSources'

interface PipelineStep {
  icon: string
  identity?: MediaIdentity
  source?: MediaSourceDisplay
  title: string
  value: string
}

interface MediaIdentity {
  id: string
  link?: string
  source: string
  sourceKey: string
}

interface MediaSourceDisplay {
  icon?: string
  iconColor?: string
  image?: string
  key: string
  label: string
}

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
const customMediaSourceItems = getMediaSourceItems('media')
const customMusicSourceItems = getMediaSourceItems('music')

const mediaSourceItems = computed<{ title: string; value: MediaDataSource }[]>(() => [
  { title: t('setting.cache.recognitionSource.themoviedb'), value: 'themoviedb' },
  { title: t('setting.cache.recognitionSource.douban'), value: 'douban' },
  { title: t('setting.cache.recognitionSource.bangumi'), value: 'bangumi' },
  { title: t('setting.cache.recognitionSource.anilist'), value: 'anilist' },
  { title: t('setting.cache.recognitionSource.musicbrainz'), value: 'musicbrainz' },
  { title: t('setting.cache.recognitionSource.theaudiodb'), value: 'theaudiodb' },
  { title: t('setting.cache.recognitionSource.doubanmusic'), value: 'doubanmusic' },
  ...customMediaSourceItems.value,
  ...customMusicSourceItems.value,
])

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

const metaInfo = computed(() => nameTestResult.value?.meta_info)
const mediaInfo = computed(() => nameTestResult.value?.media_info)
// 音乐识别的元信息没有 name 字段，依靠 title 判断识别是否成功
const isMusicResult = computed(() => mediaInfo.value?.type === '音乐' || metaInfo.value?.type === '音乐')
const isRecognized = computed(() => Boolean(metaInfo.value?.name || (isMusicResult.value && metaInfo.value?.title)))
const resultTitle = computed(() => mediaInfo.value?.title || metaInfo.value?.name || t('nameTest.unrecognized'))
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

  try {
    nameTestLoading.value = true
    nameTestText.value = t('nameTest.recognizing')
    nameTestError.value = ''
    showResult.value = false
    nameTestResult.value = await api.get<Context, Context>('media/recognize', {
      params: {
        title: nameTestForm.title,
        subtitle: nameTestForm.subtitle,
        // 音乐识别不应用识别词，隐藏状态下不随请求携带
        custom_words: showCustomWords.value ? nameTestForm.customWords?.trim() || undefined : undefined,
        media_source: nameTestForm.source,
      },
    })
    nameTestText.value = t('nameTest.recognizeAgain')
    showResult.value = true
  } catch (error) {
    console.error(error)
    nameTestError.value = error instanceof Error ? error.message : t('nameTest.requestFailed')
  } finally {
    nameTestLoading.value = false
  }
}

/** 将识别词文本拆分为按行的规则列表，过滤掉空白行。 */
function parseCustomWordLines(text: string) {
  return text.split('\n').filter(line => line.trim().length > 0)
}

/** 将当前输入的识别词追加保存到系统识别词表末尾。 */
async function saveCustomWords() {
  if (savingCustomWords.value) return

  const newLines = parseCustomWordLines(nameTestForm.customWords || '')
  if (!newLines.length) return

  savingCustomWords.value = true
  try {
    const queryResult: { [key: string]: any } = await api.get('system/setting/CustomIdentifiers')
    const existingLines: string[] = Array.isArray(queryResult?.value) ? queryResult.value : []
    const appendLines = newLines.filter(line => !existingLines.includes(line))

    if (!appendLines.length) {
      $toast.warning(t('nameTest.saveWordsNoChange'))
      return
    }

    await api.post<null>('system/setting/CustomIdentifiers', [...existingLines, ...appendLines], { feedback: 'silent' })
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
  gap: 1rem;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  padding-block-start: 0.5rem;
}

.shortcut-panel {
  padding: 1rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
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
  gap: 1rem;
}

.result-hero {
  display: grid;
  align-items: center;
  padding: 0.75rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-primary), 0.08);
  gap: 0.85rem;
  grid-template-columns: 5rem minmax(0, 1fr);
}

.result-hero--failed {
  background: rgba(var(--v-theme-error), 0.08);
}

.hero-poster {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-control-radius);
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-surface-variant), 0.35);
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
  background: rgba(var(--v-theme-primary), 0.25);
  inline-size: 2px;
  margin-block-start: 0.3rem;
}

.pipeline-body {
  min-inline-size: 0;
  padding-block-end: 0.9rem;
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
  color: rgb(var(--v-theme-primary));
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
  gap: 0.75rem;
  min-block-size: 14rem;
  place-items: center;
  text-align: center;
}

@media (width <= 760px) {
  .shortcut-workbench {
    grid-template-columns: minmax(0, 1fr);
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

@media (width <= 420px) {
  .shortcut-panel {
    padding: 0.8rem;
  }

  .result-hero {
    grid-template-columns: 4.25rem minmax(0, 1fr);
  }
}
</style>
