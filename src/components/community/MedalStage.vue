<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MedalCard from '@/components/community/MedalCard.vue'
import { medalArt, supportsRelief } from '@/utils/communityMedalArt'
import type { MedalEngraving, MedalKey } from '@/utils/communityMedals'

/**
 * 勋章展台：精绘需要渲染图、高度图与轮廓齐全且浏览器支持 WebGL，否则退回倾斜卡片。
 * three.js 与精绘模块在这里按需动态加载，不进首屏包。整个打开期间只用一个渲染器；
 * 当前这枚显示后，前后相邻的勋章在后台先搭好，切换时直接换上。新勋章 250 毫秒内没就绪才显示加载圈。
 */
const props = defineProps<{
  medalKey: MedalKey
  engraving: MedalEngraving
  /** 持有的档位，阶梯勋章按它取正面图 */
  tier?: number
  reducedMotion: boolean
  /** 接下来可能切到的勋章（通常是前后各一枚），在后台预先搭好 */
  upcoming?: { medalKey: MedalKey; tier?: number; engraving: MedalEngraving }[]
}>()
const emit = defineEmits<{
  /** 勋章正对时外形在展台里的上下边（按展台高度的比例）；不用精绘时为 null */
  bounds: [value: { top: number; bottom: number } | null]
}>()

type ReliefRenderer = import('@/utils/communityMedalRelief').ReliefRenderer

const { t } = useI18n()
const canvas = ref<HTMLCanvasElement | null>(null)
const art = computed(() => medalArt(props.medalKey, props.tier))
/** 当前这枚勋章的精绘失败（资源加载出错），这枚退回卡片 */
const failed = ref(false)
/** WebGL 不可用或渲染器建不起来，整个打开期间都用卡片 */
const broken = ref(false)
const ready = ref(false)
/** 加载圈：新勋章 250 毫秒内没就绪才出现，避免切换时一闪 */
const spinner = ref(false)
let spinnerTimer: number | undefined
// 整个勋章墙打开期间只有这一个渲染器（一个 WebGL 上下文），切换勋章只换场景内容。
let renderer: ReliefRenderer | null = null
let creating: Promise<ReliefRenderer> | null = null
let build = 0

/** jsdom 与禁用 WebGL 的浏览器没有 WebGLRenderingContext，直接走卡片，不去碰画布。 */
function webglAvailable(): boolean {
  return typeof window !== 'undefined' && 'WebGLRenderingContext' in window
}

/** 画布常驻（不随勋章重建），不能用精绘的勋章只是把它藏起来。 */
const canvasAvailable = computed(() => !broken.value && webglAvailable())
const useCanvas = computed(() => canvasAvailable.value && !failed.value && supportsRelief(art.value))

async function ensureRenderer(target: HTMLCanvasElement): Promise<ReliefRenderer> {
  if (renderer) return renderer
  creating ??= import('@/utils/communityMedalRelief').then(({ createReliefRenderer }) => {
    renderer = createReliefRenderer(target)
    return renderer
  })
  return creating
}

async function mount() {
  const current = ++build
  ready.value = false
  spinner.value = false
  window.clearTimeout(spinnerTimer)
  if (!useCanvas.value) {
    emit('bounds', null)
    return
  }
  spinnerTimer = window.setTimeout(() => {
    if (current === build && !ready.value) spinner.value = true
  }, 250)
  await nextTick()
  const target = canvas.value
  const relief = art.value
  if (!target || current !== build || !supportsRelief(relief)) return
  let instance: ReliefRenderer
  try {
    instance = await ensureRenderer(target)
  } catch {
    if (current === build) broken.value = true
    return
  }
  try {
    await instance.show({ art: relief, engraving: props.engraving, reducedMotion: props.reducedMotion })
    if (current !== build) return
    ready.value = true
    spinner.value = false
    emit('bounds', instance.bounds())
    instance.prepare(
      (props.upcoming ?? []).flatMap(item => {
        const next = medalArt(item.medalKey, item.tier)
        return supportsRelief(next)
          ? [{ art: next, engraving: item.engraving, reducedMotion: props.reducedMotion }]
          : []
      }),
    )
  } catch {
    if (current === build) {
      failed.value = true
      spinner.value = false
    }
  }
}

watch(
  () => [props.medalKey, props.tier, JSON.stringify(props.engraving), props.reducedMotion],
  () => {
    failed.value = false
    void mount()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  build++
  window.clearTimeout(spinnerTimer)
  // 关闭勋章墙时释放场景并主动交还 WebGL 上下文。
  renderer?.dispose()
  renderer = null
  creating = null
})

/**
 * 保存图片用的正面图（data URL 或资源地址）。实时渲染时按正面朝前截一帧，卡片时用本档正面渲染图，
 * 缺图时把页面绘制的正面序列化成 SVG。
 */
function snapshot(root: HTMLElement | null): string | null {
  if (useCanvas.value && ready.value && renderer) return renderer.snapshot()
  if (art.value) return art.value.front
  const svg = root?.querySelector('.medal-card__face svg')
  if (!svg) return null
  const markup = new XMLSerializer().serializeToString(svg)
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
}

const host = ref<HTMLElement | null>(null)
defineExpose({ snapshot: async () => snapshot(host.value) })
</script>

<template>
  <div ref="host" class="medal-stage">
    <canvas
      v-if="canvasAvailable"
      v-show="useCanvas"
      ref="canvas"
      class="medal-stage__canvas"
      tabindex="0"
      role="button"
      :aria-label="t('community.flip')"
    />
    <MedalCard
      v-if="!useCanvas"
      :key="medalKey + (tier ?? '')"
      :medal-key="medalKey"
      :art="art"
      :engraving="engraving"
      :reduced-motion="reducedMotion"
    />
    <VProgressCircular v-if="useCanvas && spinner" indeterminate color="primary" class="medal-stage__loading" />
  </div>
</template>

<style lang="scss" scoped>
.medal-stage {
  position: relative;
  inline-size: 100%;
  aspect-ratio: 1;

  &__canvas {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    cursor: grab;
    touch-action: none;
    outline: none;

    &:active {
      cursor: grabbing;
    }

    &:focus-visible {
      border-radius: var(--app-control-radius);
      box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
    }
  }

  &__loading {
    position: absolute;
    inset: 0;
    margin: auto;
  }
}
</style>
