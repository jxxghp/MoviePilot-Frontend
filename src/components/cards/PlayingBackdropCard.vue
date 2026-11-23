<script lang="ts" setup>
import type { MediaServerPlayItem } from '@/api/types'
import { openMediaServerItem } from '@/utils/appDeepLink'
import { vNativeCardMenu } from '@/native/card'
import { nativeChromeActive } from '@/native/layout'
import { createNativeDashboardMediaCardMenu } from '@/utils/nativeDashboardMediaCard'
import { useGlobalSettingsStore } from '@/stores'
import { getProxyImageUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  server: String,
  width: String,
  height: String,
})
const globalSettingsStore = useGlobalSettingsStore()
const { t } = useI18n()

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

// 当前卡片是否存在可用实图地址（缺失封面或加载失败时直接渲染语义降级卡面，不回退暗灰占位图）。
const hasImageSource = computed(() => Boolean(props.media?.image) && !imageLoadError.value)

// 真实剧照是否已完成加载；仅真实剧照就绪后才启用全铺深色遮罩与白字模式。
const hasRealImage = computed(() => hasImageSource.value && imageLoaded.value)

watch(
  () => props.media?.image,
  () => {
    imageLoaded.value = false
    imageLoadError.value = false
  },
)

// 卡片内联尺寸，便于仪表盘网格按高度进行虚拟布局。
const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '16 / 10',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

// 规范化后的播放进度，避免后端异常值撑破进度条。
const progressValue = computed(() => {
  const percent = Number(props.media?.percent ?? 0)
  if (Number.isNaN(percent)) return 0
  return Math.min(Math.max(percent, 0), 100)
})

// 是否存在可续播进度。
const hasProgress = computed(() => progressValue.value > 0)

// 右上角进度标签。
const progressLabel = computed(() => (hasProgress.value ? `${Math.round(progressValue.value)}%` : 'NEW'))

// 副信息兜底，避免空副标题导致卡片底部信息层过空。
const subtitleText = computed(() => props.media?.subtitle || props.media?.type || '继续观看')

// 根据播放进度生成简短提示。
const progressHint = computed(() => {
  if (!hasProgress.value) return '未开始'
  if (progressValue.value >= 90) return '快看完'
  if (progressValue.value <= 10) return '刚开始'
  return '继续上次进度'
})

// 计算图片代理地址。
const imageUrl = computed(() => {
  const image = props.media?.image || ''
  if (!image || imageLoadError.value) return ''

  return getProxyImageUrl(image, {
    useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
    useCookies: props.media?.use_cookies,
    maxWidth: 1280,
    quality: 80,
  })
})

/**
 * 标记封面加载完成。
 */
function imageLoadHandler() {
  imageLoaded.value = true
}

/**
 * 标记封面加载失败并切换到语义无图降级态。
 */
function imageErrorHandler() {
  imageLoaded.value = false
  imageLoadError.value = true
}

/**
 * 跳转到媒体服务器播放页面。
 */
async function goPlay() {
  if (props.media) {
    await openMediaServerItem(props.media)
  }
}

