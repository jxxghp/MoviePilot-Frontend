<script lang="ts" setup>
import api from '@/api'
import type { ApiResponse, DownloadingInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'

/** 卡片使用的下载任务信息，兼容接口已经返回但公共类型尚未声明的来源站点。 */
interface DownloadingCardInfo extends DownloadingInfo {
  site_name?: string
  trackers?: string[]
}

/** 正在下载任务卡片，负责展示任务状态并提供暂停、继续和删除操作。 */
const props = defineProps({
  info: Object as PropType<DownloadingCardInfo>,
  downloaderName: String,
})

const { t } = useI18n()

// 卡片在删除成功后就地隐藏，等待外层轮询同步任务列表。
const cardState = ref(true)
const pendingAction = ref<'delete' | 'toggle' | null>(null)
const imageLoadError = ref(false)
const media = computed(() => props.info?.media ?? {})

watch(
  () => media.value.poster,
  () => {
    imageLoadError.value = false
  },
)

const hasPosterImage = computed(() => Boolean(media.value.poster && !imageLoadError.value))

const mediaTitle = computed(() => media.value.title || props.info?.name || props.info?.title || t('common.unknown'))

const episodeText = computed(() => {
  const recognizedEpisode = [media.value.season, media.value.episode].filter(Boolean).join(' ')
  return recognizedEpisode || props.info?.season_episode || ''
})

const titleMetaText = computed(() => [props.info?.year?.trim(), episodeText.value].filter(Boolean).join(' · '))

const mediaTypeText = computed(() => {
  const type = String(media.value.type || '').trim()
  if (type === '电影' || type.toLowerCase() === 'movie') return t('mediaType.movie')
  if (type === '电视剧' || type.toLowerCase() === 'tv') return t('mediaType.tv')
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
  return 'mdi-play-box-outline'
})

const progressValue = computed(() => {
  const progress = Number(props.info?.progress ?? 0)
  if (!Number.isFinite(progress)) return 0
  return Math.min(Math.max(progress, 0), 100)
})

const progressText = computed(() => `${Math.round(progressValue.value)}%`)
const sizeText = computed(() => formatFileSize(props.info?.size || 0))
const remainingTimeText = computed(() => props.info?.left_time?.trim() || '--')

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

// 下载状态跟随轮询数据变化，操作成功时也会立即响应。
const isDownloading = ref(props.info?.state === 'downloading')

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

/** 删除当前下载任务，并仅在业务请求成功后隐藏卡片。 */
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
        <div
          class="downloading-card-shell app-hover-lift-card h-full"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
        >
          <VCard
            :key="props.info?.hash"
            class="downloading-card h-full overflow-hidden"
            :class="{ 'downloading-card--no-image': !hasPosterImage }"
          >
            <div v-if="hasPosterImage" class="downloading-card__poster">
              <VImg
                :src="media.poster"
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
                  <span>{{ mediaTitle }}</span>
                  <span v-if="titleMetaText" class="downloading-card__title-meta">{{ titleMetaText }}</span>
                </div>
                <div class="downloading-card__torrent-title" :title="props.info?.title">
                  {{ props.info?.title || t('common.unknown') }}
                </div>
              </div>

              <div class="downloading-card__chips">
                <VChip v-if="mediaTypeText" :prepend-icon="mediaTypeIcon" size="x-small" variant="tonal">
                  {{ mediaTypeText }}
                </VChip>
                <VChip prepend-icon="mdi-harddisk" size="x-small" variant="tonal">
                  {{ sizeText }}
                </VChip>
                <VChip v-if="sourceSiteText" prepend-icon="mdi-web" size="x-small" variant="tonal">
                  {{ sourceSiteText }}
                </VChip>
              </div>

              <div v-if="progressValue > 0" class="downloading-card__progress">
                <div class="downloading-card__progress-label">
                  <span>
                    {{ isDownloading ? t('common.download') : t('common.pause') }}
                    <span class="downloading-card__progress-separator">·</span>
                    {{ remainingTimeText }}
                  </span>
                  <strong>{{ progressText }}</strong>
                </div>
                <VProgressLinear
                  :aria-label="t('common.download')"
                  :model-value="progressValue"
                  :color="isDownloading ? 'success' : 'warning'"
                  bg-color="surface-variant"
                  height="6"
                  rounded
                />
              </div>

              <div class="downloading-card__footer">
                <div class="downloading-card__speeds">
                  <div class="downloading-card__speed downloading-card__speed--download">
                    <VIcon icon="mdi-arrow-down" size="16" />
                    <strong :title="downloadSpeedText">{{ downloadSpeedText }}</strong>
                  </div>
                  <div class="downloading-card__speed downloading-card__speed--upload">
                    <VIcon icon="mdi-arrow-up" size="16" />
                    <strong :title="uploadSpeedText">{{ uploadSpeedText }}</strong>
                  </div>
                </div>

                <VCardActions class="downloading-card__actions pa-0">
                  <VBtn
                    :aria-label="isDownloading ? t('common.pause') : t('common.download')"
                    :disabled="pendingAction === 'delete'"
                    icon
                    :loading="pendingAction === 'toggle'"
                    color="primary"
                    size="small"
                    variant="tonal"
                    @click="toggleDownload"
                  >
                    <VIcon :icon="isDownloading ? 'mdi-pause' : 'mdi-play'" />
                    <VTooltip activator="parent" location="top">
                      {{ isDownloading ? t('common.pause') : t('common.download') }}
                    </VTooltip>
                  </VBtn>
                  <VBtn
                    :aria-label="t('common.delete')"
                    :disabled="pendingAction === 'toggle'"
                    :loading="pendingAction === 'delete'"
                    color="error"
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
            </VCardText>
          </VCard>
        </div>
      </div>
    </template>
  </VHover>
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

.downloading-card {
  display: grid;
  min-block-size: 12rem;
  color: rgb(var(--v-theme-on-surface));
  grid-template-columns: 8rem minmax(0, 1fr);
}

.downloading-card__poster {
  position: relative;
  overflow: hidden;
  min-block-size: 12rem;
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
  gap: 0.55rem;
  padding: 0.875rem !important;
}

.downloading-card__chips {
  display: flex;
  min-inline-size: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.downloading-card__chips :deep(.v-chip) {
  flex: 0 1 auto;
  min-inline-size: 0;
  max-inline-size: 100%;
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
  display: -webkit-box;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.downloading-card__title-meta {
  margin-inline-start: 0.35rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.76rem;
  font-weight: 500;
  white-space: nowrap;
}

.downloading-card__torrent-title {
  display: -webkit-box;
  overflow: hidden;
  margin-block-start: 0.25rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: normal;
}

.downloading-card__progress {
  min-inline-size: 0;
}

.downloading-card__progress-label {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 0.4rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
  gap: 0.5rem;
}

.downloading-card__progress-label > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__progress-label strong {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-on-surface));
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
}

.downloading-card__progress-separator {
  padding-inline: 0.12rem;
}

.downloading-card__footer {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  justify-content: space-between;
  margin-block-start: auto;
  gap: 0.5rem;
}

.downloading-card__speeds {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.8rem;
  row-gap: 0.15rem;
}

.downloading-card__speed {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 0.25rem;
}

.downloading-card__speed strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.downloading-card__speed--download .v-icon {
  color: rgb(var(--v-theme-info));
}

.downloading-card__speed--upload .v-icon {
  color: rgb(var(--v-theme-success));
}

.downloading-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.1rem;
}

@container (width <= 25rem) {
  .downloading-card {
    min-block-size: 11rem;
    grid-template-columns: 7.333rem minmax(0, 1fr);
  }

  .downloading-card__poster {
    min-block-size: 11rem;
  }

  .downloading-card__body {
    gap: 0.45rem;
    padding: 0.65rem !important;
  }

  .downloading-card__chips {
    gap: 0.3rem;
  }

  .downloading-card__title {
    font-size: 0.92rem;
  }

  .downloading-card__torrent-title {
    font-size: 0.7rem;
  }

  .downloading-card__speeds {
    column-gap: 0.5rem;
  }

  .downloading-card__speed strong {
    font-size: 0.66rem;
  }
}

@container (width <= 21rem) {
  .downloading-card__body {
    padding-inline: 0.65rem !important;
  }

  .downloading-card__actions :deep(.v-btn) {
    block-size: 2.25rem;
    inline-size: 2.25rem;
  }
}

.downloading-card.downloading-card--no-image {
  min-block-size: 0;
  grid-template-columns: minmax(0, 1fr);
}
</style>
