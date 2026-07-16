<script setup lang="ts">
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import { getMediaSubscribeId } from '@/composables/useMediaSubscribe'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { createBuiltInRecommendSources, type RecommendViewSource } from '@/utils/recommendSources'
import noImage from '@images/no-image.jpeg'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const globalSettingsStore = useGlobalSettingsStore()
const RECOMMEND_SOURCE_STORAGE_KEY = 'MP_DASHBOARD_RECOMMEND_SOURCE'
const RECOMMEND_SLIDE_COUNT = 5
const RECOMMEND_AUTOPLAY_INTERVAL = 8000

const sources = ref<RecommendViewSource[]>(
  createBuiltInRecommendSources(t).filter(source => source.apipath.startsWith('recommend/tmdb_')),
)
const storedSourcePath = localStorage.getItem(RECOMMEND_SOURCE_STORAGE_KEY)
const selectedSourcePath = ref(
  storedSourcePath && sources.value.some(source => source.apipath === storedSourcePath)
    ? storedSourcePath
    : sources.value[0].apipath,
)
const mediaItems = shallowRef<MediaInfo[]>([])
const mediaCache = new Map<string, MediaInfo[]>()
const activeIndex = ref(0)
const loading = ref(true)
const loadFailed = ref(false)
const isHovered = ref(false)
const isFocusWithin = ref(false)
const touchStartX = ref<number | null>(null)
let requestId = 0
let autoplayTimer: number | null = null
let isComponentActive = false

const selectedSource = computed(
  () => sources.value.find(source => source.apipath === selectedSourcePath.value) ?? sources.value[0],
)

const activeMedia = computed(() => mediaItems.value[activeIndex.value])

/** 根据推荐来源返回便于快速识别的媒体类别图标。 */
function getSourceIcon(source?: RecommendViewSource) {
  if (source?.apipath === 'recommend/tmdb_trending') return 'mdi-trending-up'
  if (source?.apipath === 'recommend/tmdb_movies') return 'mdi-movie-outline'
  if (source?.apipath.startsWith('recommend/tmdb_tvs')) return 'mdi-television-classic'
  return 'mdi-movie-open-star-outline'
}

/** 将不同接口包装格式归一化为媒体数组。 */
function normalizeMediaResponse(response: unknown): MediaInfo[] {
  if (Array.isArray(response)) return response
  if (!response || typeof response !== 'object') return []

  const data = (response as { data?: unknown }).data
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as { list?: unknown }).list)) {
    return (data as { list: MediaInfo[] }).list
  }
  return []
}

/** 判断媒体是否具备可展示图片和可进入详情页的标识。 */
function isUsableMedia(item: MediaInfo) {
  const hasMediaId = Boolean(item.tmdb_id || item.collection_id)
  return Boolean(item.title && (item.backdrop_path || item.poster_path) && hasMediaId)
}

/** 构造轮播项稳定键，兼容 TMDB 媒体与合集。 */
function getMediaKey(item: MediaInfo) {
  if (item.collection_id) return `collection:${item.collection_id}`
  return getMediaSubscribeId(item)
}

/** 加载指定推荐来源，并缓存当前会话已获取的数据。 */
async function loadMedia(sourcePath = selectedSourcePath.value) {
  const currentRequestId = ++requestId
  const cachedItems = mediaCache.get(sourcePath)
  if (cachedItems) {
    mediaItems.value = cachedItems
    activeIndex.value = 0
    loading.value = false
    loadFailed.value = false
    resumeAutoplayIfReady()
    return
  }

  loading.value = true
  loadFailed.value = false
  try {
    const response = await api.get(sourcePath)
    if (currentRequestId !== requestId) return

    const items = normalizeMediaResponse(response).filter(isUsableMedia).slice(0, RECOMMEND_SLIDE_COUNT)
    mediaCache.set(sourcePath, items)
    mediaItems.value = items
    activeIndex.value = 0
  } catch (error) {
    if (currentRequestId !== requestId) return
    console.error(error)
    mediaItems.value = []
    loadFailed.value = true
  } finally {
    if (currentRequestId === requestId) {
      loading.value = false
      resumeAutoplayIfReady()
    }
  }
}

/** 切换当前推荐来源并持久化用户选择。 */
function selectSource(source: RecommendViewSource) {
  if (selectedSourcePath.value === source.apipath) return

  selectedSourcePath.value = source.apipath
  localStorage.setItem(RECOMMEND_SOURCE_STORAGE_KEY, source.apipath)
  void loadMedia(source.apipath)
}

