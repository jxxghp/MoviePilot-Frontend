<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import MedalFace from '@/components/community/MedalFace.vue'
import { loadMedalImage } from '@/utils/communityMedalEngrave'
import { medalArt } from '@/utils/communityMedalArt'
import type { MedalKey } from '@/utils/communityMedals'

/**
 * 勋章正面的小图：有渲染图时用本档正面图，缺图时用页面绘制的六边形后备。
 * 传 size 时按不透明区域裁掉留白，以相近的视觉分量居中画进一张按设备像素比生成的画布：
 * 宽扁的勋章（如启幕）不会缩成一条线，小尺寸下也清楚。头像旁的佩戴勋章用这种方式。
 */
const props = defineProps<{ medalKey: MedalKey; tier?: number; size?: number }>()
const art = computed(() => medalArt(props.medalKey, props.tier))
const canvas = ref<HTMLCanvasElement | null>(null)

/** 不透明区域的外接框（按整张图的比例），同一张图只量一次。 */
const boundsCache = new Map<string, { x: number; y: number; w: number; h: number }>()

function alphaBounds(image: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const cached = boundsCache.get(image.src)
  if (cached) return cached
  const sample = 128
  const probe = document.createElement('canvas')
  probe.width = probe.height = sample
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  let bounds = { x: 0, y: 0, w: 1, h: 1 }
  if (ctx) {
    ctx.drawImage(image, 0, 0, sample, sample)
    const data = ctx.getImageData(0, 0, sample, sample).data
    let minX = sample
    let minY = sample
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < sample; y++) {
      for (let x = 0; x < sample; x++) {
        if (data[(y * sample + x) * 4 + 3] < 40) continue
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (maxX >= 0)
      bounds = { x: minX / sample, y: minY / sample, w: (maxX - minX + 1) / sample, h: (maxY - minY + 1) / sample }
  }
  boundsCache.set(image.src, bounds)
  return bounds
}

async function draw() {
  const target = canvas.value
  const source = art.value?.front
  if (!target || !source || !props.size) return
  let image: HTMLImageElement
  try {
    image = await loadMedalImage(source)
  } catch {
    return
  }
  if (art.value?.front !== source) return
  const ratio = Math.min(window.devicePixelRatio || 1, 3)
  const pixels = Math.round(props.size * ratio)
  target.width = target.height = pixels
  const ctx = target.getContext('2d')
  if (!ctx) return
  const box = alphaBounds(image)
  // 视觉分量：按外接框面积缩放到相近大小，最长边不超出圆形底座。
  const scale = Math.min(0.94 / Math.max(box.w, box.h), 0.66 / Math.sqrt(box.w * box.h))
  const width = box.w * scale * pixels
  const height = box.h * scale * pixels
  ctx.clearRect(0, 0, pixels, pixels)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const natural = image.naturalWidth
  ctx.drawImage(
    image,
    box.x * natural,
    box.y * natural,
    box.w * natural,
    box.h * natural,
    (pixels - width) / 2,
    (pixels - height) / 2,
    width,
    height,
  )
}

onMounted(draw)
watch(() => [art.value?.front, props.size], draw)
</script>

<template>
  <canvas
    v-if="art && size"
    ref="canvas"
    class="medal-image"
    :style="{ inlineSize: size + 'px', blockSize: size + 'px' }"
    aria-hidden="true"
  />
  <img v-else-if="art" :src="art.front" alt="" draggable="false" class="medal-image" />
  <MedalFace v-else :medal-key="medalKey" class="medal-image" />
</template>

<style lang="scss" scoped>
.medal-image {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  object-fit: contain;
}
</style>
