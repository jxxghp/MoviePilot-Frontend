<script lang="ts" setup>
import type { MediaServerPlayItem } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { openMediaServerItem } from '@/utils/appDeepLink'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  width: String,
  height: String,
})

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片是否加载失败
const imageLoadError = ref(false)

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
  if (!image || imageLoadError.value) return noImage

  let url = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(image)}`
  const useCookies = props.media?.use_cookies
  if (useCookies) {
    url += `&use_cookies=${encodeURIComponent(useCookies)}`
  }

  return url
})

/**
 * 标记封面加载完成。
 */
function imageLoadHandler() {
  imageLoaded.value = true
}

/**
 * 标记封面加载失败并切换到默认图。
 */
function imageErrorHandler() {
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
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="playing-card-hover-area">
        <VCard
          :style="cardStyle"
          class="playing-card app-hover-lift-card"
          :class="{
            'app-hover-lift-card--hovering playing-card--hovering': hover.isHovering,
            'playing-card--loaded': imageLoaded,
          }"
          role="button"
          tabindex="0"
          @click="goPlay"
          @keyup.enter="goPlay"
          @keyup.space="goPlay"
        >
          <VImg
            :src="imageUrl"
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

          <div class="playing-card__scrim" />
          <div class="playing-card__bottom-scrim" />

          <div class="playing-card__percent">
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
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), 0.16);
  background: rgb(var(--v-theme-surface));
  color: #fff;
  cursor: pointer;
  isolation: isolate;
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
    linear-gradient(90deg, rgba(0, 0, 0, 24%) 0%, rgba(0, 0, 0, 4%) 48%, rgba(0, 0, 0, 28%) 100%),
    linear-gradient(180deg, rgba(0, 0, 0, 8%) 0%, rgba(0, 0, 0, 0%) 42%);
}

.playing-card__bottom-scrim {
  background:
    linear-gradient(180deg, rgba(2, 6, 12, 0%) 24%, rgba(2, 6, 12, 72%) 68%, rgba(2, 6, 12, 96%) 100%);
}

.playing-card__percent,
.playing-card__play,
.playing-card__content,
.playing-card__progress {
  position: absolute;
  z-index: 2;
}

.playing-card__percent {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 18%);
  border-radius: 999px;
  backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 16%);
  block-size: 26px;
  font-size: 0.75rem;
  font-weight: 800;
  inline-size: 52px;
  inset-block-start: 12px;
  inset-inline-end: 12px;
}

.playing-card__play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 92%);
  block-size: 40px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 24%);
  color: rgb(11, 15, 20);
  inline-size: 40px;
  inset-block-end: 46px;
  inset-inline-end: 18px;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.playing-card--hovering .playing-card__play {
  background: #fff;
  transform: scale(1.06);
}

.playing-card__content {
  inset-block-end: 18px;
  inset-inline: 16px 66px;
  min-inline-size: 0;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 45%);
}

.playing-card__title {
  overflow: hidden;
  font-size: 1.08rem;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-card__subtitle {
  overflow: hidden;
  margin-block-start: 4px;
  color: rgba(255, 255, 255, 86%);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playing-card__meta {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: space-between;
  margin-block-start: 7px;
  color: rgba(255, 255, 255, 70%);
  font-size: 0.72rem;
  gap: 10px;
  line-height: 1.2;
  white-space: nowrap;
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
  background: rgba(255, 255, 255, 24%);
  block-size: 5px;
}

.playing-card__progress-bar {
  border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--v-theme-success)) 0%, rgba(255, 255, 255, 92%) 100%);
  block-size: 100%;
  min-inline-size: 8px;
  transition: inline-size 0.25s ease;
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
