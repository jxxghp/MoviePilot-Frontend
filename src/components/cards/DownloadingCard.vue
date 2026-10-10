<script lang="ts" setup>
import api from '@/api'
import type { DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'

const DownloadTaskSettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/DownloadTaskSettingsDialog.vue'),
)

/** 正在下载任务卡片，负责展示任务状态并提供设置、暂停、继续和删除操作。 */
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
  downloaderName: String,
  downloaderType: String,
})

const emit = defineEmits<{
  updated: []
}>()

const { t } = useI18n()
const createConfirm = useConfirm()
const globalSettingsStore = useGlobalSettingsStore()

// 卡片在删除成功后就地隐藏，等待外层轮询同步任务列表。
const cardState = ref(true)
const pendingAction = ref<'delete' | 'toggle' | null>(null)
const deleteConfirmationPending = ref(false)
const imageLoadError = ref(false)
const settingsDialog = ref(false)
const media = computed(() => props.info?.media ?? {})

watch(
  () => media.value.poster,
  () => {
    imageLoadError.value = false
  },
)

const posterUrl = computed(() =>
  getDisplayImageUrl(media.value.poster || '', globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)
const hasPosterImage = computed(() => Boolean(posterUrl.value && !imageLoadError.value))

const mediaTitle = computed(() => media.value.title || props.info?.name || props.info?.title || t('common.unknown'))
// 未识别任务的主标题会回退到种子名，此时不再重复展示同一行种子名。
const showTorrentTitle = computed(() => Boolean(props.info?.title) && props.info?.title !== mediaTitle.value)

const episodeText = computed(() => {
  const recognizedEpisode = [media.value.season, media.value.episode].filter(Boolean).join(' ')
  return recognizedEpisode || props.info?.season_episode || ''
})

const titleMetaText = computed(() => [props.info?.year?.trim(), episodeText.value].filter(Boolean).join(' · '))

const mediaTypeText = computed(() => {
  const type = String(media.value.type || '').trim()
  if (type === '电影' || type.toLowerCase() === 'movie') return t('mediaType.movie')
  if (type === '电视剧' || type.toLowerCase() === 'tv') return t('mediaType.tv')
  if (type === '音乐' || type.toLowerCase() === 'music') return t('mediaType.music')
  if (type) return type
  if (media.value.season || media.value.episode || props.info?.season_episode) return t('mediaType.tv')
  return media.value.title ? t('mediaType.movie') : ''
})

const mediaTypeIcon = computed(() => {
  const type = String(media.value.type || '')
    .trim()
    .toLowerCase()
  if (type === '电影' || type === 'movie') return 'mdi-movie-outline'
  if (type === '电视剧' || type === 'tv') return 'mdi-television-classic'
  if (type === '音乐' || type === 'music') return 'mdi-music-note'
  return 'mdi-play-box-outline'
})

const progressValue = computed(() => {
  const progress = Number(props.info?.progress ?? 0)
  if (!Number.isFinite(progress)) return 0
  return Math.min(Math.max(progress, 0), 100)
})

// 向下取整，避免 99.5% 以上的未完成任务提前显示为 100%。
const progressText = computed(() => `${Math.floor(progressValue.value)}%`)
const sizeText = computed(() => formatFileSize(props.info?.size || 0))

/** 从 Tracker 地址中仅提取可展示的主机名，避免暴露路径、查询参数或 passkey。 */
function getTrackerHostname(tracker?: string) {
  if (!tracker) return ''
  try {
    return new URL(tracker).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const sourceSiteText = computed(() => {
  const siteName = String(props.info?.site_name || media.value.site_name || '').trim()
  if (siteName) return siteName
  return props.info?.trackers?.map(getTrackerHostname).find(Boolean) || ''
})

/** 为下载器返回的速率补齐单位，并兼容已经包含每秒单位的值。 */
function formatSpeed(speed?: string) {
  const value = speed?.trim() || '0 B'
  return /\/s$/i.test(value) ? value : `${value}/s`
}

const downloadSpeedText = computed(() => formatSpeed(props.info?.dlspeed))
const uploadSpeedText = computed(() => formatSpeed(props.info?.upspeed))
const hasDownloadSpeed = computed(() => Number.parseFloat(props.info?.dlspeed || '') > 0)
const hasUploadSpeed = computed(() => Number.parseFloat(props.info?.upspeed || '') > 0)

// 下载状态跟随轮询数据变化，操作成功时也会立即响应。
const isDownloading = ref(props.info?.state === 'downloading')

/** 剩余时间只对下载中的任务有意义；下载器未给出时不展示占位符。 */
const remainingTimeText = computed(() => {
  const leftTime = props.info?.left_time?.trim()
  if (!isDownloading.value || !leftTime || leftTime === '--') return ''
  return t('downloading.remainingTime', { time: leftTime })
})
const stateText = computed(() =>
  isDownloading.value ? t('downloading.stateDownloading') : t('downloading.statePaused'),
)
const toggleActionText = computed(() => (isDownloading.value ? t('common.pause') : t('downloading.resume')))

watch(
  () => props.info?.state,
  newValue => {
    isDownloading.value = newValue === 'downloading'
  },
)

/** 暂停或继续当前任务，并防止请求完成前重复触发。 */
async function toggleDownload() {
  if (pendingAction.value) return

  const operation = isDownloading.value ? 'stop' : 'start'
  pendingAction.value = 'toggle'
  try {
    await api.get(`download/${operation}/${props.info?.hash}`, {
      params: {
        name: props.downloaderName,
      },
    })
    isDownloading.value = !isDownloading.value
  } catch (error) {
    console.error(error)
  } finally {
    pendingAction.value = null
  }
}

/** 确认删除当前下载任务及对应文件，并仅在业务请求成功后隐藏卡片。 */
async function deleteDownload() {
  if (pendingAction.value || deleteConfirmationPending.value) return

  deleteConfirmationPending.value = true
  try {
    const confirmed = await createConfirm({
      type: 'warn',
      title: t('common.confirm'),
      content: t('downloading.confirmDelete', {
        name: props.info?.title || props.info?.name || t('common.unknown'),
      }),
      confirmText: t('common.delete'),
    })
    if (!confirmed || pendingAction.value) return
  } finally {
    deleteConfirmationPending.value = false
  }

  pendingAction.value = 'delete'
  try {
    await api.delete(`download/${props.info?.hash}`, {
      params: { name: props.downloaderName },
    })
    cardState.value = false
  } catch (error) {
    console.error(error)
  } finally {
    pendingAction.value = null
  }
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-if="cardState" v-bind="hover.props" class="downloading-card-hover-area h-full">
        <div
          class="downloading-card-shell app-hover-lift-card h-full"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
        >
          <!-- 卡片高度固定为海报 2:3 的高度；无海报时去掉海报列但保持同一高度，网格行高一致。 -->
          <VCard
            :key="props.info?.hash"
            class="downloading-card h-full overflow-hidden"
            :class="{ 'downloading-card--no-image': !hasPosterImage }"
          >
            <div v-if="hasPosterImage" class="downloading-card__poster">
              <VImg
                :src="posterUrl"
                class="downloading-card__image"
                cover
                position="center"
                @error="imageLoadError = true"
              >
                <template #placeholder>
                  <VSkeletonLoader class="downloading-card__image-loader h-full" />
                </template>
              </VImg>
              <div class="downloading-card__poster-edge" />
            </div>

            <VCardText class="downloading-card__body">
              <div class="downloading-card__heading">
                <div class="downloading-card__title" :title="mediaTitle">
                  <span class="downloading-card__title-text">{{ mediaTitle }}</span>
                  <span v-if="titleMetaText" class="downloading-card__title-meta">{{ titleMetaText }}</span>
                </div>
                <div v-if="showTorrentTitle" class="downloading-card__torrent-title" :title="props.info?.title">
                  {{ props.info?.title }}
                </div>
              </div>

              <div class="downloading-card__meta">
                <span v-if="mediaTypeText" class="downloading-card__meta-item downloading-card__meta-type">
                  <VIcon :icon="mediaTypeIcon" size="14" />
                  {{ mediaTypeText }}
                </span>
                <span v-if="mediaTypeText" aria-hidden="true" class="downloading-card__meta-separator">·</span>
                <span class="downloading-card__meta-item downloading-card__meta-size">{{ sizeText }}</span>
                <template v-if="sourceSiteText">
                  <span aria-hidden="true" class="downloading-card__meta-separator">·</span>
                  <span class="downloading-card__meta-item downloading-card__meta-source" :title="sourceSiteText">
                    {{ sourceSiteText }}
                  </span>
                </template>
              </div>

              <!-- 速率与百分比同一行、状态与操作同一行，各行都保持单行，内容总高不超过海报高度。 -->
              <div
                class="downloading-card__progress"
                :class="isDownloading ? 'downloading-card__progress--active' : 'downloading-card__progress--paused'"
              >
                <div class="downloading-card__progress-label">
                  <div class="downloading-card__speeds">
                    <div
                      class="downloading-card__speed downloading-card__speed--download"
                      :class="{ 'downloading-card__speed--idle': !hasDownloadSpeed }"
                    >
                      <VIcon icon="mdi-arrow-down" size="14" />
                      <strong :title="downloadSpeedText">{{ downloadSpeedText }}</strong>
                    </div>
                    <div
                      class="downloading-card__speed downloading-card__speed--upload"
                      :class="{ 'downloading-card__speed--idle': !hasUploadSpeed }"
                    >
                      <VIcon icon="mdi-arrow-up" size="14" />
                      <strong :title="uploadSpeedText">{{ uploadSpeedText }}</strong>
                    </div>
                  </div>
                  <strong class="downloading-card__progress-value">{{ progressText }}</strong>
                </div>
                <VProgressLinear
                  :aria-label="stateText"
                  :model-value="progressValue"
                  :color="isDownloading ? 'info' : 'warning'"
                  bg-color="surface-variant"
                  height="4"
                  rounded
                />

                <div class="downloading-card__footer">
                  <div class="downloading-card__progress-copy">
                    <span class="downloading-card__progress-state">
                      <VIcon :icon="isDownloading ? 'mdi-download' : 'mdi-pause'" size="14" />
                      {{ stateText }}
                    </span>
                    <span v-if="remainingTimeText" class="downloading-card__progress-remaining">
                      <span aria-hidden="true" class="downloading-card__progress-separator">·</span>
                      {{ remainingTimeText }}
                    </span>
                  </div>

                  <VCardActions class="downloading-card__actions pa-0">
                    <VBtn
                      :aria-label="toggleActionText"
                      :disabled="pendingAction === 'delete'"
                      icon
                      :loading="pendingAction === 'toggle'"
                      :color="isDownloading ? 'info' : 'warning'"
                      size="small"
                      variant="tonal"
                      @click="toggleDownload"
                    >
                      <VIcon :icon="isDownloading ? 'mdi-pause' : 'mdi-play'" />
                      <VTooltip activator="parent" location="top">
                        {{ toggleActionText }}
                      </VTooltip>
                    </VBtn>
                    <VBtn
                      :aria-label="t('downloading.settings.title')"
                      :disabled="Boolean(pendingAction) || !props.info?.hash"
                      icon
                      size="small"
                      variant="text"
                      @click="settingsDialog = true"
                    >
                      <VIcon icon="mdi-tune-variant" />
                      <VTooltip activator="parent" location="top">{{ t('downloading.settings.title') }}</VTooltip>
                    </VBtn>
                    <VBtn
                      :aria-label="t('common.delete')"
                      class="downloading-card__delete-action"
                      color="on-surface"
                      :disabled="pendingAction === 'toggle' || deleteConfirmationPending"
                      :loading="pendingAction === 'delete'"
                      icon
                      size="small"
                      variant="text"
                      @click="deleteDownload"
                    >
                      <VIcon icon="mdi-trash-can-outline" />
                      <VTooltip activator="parent" location="top">{{ t('common.delete') }}</VTooltip>
                    </VBtn>
                  </VCardActions>
                </div>
              </div>
            </VCardText>
          </VCard>
        </div>
      </div>
    </template>
  </VHover>
  <DownloadTaskSettingsDialog
    v-if="settingsDialog && props.info"
    v-model="settingsDialog"
    :task="props.info"
    :downloader-name="props.downloaderName"
    :downloader-type="props.downloaderType"
    @saved="emit('updated')"
  />
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.downloading-card-hover-area {
  block-size: 100%;
  container-type: inline-size;
  inline-size: 100%;
}

.downloading-card-shell {
  border-radius: var(--app-surface-radius);
}

// 海报列宽与卡片高度按 2:3 固定，海报不会因内容行数变化被拉长裁窄。
.downloading-card {
  --downloading-card-poster-width: 6rem;
  --downloading-card-height: 9rem;

  display: grid;
  block-size: var(--downloading-card-height);
  color: rgb(var(--v-theme-on-surface));
  grid-template-columns: var(--downloading-card-poster-width) minmax(0, 1fr);
}

.downloading-card.downloading-card--no-image {
  grid-template-columns: minmax(0, 1fr);
}

.downloading-card__poster {
  position: relative;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.downloading-card__image,
.downloading-card__image-loader {
  block-size: 100%;
  inline-size: 100%;
}

.downloading-card__poster-edge {
  position: absolute;
  background: linear-gradient(90deg, rgba(var(--v-theme-surface), 0) 72%, rgba(var(--v-theme-surface), 0.38));
  inset: 0;
  pointer-events: none;
}

.downloading-card__body {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.625rem 0.75rem !important;
}

.downloading-card__heading {
  min-inline-size: 0;
}

.downloading-card__title {
  display: flex;
  min-inline-size: 0;
  align-items: baseline;
  gap: 0.35rem;
  line-height: 1.3;
}

.downloading-card__title-text {
  overflow: hidden;
  min-inline-size: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__title-meta {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.downloading-card__torrent-title {
  overflow: hidden;
  margin-block-start: 0.125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__meta {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  gap: 0.35rem;
  line-height: 1.35;
  white-space: nowrap;
}

.downloading-card__meta-item {
  display: inline-flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.2rem;
}

.downloading-card__meta-type,
.downloading-card__meta-size,
.downloading-card__meta-separator {
  flex: 0 0 auto;
}

.downloading-card__meta-type {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-weight: 600;
}

.downloading-card__meta-source {
  overflow: hidden;
  flex: 1 1 auto;
  text-overflow: ellipsis;
}

.downloading-card__progress {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  // 标题与元信息靠上、进度区靠下，信息较少的卡片只在中间留白，不会把各行均匀拉散。
  margin-block-start: auto;
  gap: 0.3rem;

  --downloading-card-status-color: rgb(var(--v-theme-info));
}

.downloading-card__progress--paused {
  --downloading-card-status-color: rgb(var(--v-theme-warning));
}

.downloading-card__progress-label,
.downloading-card__footer {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.downloading-card__progress-value {
  flex: 0 0 auto;
  color: var(--downloading-card-status-color);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.downloading-card__speeds {
  display: flex;
  overflow: hidden;
  min-inline-size: 0;
  align-items: center;
  column-gap: 0.65rem;
}

.downloading-card__speed {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.15rem;
}

.downloading-card__speed strong {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__speed--download .v-icon {
  color: rgb(var(--v-theme-info));
}

.downloading-card__speed--download strong {
  color: rgb(var(--v-theme-on-surface));
  font-weight: 700;
}

.downloading-card__speed--upload .v-icon {
  color: rgb(var(--v-theme-success));
}

.downloading-card__speed--idle {
  opacity: 0.52;
}

.downloading-card__progress-copy {
  display: flex;
  overflow: hidden;
  min-inline-size: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  gap: 0.15rem;
}

.downloading-card__progress-state {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--downloading-card-status-color);
  font-weight: 650;
  gap: 0.2rem;
}

.downloading-card__progress-remaining {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__progress-separator {
  padding-inline: 0.12rem;
}

.downloading-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.125rem;
  min-block-size: 0;
}

.downloading-card__actions :deep(.v-btn) {
  block-size: 2rem;
  inline-size: 2rem;
}

.downloading-card__actions :deep(.v-btn .v-icon) {
  font-size: 1.125rem;
}

.downloading-card__delete-action {
  opacity: var(--v-medium-emphasis-opacity);
}

.downloading-card__delete-action:hover,
.downloading-card__delete-action:focus-visible {
  color: rgb(var(--v-theme-error)) !important;
  opacity: 1;
}

@container (width <= 21rem) {
  .downloading-card {
    --downloading-card-poster-width: 5.5rem;
    --downloading-card-height: 8.25rem;
  }

  .downloading-card__title-text {
    font-size: 0.95rem;
  }

  .downloading-card__speeds {
    column-gap: 0.45rem;
  }
}
</style>