/** App 长按继续观看卡片时提供本地播放与外部媒体服务器打开操作。 */
const nativeCardMenu = computed(() =>
  createNativeDashboardMediaCardMenu(
    () => props.media,
    () => props.server,
    {
      play: t('file.play'),
      mediaServer: t('notificationSwitch.mediaServer'),
      openInServer: server => t('dashboard.openInServer', { server }),
    },
  ),
)
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Web 的 Hover 命中区域保持静止；App 不上浮卡片，避免位置变化撤销原生长按菜单。 -->
      <div v-bind="hover.props" class="playing-card-hover-area">
        <VCard
          v-native-card-menu="nativeCardMenu"
          :style="cardStyle"
          :data-glass-optical-mode="hasRealImage ? 'excluded' : undefined"
          class="playing-card app-hover-lift-card"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering && !nativeChromeActive,
            'playing-card--hovering': hover.isHovering,
            'playing-card--loaded': imageLoaded,
            'playing-card--has-image': hasRealImage,
          }"
          :role="nativeChromeActive ? 'group' : 'button'"
          :aria-label="nativeChromeActive ? props.media?.title : undefined"
          tabindex="0"
          @click="goPlay"
          @keyup.enter="goPlay"
          @keyup.space="goPlay"
        >
          <!-- 无剧照或加载前渲染独立语义降级底面，避免嵌套 VCard 透明规则抹掉卡面对比度。 -->
          <div v-if="!hasRealImage" class="playing-card__fallback" aria-hidden="true">
            <VIcon icon="mdi-play-box-outline" size="30" class="playing-card__fallback-icon" />
          </div>

          <!-- 媒体服务器图片统一采用匿名 CORS，避免同一代理资源分裂为两种请求与缓存模式；Safari 普通 dev 可能重复请求，PWA 下由图片缓存路由统一处理。 -->
          <VImg
            v-if="hasImageSource"
            :src="imageUrl"
            crossorigin="anonymous"
            class="playing-card__image"
            :class="{ 'playing-card__image--loaded': imageLoaded }"
            cover
            @load="imageLoadHandler"
            @error="imageErrorHandler"
          >
            <template #placeholder>
              <div class="playing-card__placeholder">
                <VSkeletonLoader class="playing-card__skeleton" />
              </div>
            </template>
          </VImg>

          <div v-if="hasRealImage" class="playing-card__scrim" />
          <div v-if="hasRealImage" class="playing-card__bottom-scrim" />

          <div class="playing-card__percent num">
            {{ progressLabel }}
          </div>

          <div class="playing-card__play" aria-hidden="true">
            <VIcon icon="mdi-play" size="26" />
          </div>

          <div class="playing-card__content">
            <div class="playing-card__title">
              {{ props.media?.title }}
            </div>
            <div class="playing-card__subtitle">
              {{ subtitleText }}
            </div>
            <div class="playing-card__meta">
              <span>{{ progressHint }}</span>
              <span v-if="props.media?.server_type" class="playing-card__server">
                {{ props.media.server_type }}
              </span>
            </div>
          </div>

          <div class="playing-card__progress" aria-hidden="true">
            <div class="playing-card__progress-track">
              <div class="playing-card__progress-bar" :style="{ inlineSize: `${progressValue}%` }" />
            </div>
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.playing-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.playing-card {
  --playing-card-fallback-bg: linear-gradient(
    145deg,
    color-mix(in srgb, var(--mp-primary-soft) 45%, var(--mp-muted)) 0%,
    var(--mp-muted) 100%
  );
  --playing-card-fallback-border: var(--mp-border);
  --playing-card-fallback-icon-opacity: 0.36;
  --playing-card-percent-bg: var(--mp-surface);
  --playing-card-percent-border: var(--mp-border);

  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border);
  background: var(--mp-card);
  color: var(--mp-fg);
  cursor: pointer;
  isolation: isolate;
}

/* 浅色玻璃下补强无图卡面静态托底，防止底层高对比壁纸干扰卡片标题、图标与进度文字。 */
:global(html[data-theme='glass'][data-glass-color-scheme='light'] .playing-card) {
  --playing-card-fallback-bg: linear-gradient(
    145deg,
    color-mix(in srgb, rgb(var(--v-theme-primary)) 8%, rgba(255, 255, 255, 0.92)) 0%,
    rgba(248, 250, 252, 0.88) 100%
  );
  --playing-card-fallback-border: rgba(15, 23, 42, 0.14);
  --playing-card-fallback-icon-opacity: 0.48;
  --playing-card-percent-bg: rgba(255, 255, 255, 0.92);
  --playing-card-percent-border: rgba(15, 23, 42, 0.14);
}

.playing-card--has-image {
  color: var(--mp-on-media);
}

.playing-card__fallback {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 1px solid var(--playing-card-fallback-border);
  border-radius: inherit;
  background: var(--playing-card-fallback-bg);
  pointer-events: none;
}

.playing-card__fallback-icon {
  position: absolute;
  color: var(--mp-muted-fg);
  inset-block-start: 14px;
  inset-inline-start: 16px;
  opacity: var(--playing-card-fallback-icon-opacity);
}

.playing-card__image {
  block-size: 100%;
  inline-size: 100%;
}

.playing-card__placeholder,
.playing-card__skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.playing-card__image :deep(.v-img__img) {
  filter: saturate(0.96) brightness(0.92);
  opacity: 0;
  transform: scale(1.01);
  transition:
    opacity 0.2s ease,
    transform 0.35s ease;
}