/** 返回经过全局图片缓存与代理设置处理的背景图地址。 */
function getBackdropUrl(item: MediaInfo) {
  const sourceUrl = item.backdrop_path || item.poster_path || noImage
  return getDisplayImageUrl(sourceUrl, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 组合年份、媒体类型与风格标签。 */
function getMediaMeta(item: MediaInfo) {
  return [item.year, item.type, ...(item.genres?.slice(0, 3) ?? [])].filter(Boolean).join(' · ')
}

/** 打开当前媒体的详情页面。 */
function goToMediaDetail() {
  const item = activeMedia.value
  if (!item) return

  if (item.collection_id) {
    void router.push({ path: `/browse/tmdb/collection/${item.collection_id}`, query: { title: item.title } })
    return
  }

  void router.push({
    path: '/media',
    query: {
      mediaid: getMediaSubscribeId(item),
      title: item.title,
      type: item.type,
      year: item.year,
    },
  })
}

/** 切换到上一项媒体。 */
function showPrevious() {
  if (mediaItems.value.length < 2) return
  activeIndex.value = (activeIndex.value - 1 + mediaItems.value.length) % mediaItems.value.length
}

/** 切换到下一项媒体。 */
function showNext() {
  if (mediaItems.value.length < 2) return
  activeIndex.value = (activeIndex.value + 1) % mediaItems.value.length
}

/** 跳转到指定轮播项。 */
function showSlide(index: number) {
  activeIndex.value = index
}

/** 记录触摸起点，供移动端判断横向滑动。 */
function handleTouchStart(event: TouchEvent) {
  touchStartX.value = event.changedTouches[0]?.clientX ?? null
}

/** 根据触摸位移切换移动端轮播项。 */
function handleTouchEnd(event: TouchEvent) {
  if (touchStartX.value === null) return

  const deltaX = (event.changedTouches[0]?.clientX ?? touchStartX.value) - touchStartX.value
  touchStartX.value = null
  if (Math.abs(deltaX) < 48) return
  if (deltaX > 0) showPrevious()
  else showNext()
}

/** 仅在焦点离开整个卡片时恢复自动播放。 */
function handleFocusOut(event: FocusEvent) {
  const card = event.currentTarget as HTMLElement | null
  const nextTarget = event.relatedTarget as Node | null
  if (card && nextTarget && card.contains(nextTarget)) return
  isFocusWithin.value = false
}

/** 启动轮播自动播放，系统减少动态效果时保持静态。 */
function startAutoplay() {
  stopAutoplay()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  autoplayTimer = window.setInterval(() => {
    if (!isHovered.value && !isFocusWithin.value) showNext()
  }, RECOMMEND_AUTOPLAY_INTERVAL)
}

/** 停止轮播自动播放并清理定时器。 */
function stopAutoplay() {
  if (!autoplayTimer) return
  window.clearInterval(autoplayTimer)
  autoplayTimer = null
}

/** 组件可见且媒体加载完成时确保轮播计时器存在。 */
function resumeAutoplayIfReady() {
  if (isComponentActive && !loading.value && autoplayTimer === null) startAutoplay()
}

/** 标记组件活跃并按当前加载状态恢复自动播放。 */
function activateAutoplay() {
  isComponentActive = true
  resumeAutoplayIfReady()
}

/** 停用组件时阻止异步加载续体重新创建定时器。 */
function deactivateAutoplay() {
  isComponentActive = false
  stopAutoplay()
}

onMounted(async () => {
  activateAutoplay()
  localStorage.setItem(RECOMMEND_SOURCE_STORAGE_KEY, selectedSourcePath.value)
  await loadMedia()
  resumeAutoplayIfReady()
})

onActivated(activateAutoplay)
onDeactivated(deactivateAutoplay)
onBeforeUnmount(() => {
  requestId += 1
  deactivateAutoplay()
})
</script>

<template>
  <VCard
    class="dashboard-recommend dashboard-grid-adaptive-size dashboard-grid-fill dashboard-grid-no-drag"
    :class="{ 'is-loading': loading }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocusWithin = true"
    @focusout="handleFocusOut"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <template v-if="loading">
      <VSkeletonLoader class="dashboard-recommend-skeleton" type="image" />
    </template>

    <template v-else-if="mediaItems.length">
      <VWindow v-model="activeIndex" class="dashboard-recommend-window" :touch="false">
        <VWindowItem v-for="item in mediaItems" :key="getMediaKey(item)" class="dashboard-recommend-slide">
          <VImg
            :src="getBackdropUrl(item)"
            :alt="item.title"
            class="dashboard-recommend-image"
            cover
            eager
            @click="goToMediaDetail"
          />
        </VWindowItem>
      </VWindow>

      <div class="dashboard-recommend-shade" aria-hidden="true"></div>

      <div class="dashboard-recommend-topbar">
        <div class="dashboard-recommend-label">
          <VIcon icon="mdi-creation" size="20" color="primary" />
          <span>{{ t('dashboard.recommendedMedia') }}</span>
        </div>

        <VMenu location="bottom end">
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              class="dashboard-recommend-source"
              variant="tonal"
              color="white"
              rounded="pill"
              append-icon="mdi-chevron-down"
              :aria-label="t('dashboard.selectRecommendSource')"
            >
              <VIcon :icon="getSourceIcon(selectedSource)" color="primary" size="20" start />
              <span class="dashboard-recommend-source-title">{{ selectedSource.title }}</span>
            </VBtn>
          </template>
          <VList density="compact" max-height="360" :aria-label="t('dashboard.selectRecommendSource')">
            <VListItem
              v-for="source in sources"
              :key="source.apipath"
              :active="source.apipath === selectedSourcePath"
              :prepend-icon="getSourceIcon(source)"
              :title="source.title"
              @click="selectSource(source)"
            />
          </VList>
        </VMenu>
      </div>

      <div
        class="dashboard-recommend-content"
        role="link"
        tabindex="0"
        @click="goToMediaDetail"
        @keydown.enter="goToMediaDetail"
      >
        <h2 class="dashboard-recommend-title">{{ activeMedia?.title }}</h2>
        <div class="dashboard-recommend-meta">{{ activeMedia ? getMediaMeta(activeMedia) : '' }}</div>
        <p v-if="activeMedia?.overview" class="dashboard-recommend-overview">{{ activeMedia.overview }}</p>
      </div>

      <VBtn
        class="dashboard-recommend-detail"
        variant="outlined"
        color="primary"
        rounded="pill"
        append-icon="mdi-chevron-right"
        @click.stop="goToMediaDetail"
      >
        {{ t('common.viewDetails') }}
      </VBtn>

      <VBtn
        v-if="mediaItems.length > 1"
        class="dashboard-recommend-arrow dashboard-recommend-arrow--previous"
        icon="mdi-chevron-left"
        variant="tonal"
        color="white"
        :aria-label="t('dashboard.previousRecommend')"
        @click.stop="showPrevious"
      />

      <div v-if="mediaItems.length > 1" class="dashboard-recommend-pagination">
        <button
          v-for="(_item, index) in mediaItems"
          :key="index"
          type="button"
          class="dashboard-recommend-page"
          :class="{ 'is-active': activeIndex === index }"
          :aria-label="t('dashboard.showRecommend', { index: index + 1 })"
          :aria-current="activeIndex === index ? 'true' : undefined"
          @click.stop="showSlide(index)"
        ></button>
      </div>

      <VBtn
        v-if="mediaItems.length > 1"
        class="dashboard-recommend-arrow dashboard-recommend-arrow--next"
        icon="mdi-chevron-right"
        variant="tonal"
        color="white"
        :aria-label="t('dashboard.nextRecommend')"
        @click.stop="showNext"
      />
    </template>

    <div v-else class="dashboard-recommend-empty">
      <VIcon icon="mdi-image-off-outline" size="38" />
      <span>{{ loadFailed ? t('dashboard.recommendLoadFailed') : t('dashboard.noRecommendations') }}</span>
      <VBtn v-if="loadFailed" variant="tonal" size="small" @click="loadMedia()">{{ t('common.retry') }}</VBtn>
    </div>
  </VCard>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-recommend {
  position: relative;
  overflow: hidden;
  aspect-ratio: 2 / 1;
  block-size: auto;
  min-block-size: 0;
  background: rgb(8, 18, 28);
  color: white;
  isolation: isolate;
}

.dashboard-recommend-window,
.dashboard-recommend-slide,
.dashboard-recommend-image,
.dashboard-recommend-skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.dashboard-recommend-window {
  position: absolute;
  inset: 0;
}

.dashboard-recommend-image {
  cursor: pointer;
}

.dashboard-recommend-image :deep(.v-img__img) {
  object-position: center top;
}

.dashboard-recommend-shade {
  position: absolute;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(3, 8, 14, 0.08) 0%, rgba(5, 12, 19, 0.04) 42%, rgba(5, 14, 22, 0.72) 100%),
    linear-gradient(90deg, rgba(5, 14, 22, 0.42) 0%, rgba(5, 14, 22, 0.12) 46%, transparent 68%);
  inset: 0;
  pointer-events: none;
}

.dashboard-recommend-topbar {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  inset-block-start: 1.25rem;
  inset-inline: 1.4rem;
}

.dashboard-recommend-label {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(8, 18, 28, 0.56);
  backdrop-filter: blur(10px);
  font-size: 0.84rem;
  font-weight: 650;
  gap: 0.45rem;
  padding: 0.55rem 0.85rem;
}

.dashboard-recommend-source {
  max-inline-size: min(320px, 45vw);
  background: rgba(8, 18, 28, 0.55) !important;
  backdrop-filter: blur(12px);
  text-transform: none;
}

.dashboard-recommend-source-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-recommend-content {
  position: absolute;
  z-index: 2;
  max-inline-size: min(640px, 56%);
  cursor: pointer;
  inset-block-end: 4.8rem;
  inset-inline-start: 1.9rem;
  outline: none;
}

.dashboard-recommend-content:focus-visible {
  border-radius: 10px;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.48);
}

