<script lang="ts" setup>
import type { MediaServerLibrary } from '@/api/types'
import plex from '@images/misc/plex.png'
import emby from '@images/misc/emby.png'
import jellyfin from '@images/misc/jellyfin.png'
import { getLogoUrl } from '@/utils/imageUtils'
import { openMediaServerItem } from '@/utils/appDeepLink'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerLibrary>,
  width: String,
  height: String,
})

// canvas
const canvasRef = ref<HTMLCanvasElement>()

// 图片地址
const imgUrl = ref('')

// 图片是否加载完成
const imageLoaded = ref(false)

// 图片是否加载错误
const imageError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '3 / 2',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

// 媒体库内条目数量，兼容不同后端字段。
const libraryItemCount = computed(() => props.media?.item_count)

// 是否展示右上角数量折角。
const showCountCorner = computed(() => typeof libraryItemCount.value === 'number' && libraryItemCount.value >= 0)

// 右上角数量文案。
const countLabel = computed(() => {
  if (!showCountCorner.value) return ''
  return formatLibraryCount(libraryItemCount.value || 0)
})

/**
 * 格式化右上角媒体库数量。
 * @param count 媒体库内媒体数量
 */
function formatLibraryCount(count: number) {
  if (count >= 10000) return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}万`
  return `${count}`
}

/**
 * 标记封面加载完成。
 */
function imageLoadHandler() {
  imageLoaded.value = true
}

/**
 * 标记封面加载失败并切换默认图。
 */
function imageErrorHandler() {
  imageError.value = true
  imgUrl.value = getDefaultImage()
}

/**
 * 获取媒体服务器默认封面图。
 */
function getDefaultImage() {
  if (props.media?.server_type === 'plex') return plex
  else if (props.media?.server_type === 'emby') return emby
  else if (props.media?.server_type === 'zspace') return getLogoUrl('zspace')
  else if (props.media?.server_type === 'jellyfin') return jellyfin
  else if (props.media?.server_type === 'trimemedia') return getLogoUrl('trimemedia')
  else if (props.media?.server_type === 'ugreen') return getLogoUrl('ugreen')
  else return plex
}

/**
 * 跳转到媒体服务器媒体库页面。
 */
async function goPlay() {
  if (props.media) {
    await openMediaServerItem(props.media)
  }
}

/**
 * 生成图片代理路径。
 * @param url 原始图片地址
 * @param use_cookies 是否携带 Cookie 代理图片
 */
function getImgUrl(url: string, use_cookies?: boolean) {
  if (!url || imageError.value) return getDefaultImage()
  let imgurl = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(url)}`
  if (use_cookies) {
    imgurl += `&use_cookies=${encodeURIComponent(use_cookies)}`
  }
  return imgurl
}

/**
 * 根据多张图片生成媒体库封面。
 * @param imageList 媒体库封面候选图列表
 * @param use_cookies 是否携带 Cookie 代理图片
 */