.playing-card__image--loaded :deep(.v-img__img) {
  opacity: 1;
}

.playing-card--hovering .playing-card__image :deep(.v-img__img) {
  transform: scale(1.05);
}

.playing-card__scrim,
.playing-card__bottom-scrim {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.playing-card__scrim {
  background:
    linear-gradient(90deg, rgba(11, 19, 34, 0.24) 0%, rgba(11, 19, 34, 0.04) 48%, rgba(11, 19, 34, 0.28) 100%),
    linear-gradient(180deg, rgba(11, 19, 34, 0.08) 0%, rgba(11, 19, 34, 0) 42%);
}

.playing-card__bottom-scrim {
  background: var(--mp-media-scrim);
}

.playing-card__percent,
.playing-card__play,
.playing-card__content,
.playing-card__progress {
  position: absolute;
  z-index: 2;
}

/* 无剧照态采用静态语义胶囊，不在父级玻璃卡内叠第二层 backdrop-filter。 */
.playing-card__percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--playing-card-percent-border);
  border-radius: 999px;
  background: var(--playing-card-percent-bg);
  block-size: 26px;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 600;
  inline-size: 52px;
  inset-block-start: 12px;
  inset-inline-end: 12px;
}

.playing-card--has-image .playing-card__percent {
  border-color: rgba(248, 250, 252, 0.22);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.56);
  color: var(--mp-on-media);
}

.playing-card__play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--mp-primary-border);
  border-radius: 50%;
  background: var(--mp-primary-soft);
  block-size: 40px;
  color: var(--mp-primary-fg);
  inline-size: 40px;
  inset-block-end: 46px;
  inset-inline-end: 18px;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.playing-card--hovering .playing-card__play {
  transform: scale(1.06);
}

.playing-card--has-image .playing-card__play {
  border-color: transparent;
  background: rgba(248, 250, 252, 0.92);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
  color: rgb(11, 15, 20);
}

.playing-card--has-image.playing-card--hovering .playing-card__play {
  background: var(--mp-on-media);
}

.playing-card__content {
  inset-block-end: 18px;
  inset-inline: 16px 66px;
  min-inline-size: 0;
}

.playing-card--has-image .playing-card__content {
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.playing-card__title {
  overflow: hidden;
  color: var(--mp-fg);
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-card--has-image .playing-card__title {
  color: var(--mp-on-media);
}

.playing-card__subtitle {
  overflow: hidden;
  margin-block-start: 4px;
  color: var(--mp-muted-fg);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-card--has-image .playing-card__subtitle {
  color: var(--mp-on-media-muted);
}

.playing-card__meta {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: space-between;
  margin-block-start: 7px;
  color: var(--mp-muted-fg);
  font-size: 0.72rem;
  gap: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.playing-card--has-image .playing-card__meta {
  color: var(--mp-on-media-muted);
}

.playing-card__server {
  overflow: hidden;
  max-inline-size: 6rem;
  text-overflow: ellipsis;
  text-transform: uppercase;
}

.playing-card__progress {
  inset-block-end: 6px;
  inset-inline: 16px;
}

.playing-card__progress-track {
  overflow: hidden;
  border-radius: 999px;
  background: var(--mp-input);
  block-size: 5px;
}

.playing-card--has-image .playing-card__progress-track {
  background: rgba(255, 255, 255, 24%);
}

.playing-card__progress-bar {
  border-radius: inherit;
  background: rgb(var(--v-theme-success));
  block-size: 100%;
  min-inline-size: 8px;
  transition: inline-size 0.25s ease;
}

.playing-card--has-image .playing-card__progress-bar {
  background: linear-gradient(90deg, rgb(var(--v-theme-success)) 0%, rgba(255, 255, 255, 92%) 100%);
}

@media (max-width: 600px) {
  .playing-card__content {
    inset-inline-end: 58px;
  }

  .playing-card__title {
    font-size: 1rem;
  }

  .playing-card__play {
    block-size: 36px;
    inline-size: 36px;
    inset-inline-end: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .playing-card__image :deep(.v-img__img),
  .playing-card__play,
  .playing-card__progress-bar {
    transition: none;
  }

  .playing-card--hovering .playing-card__image :deep(.v-img__img),
  .playing-card--hovering .playing-card__play {
    transform: none;
  }
}
</style>