.dashboard-recommend-title {
  margin: 0;
  color: rgb(255, 255, 255);
  font-size: clamp(1.6rem, 2.5vw, 2.45rem);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-shadow: 0 3px 20px rgba(0, 0, 0, 0.82), 0 1px 2px rgba(0, 0, 0, 0.72);
}

.dashboard-recommend-meta {
  margin-block-start: 0.55rem;
  color: rgba(255, 255, 255, 0.76);
  font-size: 0.86rem;
}

.dashboard-recommend-overview {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.75rem 0 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.85rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.65;
  text-overflow: ellipsis;
}

.dashboard-recommend-detail {
  position: absolute;
  z-index: 3;
  min-inline-size: 148px;
  inset-block-end: 4.9rem;
  inset-inline-end: 1.9rem;
  text-transform: none;
}

.dashboard-recommend-arrow {
  position: absolute;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(8, 18, 28, 0.52) !important;
  block-size: 40px;
  inline-size: 40px;
  inset-block-end: 1.15rem;
}

.dashboard-recommend-arrow--previous {
  inset-inline-start: 1.4rem;
}

.dashboard-recommend-arrow--next {
  inset-inline-end: 1.4rem;
}

.dashboard-recommend-pagination {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  inset-block-end: 1.8rem;
  inset-inline: 25%;
}

