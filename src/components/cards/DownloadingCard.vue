<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import noImage from '@images/no-image.jpeg'
import { useI18n } from 'vue-i18n'

// 输入参数
const props = defineProps({
  info: Object as PropType<DownloadingInfo>,
  downloaderName: String,
})

const { t } = useI18n()

// 是否显示卡片
const cardState = ref(true)

// 当前操作，避免轮询刷新期间重复触发控制请求。
const pendingAction = ref<'delete' | 'toggle' | null>(null)

const media = computed(() => props.info?.media ?? {})

const imageLoadError = ref(false)

watch(
  () => media.value.image,
  () => {
    imageLoadError.value = false
  },
)

const imageUrl = computed(() => {
  if (!media.value.image || imageLoadError.value) return noImage
  return media.value.image
})

// 识别信息可能不完整，依次回退到解析名称和原始任务名。
const mediaTitle = computed(() => media.value.title || props.info?.name || props.info?.title || t('common.unknown'))

const episodeText = computed(() => {
  const recognizedEpisode = [media.value.season, media.value.episode].filter(Boolean).join(' ')
  return recognizedEpisode || props.info?.season_episode || ''
})

const titleMetaText = computed(() => [props.info?.year?.trim(), episodeText.value].filter(Boolean).join(' · '))

const mediaTypeText = computed(() => {
  const type = media.value.type?.trim()
  if (type === '电影' || type?.toLowerCase() === 'movie') return t('mediaType.movie')
  if (type === '电视剧' || type?.toLowerCase() === 'tv') return t('mediaType.tv')
  return type || t('mediaType.unknown')
})

const mediaTypeIcon = computed(() => {
  const type = media.value.type?.trim().toLowerCase()
  if (type === '电影' || type === 'movie') return 'mdi-movie-outline'
  if (type === '电视剧' || type === 'tv') return 'mdi-television-classic'
  return 'mdi-help-circle-outline'
})

const sourceSiteText = computed(() => props.info?.site_name?.trim() || t('downloading.unknownSite'))

// 规范异常进度，避免进度条或百分比超出卡片。
const progressValue = computed(() => {
  const progress = Number(props.info?.progress ?? 0)
  if (!Number.isFinite(progress)) return 0
  return Math.min(Math.max(progress, 0), 100)
})

const progressText = computed(() => `${Math.round(progressValue.value)}%`)

function formatSpeed(speed?: string) {
  const value = speed?.trim() || '0 B'
  return /\/s$/i.test(value) ? value : `${value}/s`
}

const sizeText = computed(() => formatFileSize(props.info?.size || 0))
const downloadSpeedText = computed(() => formatSpeed(props.info?.dlspeed))
const uploadSpeedText = computed(() => formatSpeed(props.info?.upspeed))
const remainingTimeText = computed(() => props.info?.left_time?.trim() || t('downloading.calculating'))

// 下载状态
const isDownloading = ref(props.info?.state === 'downloading')

// 监听props.info?.state的变化
watch(
  () => props.info?.state,
  newValue => {
    isDownloading.value = newValue === 'downloading'
  },
)

// 下载状态控制
async function toggleDownload() {
  if (pendingAction.value) return

  const operation = isDownloading.value ? 'stop' : 'start'
  pendingAction.value = 'toggle'
  try {
    const result: ApiResponse<unknown> = await api.get(`download/${operation}/${props.info?.hash}`, {
      params: {
        name: props.downloaderName,
      },
    })

    if (result.success) isDownloading.value = !isDownloading.value
  } catch (error) {
    console.error(error)
  } finally {
    pendingAction.value = null
  }
}

