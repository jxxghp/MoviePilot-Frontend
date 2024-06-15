<script lang="ts" setup>
import type { MediaServerLibrary } from '@/api/types'
import plex from '@images/misc/plex.png'
import emby from '@images/misc/emby.png'
import jellyfin from '@images/misc/jellyfin.png'

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

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 图片加载错误
function imageErrorHandler() {
  imageError.value = true
}

// 默认图片
function getDefaultImage() {
  if (props.media?.server === 'plex') return plex
  else if (props.media?.server === 'emby') return emby
  else if (props.media?.server === 'jellyfin') return jellyfin
  else return plex
}

// 跳转播放
function goPlay() {
  if (props.media?.link) window.open(props.media?.link, '_blank')
}

// 生成图片代理路径
function getImgUrl(url: string) {
  if (!url) return getDefaultImage()
  else return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(url)}`
}

// 根据多张图片生成媒体库封面
async function drawImages(imageList: string[]) {
  // 图片
  const IMAGES = imageList
  if (IMAGES.length === 0) return getDefaultImage()

  // 为所有图片添加system/img前缀
  for (let i = 0; i < IMAGES.length; i++)
    IMAGES[i] = `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(IMAGES[i])}`

  // canvas
  const canvas = canvasRef.value
  if (!canvas) return getDefaultImage()

  // 画布参数
  const POSTER_WIDTH = (canvas.width - 32) / 4
  const POSTER_HEIGHT = canvas.height * 0.75 - 8
  const MARGIN_WIDTH = 4
  const MARGIN_HEIGHT = 4
  const REFLECTION_HEIGHT = POSTER_HEIGHT / 2
  const REFLECTION_SHOW_HEIGHT = canvas.height / 4

  // 获取画布上下文
  const ctx = canvas.getContext('2d')
  if (!ctx) return getDefaultImage()

  // 设置背景色为黑色
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 绘制图片
  async function drawImageWithReflection(imgSrc: string, index: number) {
    if (!canvas) return

    if (!ctx) return

    const img = new Image()
    img.setAttribute('crossorigin', 'anonymous')
    img.src = imgSrc
    await new Promise(resolve => (img.onload = resolve))

    const x = MARGIN_WIDTH * index + POSTER_WIDTH * (index - 1)
    const y = MARGIN_HEIGHT

    ctx.drawImage(img, x, y, POSTER_WIDTH, POSTER_HEIGHT)

    ctx.save()
    ctx.translate(0, canvas.height)
    ctx.scale(1, -1)
    ctx.drawImage(
      img,
      0,
      0,
      img.width,
      img.height,
      x,
      REFLECTION_SHOW_HEIGHT - REFLECTION_HEIGHT,
      POSTER_WIDTH,
      REFLECTION_HEIGHT,
    )

    const gradient = ctx.createLinearGradient(0, REFLECTION_SHOW_HEIGHT - REFLECTION_HEIGHT, 0, REFLECTION_HEIGHT)

    gradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)')
    ctx.fillStyle = gradient
    ctx.fillRect(x, 0, POSTER_WIDTH, REFLECTION_SHOW_HEIGHT)

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
    imgUrl.value = await drawImages(props.media?.image_list || [])
  else imgUrl.value = getImgUrl(props.media?.image || '')
})
</script>

<template>
  <VHover v-bind="props" :height="props.height" :width="props.width">
    <template #default="hover">
      <VCard
        v-bind="hover.props"
        :height="props.height"
        :width="props.width"
        :class="{
          'transition transform-cpu duration-300 scale-105 shadow-lg': hover.isHovering,
        }"
        @click="goPlay"
      >
        <template #image>
          <canvas ref="canvasRef" class="w-full h-full hidden" />
          <VImg :src="imgUrl" aspect-ratio="2/3" cover @load="imageLoadHandler" @error="imageErrorHandler">
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
              </div>
            </template>
            <VCardText
              class="w-full flex flex-col flex-wrap justify-end align-center text-white absolute bottom-0 cursor-pointer pa-2"
            >
              <h1 class="mb-1 text-white text-shadow font-bold line-clamp-2 overflow-hidden text-ellipsis ...">
                {{ props.media?.name }}
              </h1>
            </VCardText>
          </VImg>
        </template>
      </VCard>
    </template>
  </VHover>
</template>

<style lang="scss">
.text-shadow {
  text-shadow: 1px 1px #777;
}
</style>