.dashboard-recommend-page {
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
  block-size: 4px;
  cursor: pointer;
  inline-size: 54px;
  padding: 0;
  transition: background-color 0.2s ease, inline-size 0.2s ease;
}

.dashboard-recommend-page.is-active {
  background: rgb(var(--v-theme-primary));
  inline-size: 72px;
}

.dashboard-recommend-empty {
  display: flex;
  block-size: 100%;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.68);
  flex-direction: column;
  gap: 0.75rem;
}

@media (min-width: 741px) and (hover: hover) {
  .dashboard-recommend-topbar,
  .dashboard-recommend-detail,
  .dashboard-recommend-arrow {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }

  .dashboard-recommend-topbar {
    transform: translateY(-4px);
  }

  .dashboard-recommend-arrow--previous {
    transform: translateX(-4px);
  }

  .dashboard-recommend-detail,
  .dashboard-recommend-arrow--next {
    transform: translateX(4px);
  }

  .dashboard-recommend:hover .dashboard-recommend-topbar,
  .dashboard-recommend:focus-within .dashboard-recommend-topbar,
  .dashboard-recommend:hover .dashboard-recommend-detail,
  .dashboard-recommend:focus-within .dashboard-recommend-detail,
  .dashboard-recommend:hover .dashboard-recommend-arrow,
  .dashboard-recommend:focus-within .dashboard-recommend-arrow {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
}

@media (max-width: 740px) {
  .dashboard-recommend {
    aspect-ratio: auto;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 460px;
  }

  .dashboard-recommend-topbar {
    justify-content: flex-end;
    inset-block-start: 0.85rem;
    inset-inline: 0.85rem;
  }

  .dashboard-recommend-label {
    display: none;
  }

  .dashboard-recommend-source {
    border: 1px solid rgba(255, 255, 255, 0.12);
    max-inline-size: none;
    min-inline-size: 40px;
    background: rgba(8, 18, 28, 0.24) !important;
    backdrop-filter: blur(8px);
    block-size: 40px;
    inline-size: 40px;
    padding: 0;
  }

  .dashboard-recommend-source-title,
  .dashboard-recommend-source :deep(.v-btn__append) {
    display: none;
  }

  .dashboard-recommend-source :deep(.v-icon--start) {
    margin-inline-end: 0;
  }

  .dashboard-recommend-content {
    max-inline-size: calc(100% - 1.7rem);
    inset-block-end: 7.5rem;
    inset-inline: 0.85rem;
  }

  .dashboard-recommend-title {
    font-size: 1.65rem;
  }

  .dashboard-recommend-overview {
    font-size: 0.8rem;
    -webkit-line-clamp: 2;
    line-height: 1.5;
  }

  .dashboard-recommend-detail {
    display: none;
  }

  .dashboard-recommend-arrow {
    display: none;
  }

  .dashboard-recommend-pagination {
    gap: 0.3rem;
    inset-block-end: 1.75rem;
    inset-inline: 22%;
  }

  .dashboard-recommend-page {
    inline-size: 22px;
  }

  .dashboard-recommend-page.is-active {
    inline-size: 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-recommend-topbar,
  .dashboard-recommend-arrow,
  .dashboard-recommend-page {
    transition: none;
  }
}
</style>
