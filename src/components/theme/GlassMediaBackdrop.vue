<script setup lang="ts">
import { isChromiumFixedShellBackplateBrowser } from '@/composables/useGlassFixedShellBackplate'
import { useMediaQuery } from '@vueuse/core'
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from 'vue'
import { useTheme } from 'vuetify'

interface SharedBackdrop extends CSSProperties {
  /** 所有待显示海报的圆角并集，使用承载层局部坐标。 */
  clipPath: string
  /** 只分配尚未被海报覆盖的行区间，不随累计分页高度增长。 */
  height: string
  /** 相对列表容器的起点，随虚拟占位更新而非逐帧追随 scrollY。 */
  top: string
}

const root = ref<HTMLElement | null>(null)
const backdrop = shallowRef<SharedBackdrop | null>(null)
const theme = useTheme()
const reducedTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)')
const supported =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('clip-path', 'path("M0 0H1V1Z")') &&
  CSS.supports('backdrop-filter', 'blur(1px)') &&
  isChromiumFixedShellBackplateBrowser()
const enabled = computed(() => supported && theme.global.name.value === 'glass' && !reducedTransparency.value)
const ownedCards = new Set<HTMLElement>()
let active = false
let frame = 0
let mutationObserver: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null

function releaseCards() {
  for (const card of ownedCards) delete card.dataset.glassSharedBackdrop
  ownedCards.clear()
  backdrop.value = null
}

/** 共享层只处理无位移表面；悬停及其退出动画由原生卡片独立采样。 */
function isStationary(card: HTMLElement, css: CSSStyleDeclaration) {
  if (card.classList.contains('app-hover-lift-card--hovering')) return false
  if (css.transform === 'none' || !css.transform) return true

  return new DOMMatrixReadOnly(css.transform).isIdentity
}

function cornerRadius(value: string, width: number, height: number) {
  const parts = value.split(' ')
  const parse = (part: string, size: number) =>
    part.endsWith('%') ? (parseFloat(part) * size) / 100 : parseFloat(part)
  return [
    Math.min(width / 2, Math.max(0, parse(parts[0], width) || 0)),
    Math.min(height / 2, Math.max(0, parse(parts[1] ?? parts[0], height) || 0)),
  ]
}

function update() {
  frame = 0
  const container = root.value
  if (!active || !enabled.value || !container || container.closest('.v-overlay__content')) {
    releaseCards()
    return
  }
  const base = container.getBoundingClientRect()
  if (!base.width || !base.height) {
    releaseCards()
    return
  }

  const nextCards = new Set<HTMLElement>()
  const rects = []
  let top = Infinity
  let bottom = -Infinity
  for (const card of container.querySelectorAll<HTMLElement>('.media-card')) {
    if (card.dataset.glassOpticalMode === 'excluded') continue
    const css = getComputedStyle(card)
    if (!isStationary(card, css)) continue
    const box = card.getBoundingClientRect()
    if (!box.width || !box.height) continue
    const x = box.left - base.left
    const y = box.top - base.top
    rects.push({
      x,
      y,
      w: box.width,
      h: box.height,
      corners: [
        css.borderTopLeftRadius,
        css.borderTopRightRadius,
        css.borderBottomRightRadius,
        css.borderBottomLeftRadius,
      ].map(value => cornerRadius(value, box.width, box.height)),
    })
    top = Math.min(top, y)
    bottom = Math.max(bottom, y + box.height)
    nextCards.add(card)
  }

  const paths = rects.map(({ x, y: offsetY, w, h, corners: [tl, tr, br, bl] }) => {
    const y = offsetY - top
    return `M${x + tl[0]} ${y}H${x + w - tr[0]}A${tr[0]} ${tr[1]} 0 0 1 ${x + w} ${y + tr[1]}V${y + h - br[1]}A${br[0]} ${br[1]} 0 0 1 ${x + w - br[0]} ${y + h}H${x + bl[0]}A${bl[0]} ${bl[1]} 0 0 1 ${x} ${y + h - bl[1]}V${y + tl[1]}A${tl[0]} ${tl[1]} 0 0 1 ${x + tl[0]} ${y}Z`
  })
  // 先计算完整几何，再在同一帧交接采样所有权；不得提前移除尚未就绪的逐卡滤镜。
  const nextBackdrop = paths.length
    ? { clipPath: `path("${paths.join(' ')}")`, top: `${top}px`, height: `${bottom - top}px` }
    : null
  if (
    nextBackdrop?.clipPath !== backdrop.value?.clipPath ||
    nextBackdrop?.top !== backdrop.value?.top ||
    nextBackdrop?.height !== backdrop.value?.height
  )
    backdrop.value = nextBackdrop
  for (const card of ownedCards) {
    if (!nextCards.has(card)) delete card.dataset.glassSharedBackdrop
  }
  ownedCards.clear()
  for (const card of nextCards) {
    if (card.dataset.glassSharedBackdrop !== 'true') card.dataset.glassSharedBackdrop = 'true'
    ownedCards.add(card)
  }
}

function schedule() {
  if (active && enabled.value && !frame) frame = requestAnimationFrame(update)
}

function stop() {
  if (frame) cancelAnimationFrame(frame)
  frame = 0
  mutationObserver?.disconnect()
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  mutationObserver = null
  resizeObserver = null
  themeObserver = null
  releaseCards()
}

function start() {
  stop()
  if (!active || !enabled.value || !root.value) return
  mutationObserver = new MutationObserver(records => {
    if (
      records.some(record => {
        if (record.type === 'childList')
          return [...record.addedNodes, ...record.removedNodes].some(
            node =>
              node instanceof Element &&
              (node.matches('.media-card,[data-progressive-grid-index]') || node.querySelector('.media-card')),
          )
        return record.target instanceof Element && record.target.matches('.media-card,.progressive-card-grid__spacer')
      })
    )
      schedule()
  })
  mutationObserver.observe(root.value, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-glass-optical-mode', 'class', 'style'],
  })
  resizeObserver = new ResizeObserver(schedule)
  resizeObserver.observe(root.value)
  themeObserver = new MutationObserver(schedule)
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme-radius'] })
  schedule()
}

onMounted(() => {
  active = true
  start()
})
onActivated(() => {
  active = true
  start()
})
onDeactivated(() => {
  active = false
  stop()
})
onUnmounted(() => {
  active = false
  stop()
})
watch(enabled, start, { flush: 'post' })
</script>

<template>
  <div
    ref="root"
    class="glass-media-backdrop"
    :class="{ 'glass-media-backdrop--active': enabled }"
    @transitionend="schedule"
  >
    <div
      v-if="backdrop"
      class="glass-media-backdrop__sampling"
      :style="backdrop"
      aria-hidden="true"
      data-glass-optical-mode="excluded"
    />
    <slot />
  </div>
</template>

<style scoped>
.glass-media-backdrop--active {
  position: relative;
}

.glass-media-backdrop--active > :deep(.progressive-card-grid) {
  position: relative;
  z-index: 1;
}

.glass-media-backdrop__sampling {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  inset-inline-start: 0;
  inline-size: 100%;
  backdrop-filter: var(--glass-native-surface-backdrop-filter);
  -webkit-backdrop-filter: var(--glass-native-surface-backdrop-filter);
}

/* 只移交原生采样；卡片自身的颜色、轮廓和增强档光学资格保持不变。 */
:deep(.media-card[data-glass-shared-backdrop='true']) {
  --glass-native-surface-backdrop-filter: none;
  --glass-surface-backdrop-filter: none;
}
</style>