// 删除下载任务
async function deleteDownload() {
  if (pendingAction.value) return

  pendingAction.value = 'delete'
  try {
    const result: ApiResponse<unknown> = await api.delete(`download/${props.info?.hash}`, {
      params: { name: props.downloaderName },
    })
    if (result.success) cardState.value = false
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
        <VCard
          :key="props.info?.hash"
          class="downloading-card app-hover-lift-card app-surface h-full overflow-hidden"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
            'downloading-card--hovering': hover.isHovering,
          }"
        >
          <div class="downloading-card__poster">
            <VImg :src="imageUrl" class="downloading-card__image" cover position="top" @error="imageLoadError = true">
              <template #placeholder>
                <div class="downloading-card__image-placeholder">
                  <VSkeletonLoader class="h-full" />
                </div>
              </template>
            </VImg>
            <div class="downloading-card__poster-scrim" />
            <div class="downloading-card__poster-progress">{{ progressText }}</div>
          </div>

          <div class="downloading-card__body">
            <div class="downloading-card__chips">
              <VChip color="primary" size="x-small" variant="tonal" :prepend-icon="mediaTypeIcon">
                {{ mediaTypeText }}
              </VChip>
              <VChip size="x-small" variant="tonal" prepend-icon="mdi-web">
                {{ sourceSiteText }}
              </VChip>
            </div>

            <div class="downloading-card__heading">
              <div class="downloading-card__title" :title="mediaTitle">
                {{ mediaTitle }}
                <span v-if="titleMetaText" class="downloading-card__title-meta">{{ titleMetaText }}</span>
              </div>
              <div class="downloading-card__torrent-title" :title="props.info?.title">
                {{ props.info?.title || t('common.unknown') }}
              </div>
            </div>

            <div class="downloading-card__progress">
              <div class="downloading-card__progress-label">
                <span>{{ isDownloading ? t('downloading.statusDownloading') : t('downloading.statusPaused') }}</span>
                <span>{{ progressText }}</span>
              </div>
              <VProgressLinear
                :aria-label="t('downloading.progress')"
                :model-value="progressValue"
                color="primary"
                bg-color="surface-variant"
                height="6"
                rounded
              />
            </div>

            <div class="downloading-card__stats">
              <div class="downloading-card__stat">
                <VIcon icon="mdi-harddisk" size="16" />
                <span class="downloading-card__stat-label">{{ t('downloading.size') }}</span>
                <strong :title="sizeText">{{ sizeText }}</strong>
              </div>
              <div class="downloading-card__stat downloading-card__stat--download">
                <VIcon icon="mdi-arrow-down" size="16" />
                <span class="downloading-card__stat-label">{{ t('downloading.downloadSpeed') }}</span>
                <strong :title="downloadSpeedText">{{ downloadSpeedText }}</strong>
              </div>
              <div class="downloading-card__stat downloading-card__stat--upload">
                <VIcon icon="mdi-arrow-up" size="16" />
                <span class="downloading-card__stat-label">{{ t('downloading.uploadSpeed') }}</span>
                <strong :title="uploadSpeedText">{{ uploadSpeedText }}</strong>
              </div>
            </div>

            <VCardActions class="downloading-card__actions pa-0">
              <div class="downloading-card__remaining">
                <VIcon icon="mdi-timer-sand" size="16" />
                <span>{{ t('downloading.remainingTime') }}</span>
                <strong>{{ remainingTimeText }}</strong>
              </div>
              <div class="downloading-card__buttons">
                <VBtn
                  :aria-label="isDownloading ? t('downloading.pauseTask') : t('downloading.resumeTask')"
                  :disabled="pendingAction === 'delete'"
                  :icon="isDownloading ? 'mdi-pause' : 'mdi-play'"
                  :loading="pendingAction === 'toggle'"
                  color="primary"
                  size="small"
                  variant="tonal"
                  @click="toggleDownload"
                >
                  <VTooltip activator="parent" location="top">
                    {{ isDownloading ? t('downloading.pauseTask') : t('downloading.resumeTask') }}
                  </VTooltip>
                </VBtn>
                <VBtn
                  :aria-label="t('downloading.deleteTask')"
                  :disabled="pendingAction === 'toggle'"
                  :loading="pendingAction === 'delete'"
                  color="error"
                  icon="mdi-trash-can-outline"
                  size="small"
                  variant="text"
                  @click="deleteDownload"
                >
                  <VTooltip activator="parent" location="top">{{ t('downloading.deleteTask') }}</VTooltip>
                </VBtn>
              </div>
            </VCardActions>
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.downloading-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.downloading-card {
  display: grid;
  min-block-size: 15.5rem;
  grid-template-columns: 6.75rem minmax(0, 1fr);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  container-type: inline-size;
}

.downloading-card__poster {
  position: relative;
  overflow: hidden;
  min-block-size: 100%;
  background: rgb(var(--v-theme-surface-variant));
}

.downloading-card__image,
.downloading-card__image-placeholder {
  block-size: 100%;
  inline-size: 100%;
}

.downloading-card__image :deep(.v-img__img) {
  transition: transform 0.35s ease;
}

.downloading-card--hovering .downloading-card__image :deep(.v-img__img) {
  transform: scale(1.04);
}

.downloading-card__poster-scrim {
  position: absolute;
  z-index: 1;
  background: linear-gradient(180deg, rgba(4, 8, 14, 4%) 35%, rgba(4, 8, 14, 76%) 100%);
  inset: 0;
  pointer-events: none;
}

.downloading-card__poster-progress {
  position: absolute;
  z-index: 2;
  border: 1px solid rgba(255, 255, 255, 18%);
  border-radius: 999px;
  backdrop-filter: blur(10px);
  background: rgba(10, 15, 24, 62%);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  inset-block-end: 0.75rem;
  inset-inline-start: 0.75rem;
  line-height: 1;
  padding-block: 0.38rem;
  padding-inline: 0.55rem;
}

.downloading-card__body {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem;
}

.downloading-card__chips {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.4rem;
}

.downloading-card__chips :deep(.v-chip) {
  max-inline-size: 50%;
}

.downloading-card__chips :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__heading {
  min-inline-size: 0;
}

.downloading-card__title {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__title-meta {
  margin-inline-start: 0.35rem;
  color: rgb(var(--v-theme-primary));
  font-size: 0.8rem;
  font-weight: 650;
}

.downloading-card__torrent-title {
  display: -webkit-box;
  overflow: hidden;
  margin-block-start: 0.2rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.downloading-card__progress {
  min-inline-size: 0;
}

.downloading-card__progress-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 0.35rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
  font-weight: 600;
}

.downloading-card__progress-label span:last-child {
  color: rgb(var(--v-theme-primary));
  font-variant-numeric: tabular-nums;
}

.downloading-card__stats {
  display: grid;
  min-inline-size: 0;
  padding-block: 0.55rem;
  border-block: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.downloading-card__stat {
  display: grid;
  min-inline-size: 0;
  align-items: center;
  column-gap: 0.3rem;
  grid-template-columns: auto minmax(0, 1fr);
}

.downloading-card__stat + .downloading-card__stat {
  padding-inline-start: 0.55rem;
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.downloading-card__stat .v-icon {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.downloading-card__stat--download .v-icon {
  color: rgb(var(--v-theme-primary));
}

.downloading-card__stat--upload .v-icon {
  color: rgb(var(--v-theme-success));
}

.downloading-card__stat-label,
.downloading-card__stat strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__stat-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.65rem;
}

.downloading-card__stat strong {
  grid-column: 1 / -1;
  margin-block-start: 0.18rem;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.downloading-card__actions {
  display: flex;
  min-block-size: 2rem;
  align-items: center;
  justify-content: space-between;
  margin-block-start: auto;
  gap: 0.5rem;
}

.downloading-card__remaining {
  display: flex;
  overflow: hidden;
  min-inline-size: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
  gap: 0.3rem;
  white-space: nowrap;
}

.downloading-card__remaining strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-weight: 650;
  text-overflow: ellipsis;
}

.downloading-card__buttons {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.2rem;
}

@container (width <= 23rem) {
  .downloading-card__body {
    gap: 0.55rem;
    padding: 0.8rem;
  }

  .downloading-card__stat + .downloading-card__stat {
    padding-inline-start: 0.4rem;
  }

  .downloading-card__remaining > span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .downloading-card__image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