async function drawImages(imageList: string[], use_cookies?: boolean) {
  // 图片
  const IMAGES = [...imageList]
  if (IMAGES.length === 0) return getDefaultImage()

  // 为所有图片添加system/img前缀
  for (let i = 0; i < IMAGES.length; i++) {
    IMAGES[i] = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(IMAGES[i])}`
    if (use_cookies) {
      IMAGES[i] += `&use_cookies=${encodeURIComponent(use_cookies)}`
    }
  }

  // canvas
  const canvas = canvasRef.value
  if (!canvas) return getDefaultImage()

  // 画布参数
  const POSTER_WIDTH = (canvas.width - 40) / 4 // 左右边框8px + 3个间隔24px = 40px
  const POSTER_HEIGHT = 256 // 上方海报高256
  const MARGIN_WIDTH = 8 // 左右间隔为8
  const MARGIN_HEIGHT = 4 // 海报和倒影之间的间隔为4
  const REFLECTION_HEIGHT = canvas.height - POSTER_HEIGHT - MARGIN_HEIGHT // 下方倒影使用剩余全部高度

  // 获取画布上下文
  const ctx = canvas.getContext('2d')
  if (!ctx) return getDefaultImage()

  // 设置背景色为透明
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  /**
   * 绘制单张海报及其倒影。
   * @param imgSrc 海报图片地址
   * @param index 海报位置
   */
  async function drawImageWithReflection(imgSrc: string, index: number) {
    if (!canvas) return

    if (!ctx) return

    const img = new Image()
    img.setAttribute('crossorigin', 'anonymous')
    img.src = imgSrc
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(`Failed to load image: ${imgSrc}`))
      })
    } catch (error) {
      console.error(error)
      ctx.fillStyle = '#e5e7eb'
      ctx.fillRect(MARGIN_WIDTH * index + POSTER_WIDTH * (index - 1), 0, POSTER_WIDTH, POSTER_HEIGHT)
      return
    }

    const x = MARGIN_WIDTH * index + POSTER_WIDTH * (index - 1)
    const y = 0 // 海报紧贴顶部

    ctx.drawImage(img, x, y, POSTER_WIDTH, POSTER_HEIGHT)

    ctx.save()
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
    ctx.drawImage(img, 0, 0, img.width, img.height, x, 0, POSTER_WIDTH, REFLECTION_HEIGHT)

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height - (POSTER_HEIGHT + MARGIN_HEIGHT))

    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = gradient
    ctx.fillRect(x, 0, POSTER_WIDTH, REFLECTION_HEIGHT)

    ctx.restore()
  }

  // 绘制多张图片
  const loopCount = Math.min(4, IMAGES.length)
  for (let i = 0; i < loopCount; i++) await drawImageWithReflection(IMAGES[i], i + 1)

  // 转换为图片地址
  return canvas.toDataURL('image/png')
}

onMounted(async () => {
  if (props.media?.image_list && props.media?.image_list.length > 0)
    imgUrl.value = await drawImages(props.media?.image_list || [], props.media?.use_cookies)
  else imgUrl.value = getImgUrl(props.media?.image || '', props.media?.use_cookies)
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div v-bind="hover.props" class="library-card-hover-area">
        <VCard
          :style="cardStyle"
          class="app-hover-lift-card"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
          }"
          @click="goPlay"
        >
        <template #image>
          <canvas ref="canvasRef" width="640" height="360" class="w-full h-full hidden" />
          <VImg
            :src="imgUrl"
            aspect-ratio="2/3"
            class="library-card-image"
            :class="{ 'library-card-image--loaded': imageLoaded }"
            cover
            @load="imageLoadHandler"
            @error="imageErrorHandler"
          >
            <template #placeholder>
              <div class="library-card-placeholder">
                <VSkeletonLoader class="library-card-skeleton" />
              </div>
            </template>
            <template #default>
              <div class="library-card-shade" aria-hidden="true" />
              <div v-if="showCountCorner" class="library-card-count-corner">
                <span>{{ countLabel }}</span>
              </div>
              <div class="library-card-label">
                <span>{{ props.media?.name }}</span>
              </div>
            </template>
          </VImg>
        </template>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.library-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.library-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.library-card-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0%) 0%, rgba(2, 6, 23, 2%) 56%, rgba(2, 6, 23, 28%) 100%),
    linear-gradient(90deg, rgba(2, 6, 23, 8%) 0%, rgba(2, 6, 23, 0%) 42%, rgba(2, 6, 23, 10%) 100%);
  pointer-events: none;
}

.library-card-label {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 10, 17, 58%);
  block-size: 1.75rem;
  border-block-start: 1px solid rgba(255, 255, 255, 12%);
  border-end-end-radius: var(--app-surface-radius);
  border-end-start-radius: var(--app-surface-radius);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  inset-block-end: 0;
  inset-inline: 0;
  line-height: 1;
  padding-inline: 0.75rem;
  text-align: center;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 48%);
}

.library-card-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-card-count-corner {
  position: absolute;
  block-size: 3.35rem;
  color: #fff;
  inline-size: 3.35rem;
  inset-block-start: 0;
  inset-inline-end: 0;
  pointer-events: none;
}

.library-card-count-corner::before {
  position: absolute;
  background: rgba(8, 13, 22, 72%);
  block-size: 100%;
  clip-path: polygon(100% 0, 100% 100%, 0 0);
  content: "";
  inset-block-start: 0;
  inset-inline-end: 0;
  inline-size: 100%;
}

.library-card-count-corner::after {
  position: absolute;
  background: rgba(var(--v-theme-primary), 62%);
  block-size: 100%;
  clip-path: polygon(100% 0, 100% 100%, 0 0);
  content: "";
  inset-block-start: 0;
  inset-inline-end: 0;
  inline-size: 100%;
}

.library-card-count-corner span {
  position: absolute;
  inset-block-start: 0.63rem;
  inset-inline-end: 0.18rem;
  font-size: 0.625rem;
  font-weight: 800;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 44%);
  transform: rotate(45deg);
  transform-origin: center;
  white-space: nowrap;
  z-index: 1;
}

.library-card-placeholder,
.library-card-skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.library-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.library-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .library-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
