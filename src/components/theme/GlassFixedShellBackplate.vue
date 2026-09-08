<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { GlassFixedShellBackplateLayer } from '@/composables/useGlassFixedShellBackplate'

interface Props {
  /** 移动端 overlay 导航当前是否可见。 */
  isOverlayNavActive: boolean
  /** 当前布局是否使用移动端 overlay 导航。 */
  isOverlayNav: boolean
  /** App 壁纸状态机提供的稳定双槽位。 */
  layers: readonly GlassFixedShellBackplateLayer[]
  /** 与全局壁纸事务一致的交叉淡化时长。 */
  transitionDurationMs: number
}

/** 桌面侧栏的稳定壁纸范围；顶栏从自身下方读取滚动正文。 */
type GeometrySurface = 'sidebar'

/** SVG objectBoundingBox 坐标，分别以背板的实际宽和高归一化。 */
interface NormalizedClipRect {
  /** 可见高度占背板高度的比例。 */
  height: number
  /** 水平方向圆角半径占背板宽度的比例。 */
  rx: number
  /** 垂直方向圆角半径占背板高度的比例。 */
  ry: number
  /** 可见宽度占背板宽度的比例。 */
  width: number
  /** 相对背板左边缘的位置。 */
  x: number
  /** 相对背板上边缘的位置。 */
  y: number
}

/** 背板实际CSS像素边界，不使用可能包含滚动条的window.innerWidth。 */
interface BackplateBounds {
  /** 真实高度。 */
  height: number
  /** 实际左侧视口坐标。 */
  left: number
  /** 实际顶部视口坐标。 */
  top: number
  /** 排除滚动条后的实际宽度。 */
  width: number
}

const GEOMETRY_SURFACES: readonly GeometrySurface[] = ['sidebar']
const GEOMETRY_ATTRIBUTE_FILTER = [
  'class',
  'data-glass-appearance',
  'data-glass-quality',
  'data-shell-display-environment',
  'data-shell-mode',
  'data-shell-navbar-attachment',
  'data-theme',
  'data-theme-radius',
  'style',
]

const props = defineProps<Props>()
const mainBackplateRef = ref<HTMLElement | null>(null)
const clipRects = ref<NormalizedClipRect[]>([])
const clipPathId = `glass-fixed-shell-clip-${useId().replace(/[^a-zA-Z0-9_-]/gu, '-')}`
const transitionStyle = computed(() => ({
  '--glass-fixed-shell-transition-duration': `${Math.max(0, props.transitionDurationMs)}ms`,
}))
const mainBackplateStyle = computed(() => ({
  ...transitionStyle.value,
  clipPath: clipRects.value.length === GEOMETRY_SURFACES.length ? `url(#${clipPathId})` : undefined,
}))

const observedElements: Record<GeometrySurface, HTMLElement | null> = {
  sidebar: null,
}
const transitionHandlers: Record<GeometrySurface, EventListener | null> = {
  sidebar: null,
}

let isMounted = false
let observedShell: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let stateObserver: MutationObserver | null = null
let geometrySyncQueued = false
let usesResizeFallback = false
let lastGeometryKey = ''

function getLayoutShell() {
  return mainBackplateRef.value?.closest('.layout-wrapper') as HTMLElement | null
}

/** 仅为桌面连接式导航启用几何裁剪，其他壳层继续使用主题原有 CSS 裁剪。 */
function isConnectedDesktopShell(shell: HTMLElement) {
  return (
    document.documentElement.dataset.theme === 'glass' &&
    !props.isOverlayNav &&
    shell.dataset.shellMode === 'desktop' &&
    shell.dataset.shellNavbarAttachment === 'connected' &&
    !shell.classList.contains('layout-horizontal-nav-active') &&
    !shell.classList.contains('layout-overlay-nav') &&
    !shell.classList.contains('layout-app-shell') &&
    !shell.classList.contains('layout-window-controls-overlay-shell')
  )
}

function readBackplateBounds(): BackplateBounds | null {
  const backplate = mainBackplateRef.value
  if (!backplate) return null

  const bounds = backplate.getBoundingClientRect()
  const width = Number.isFinite(bounds.width) ? Math.max(0, bounds.width) : 0
  const height = Number.isFinite(bounds.height) ? Math.max(0, bounds.height) : 0
  if (width <= 0 || height <= 0) return null

  return {
    height,
    left: Number.isFinite(bounds.left) ? bounds.left : 0,
    top: Number.isFinite(bounds.top) ? bounds.top : 0,
    width,
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

/** 固定导航四角共用等半径；读取计算后的像素值与CSS轮廓保持一致。 */
function readComputedRadius(element: HTMLElement) {
  const radius = Number.parseFloat(window.getComputedStyle(element).borderTopLeftRadius)
  return Number.isFinite(radius) ? Math.max(0, radius) : 0
}

function readNormalizedClipRect(element: HTMLElement, backplate: BackplateBounds) {
  const bounds = element.getBoundingClientRect()
  const left = Number.isFinite(bounds.left) ? bounds.left : 0
  const top = Number.isFinite(bounds.top) ? bounds.top : 0
  const width = Number.isFinite(bounds.width) ? Math.max(0, bounds.width) : 0
  const height = Number.isFinite(bounds.height) ? Math.max(0, bounds.height) : 0
  const right = Number.isFinite(bounds.right) ? bounds.right : left + width
  const bottom = Number.isFinite(bounds.bottom) ? bounds.bottom : top + height
  const visibleLeft = clamp(Math.min(left, right) - backplate.left, 0, backplate.width)
  const visibleTop = clamp(Math.min(top, bottom) - backplate.top, 0, backplate.height)
  const visibleRight = clamp(Math.max(left, right) - backplate.left, 0, backplate.width)
  const visibleBottom = clamp(Math.max(top, bottom) - backplate.top, 0, backplate.height)
  const visibleWidth = visibleRight - visibleLeft
  const visibleHeight = visibleBottom - visibleTop

  if (visibleWidth <= 0 || visibleHeight <= 0) return null

  const radius = readComputedRadius(element)
  const normalizedWidth = visibleWidth / backplate.width
  const normalizedHeight = visibleHeight / backplate.height

  return {
    height: normalizedHeight,
    rx: clamp(radius / backplate.width, 0, normalizedWidth / 2),
    ry: clamp(radius / backplate.height, 0, normalizedHeight / 2),
    width: normalizedWidth,
    x: visibleLeft / backplate.width,
    y: visibleTop / backplate.height,
  } satisfies NormalizedClipRect
}

function bindGeometrySurface(surface: GeometrySurface, element: HTMLElement | null) {
  const previousElement = observedElements[surface]
  if (previousElement === element) return

  if (resizeObserver && previousElement) resizeObserver.unobserve(previousElement)
  const previousHandler = transitionHandlers[surface]
  if (previousElement && previousHandler) {
    previousElement.removeEventListener('transitionrun', previousHandler)
    previousElement.removeEventListener('transitionend', previousHandler)
    previousElement.removeEventListener('transitioncancel', previousHandler)
  }

  observedElements[surface] = element
  transitionHandlers[surface] = null
  if (!element) return

  resizeObserver?.observe(element)
  const transitionHandler: EventListener = () => scheduleGeometrySync()
  transitionHandlers[surface] = transitionHandler
  element.addEventListener('transitionrun', transitionHandler)
  element.addEventListener('transitionend', transitionHandler)
  element.addEventListener('transitioncancel', transitionHandler)
}

function observeStateSources() {
  if (!stateObserver) return

  stateObserver.disconnect()
  stateObserver.observe(document.documentElement, {
    attributeFilter: GEOMETRY_ATTRIBUTE_FILTER,
    attributes: true,
  })
  if (document.body) {
    stateObserver.observe(document.body, {
      attributeFilter: GEOMETRY_ATTRIBUTE_FILTER,
      attributes: true,
    })
  }
  if (observedShell) {
    stateObserver.observe(observedShell, {
      attributeFilter: GEOMETRY_ATTRIBUTE_FILTER,
      attributes: true,
    })
  }
}

function refreshObservedElements() {
  const shell = getLayoutShell()
  if (shell !== observedShell) {
    observedShell = shell
    observeStateSources()
  }

  bindGeometrySurface('sidebar', shell?.querySelector<HTMLElement>('.layout-vertical-nav:not(.overlay-nav)') ?? null)
}

function applyGeometry(nextRects: NormalizedClipRect[]) {
  const nextKey = JSON.stringify(nextRects)
  if (nextKey === lastGeometryKey) return

  lastGeometryKey = nextKey
  clipRects.value = nextRects
}

function syncGeometry() {
  if (!isMounted) return

  refreshObservedElements()
  const shell = observedShell
  const backplate = readBackplateBounds()
  const sidebar = observedElements.sidebar

  if (!shell || !backplate || !isConnectedDesktopShell(shell) || !sidebar) {
    applyGeometry([])
    return
  }

  const nextRects = GEOMETRY_SURFACES.map(surface =>
    readNormalizedClipRect(observedElements[surface] as HTMLElement, backplate),
  )
  if (nextRects.some(rect => rect === null)) {
    applyGeometry([])
    return
  }

  applyGeometry(nextRects as NormalizedClipRect[])
}

function scheduleGeometrySync() {
  if (geometrySyncQueued) return

  geometrySyncQueued = true
  queueMicrotask(() => {
    geometrySyncQueued = false
    syncGeometry()
  })
}

watch(() => props.isOverlayNav, scheduleGeometrySync, { flush: 'sync' })

onMounted(() => {
  isMounted = true
  stateObserver = new MutationObserver(scheduleGeometrySync)
  resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleGeometrySync())
  usesResizeFallback = resizeObserver === null
  if (usesResizeFallback) window.addEventListener('resize', scheduleGeometrySync, { passive: true })
  else if (mainBackplateRef.value) resizeObserver?.observe(mainBackplateRef.value)

  refreshObservedElements()
  observeStateSources()
  syncGeometry()
  void nextTick(syncGeometry)
})

onBeforeUnmount(() => {
  isMounted = false
  stateObserver?.disconnect()
  stateObserver = null
  resizeObserver?.disconnect()
  resizeObserver = null
  if (usesResizeFallback) window.removeEventListener('resize', scheduleGeometrySync)
  usesResizeFallback = false

  for (const surface of GEOMETRY_SURFACES) bindGeometrySurface(surface, null)
  observedShell = null
  geometrySyncQueued = false
  lastGeometryKey = ''
})
</script>

<template>
  <div
    ref="mainBackplateRef"
    class="glass-fixed-shell-backplate glass-fixed-shell-backplate--main"
    data-backplate-surface="main"
    :style="mainBackplateStyle"
    aria-hidden="true"
  >
    <div
      v-for="layer in layers"
      :key="layer.key"
      class="glass-fixed-shell-backplate__layer"
      :class="`is-${layer.role}`"
      :data-backplate-slot="layer.key"
    >
      <div class="glass-fixed-shell-backplate__wallpaper" :style="layer.style">
        <img
          v-if="layer.src"
          class="glass-fixed-shell-backplate__source"
          :crossorigin="layer.crossOrigin"
          :src="layer.src"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
    </div>
  </div>

  <svg class="glass-fixed-shell-backplate__geometry" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="clipPathId" clipPathUnits="objectBoundingBox">
        <rect
          v-for="(rect, index) in clipRects"
          :key="GEOMETRY_SURFACES[index]"
          :data-clip-surface="GEOMETRY_SURFACES[index]"
          :height="rect.height"
          :rx="rect.rx"
          :ry="rect.ry"
          :width="rect.width"
          :x="rect.x"
          :y="rect.y"
        />
      </clipPath>
    </defs>
  </svg>

  <div
    v-if="isOverlayNav"
    class="glass-fixed-shell-backplate glass-fixed-shell-backplate--overlay-nav"
    :class="{ 'is-visible': isOverlayNavActive }"
    data-backplate-surface="overlay-nav"
    :style="transitionStyle"
    aria-hidden="true"
  >
    <div
      v-for="layer in layers"
      :key="layer.key"
      class="glass-fixed-shell-backplate__layer"
      :class="`is-${layer.role}`"
      :data-backplate-slot="layer.key"
    >
      <div class="glass-fixed-shell-backplate__wallpaper" :style="layer.style">
        <img
          v-if="layer.src"
          class="glass-fixed-shell-backplate__source"
          :crossorigin="layer.crossOrigin"
          :src="layer.src"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '@configured-variables' as variables;
@use '@layouts/styles/mixins';

.glass-fixed-shell-backplate {
  position: fixed;
  overflow: hidden;
  contain: strict;
  inset: 0;
  isolation: isolate;
  pointer-events: none;
}

.glass-fixed-shell-backplate__geometry {
  position: fixed;
  overflow: hidden;
  pointer-events: none;
}

.glass-fixed-shell-backplate--main {
  --glass-fixed-shell-nav-inline-size: #{variables.$layout-vertical-nav-width};

  // 壁纸槽位以0.92透明度交叉淡化；不透明底板阻止未扩散的正文从槽位余量透穿。
  background-color: rgb(23, 27, 32);
  z-index: variables.$layout-vertical-nav-layout-navbar-z-index - 1;
  clip-path: polygon(
    0 0,
    calc(100% - 0.5rem) 0,
    calc(100% - 0.5rem) var(--layout-navbar-block-size),
    var(--glass-fixed-shell-nav-inline-size) var(--layout-navbar-block-size),
    var(--glass-fixed-shell-nav-inline-size) 100%,
    0 100%
  );
  transition: clip-path 240ms var(--mp-motion-ease-standard);
}

.layout-wrapper.layout-vertical-nav-collapsed > .glass-fixed-shell-backplate--main {
  --glass-fixed-shell-nav-inline-size: #{variables.$layout-vertical-nav-collapsed-width};
}

.layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav, .layout-app-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0);
}

.layout-wrapper.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell):not(
    .layout-window-controls-overlay-shell
  )
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 100% 0);
}

.layout-wrapper.layout-app-shell:is(
    .layout-standalone-pwa-shell,
    .layout-window-controls-overlay-shell
  ).layout-navbar-compact
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-safe-area-top)) 0);
}

.layout-wrapper.layout-navbar-floating-eligible > .glass-fixed-shell-backplate--main {
  transform: translate3d(0, 0, 0) scaleX(1);
  transform-origin: center top;
  transition: transform var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing);
}

.layout-wrapper.layout-navbar-floating-eligible.layout-navbar-away-from-top > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0 round var(--shell-floating-navbar-radius));
  transform: translate3d(0, var(--shell-floating-navbar-inset), 0) scaleX(var(--shell-floating-navbar-scale-x));
}

[dir='rtl'] .layout-wrapper > .glass-fixed-shell-backplate--main {
  clip-path: polygon(
    0.5rem 0,
    100% 0,
    100% 100%,
    calc(100% - var(--glass-fixed-shell-nav-inline-size)) 100%,
    calc(100% - var(--glass-fixed-shell-nav-inline-size)) var(--layout-navbar-block-size),
    0.5rem var(--layout-navbar-block-size)
  );
}

[dir='rtl']
  .layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav, .layout-app-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0);
}

[dir='rtl']
  .layout-wrapper.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell):not(
    .layout-window-controls-overlay-shell
  )
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 100% 0);
}

[dir='rtl']
  .layout-wrapper.layout-app-shell:is(
    .layout-standalone-pwa-shell,
    .layout-window-controls-overlay-shell
  ).layout-navbar-compact
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-safe-area-top)) 0);
}

[dir='rtl']
  .layout-wrapper.layout-navbar-floating-eligible.layout-navbar-away-from-top
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0 round var(--shell-floating-navbar-radius));
}

// 桌面顶栏必须直接采样正文；首帧 CSS 与运行时圆角裁剪都只为侧栏保留壁纸。
.layout-wrapper[data-shell-mode='desktop']:not(.layout-window-controls-overlay-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(
    var(--glass-v3-navigation-inset, 8px) calc(100% - var(--glass-fixed-shell-nav-inline-size))
      var(--glass-v3-navigation-inset, 8px) var(--glass-v3-navigation-inset, 8px) round
      var(--glass-v3-navigation-radius, 16px)
  );
}

[dir='rtl']
  .layout-wrapper[data-shell-mode='desktop']:not(.layout-window-controls-overlay-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(
    var(--glass-v3-navigation-inset, 8px) var(--glass-v3-navigation-inset, 8px) var(--glass-v3-navigation-inset, 8px)
      calc(100% - var(--glass-fixed-shell-nav-inline-size)) round var(--glass-v3-navigation-radius, 16px)
  );
}

.layout-wrapper[data-shell-mode='desktop'].layout-horizontal-nav-active:not(.layout-window-controls-overlay-shell)
  > .glass-fixed-shell-backplate--main {
  display: none;
}

.glass-fixed-shell-backplate--overlay-nav {
  z-index: variables.$layout-vertical-nav-z-index - 1;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.25s ease-in-out;

  &.is-visible {
    clip-path: inset(0 calc(100% - #{variables.$layout-vertical-nav-width}) 0 0);
  }

  @include mixins.rtl {
    clip-path: inset(0 0 0 100%);

    &.is-visible {
      clip-path: inset(0 0 0 calc(100% - #{variables.$layout-vertical-nav-width}));
    }
  }
}

.glass-fixed-shell-backplate__layer {
  position: absolute;
  filter: var(--glass-fixed-shell-backplate-filter);
  inset: 0;
  opacity: 0;
  transition: opacity var(--glass-fixed-shell-transition-duration, 1500ms) ease;
  will-change: opacity;

  &.is-active {
    z-index: 2;
    opacity: 0.92;
  }

  &.is-previous {
    z-index: 1;
  }
}

.glass-fixed-shell-backplate__wallpaper {
  position: absolute;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: brightness(var(--glass-wallpaper-brightness, 0.82)) saturate(0.9);
  inset: 0;

  &::after {
    position: absolute;
    background: linear-gradient(rgba(6, 10, 19, 24%) 0%, rgba(6, 10, 19, 48%) 100%), rgba(11, 19, 34, 8%);
    content: '';
    inset: 0;
  }
}

.glass-fixed-shell-backplate__source {
  position: absolute;
  display: block;
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .glass-fixed-shell-backplate,
  .glass-fixed-shell-backplate__layer {
    transition-duration: 0.01ms !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-fixed-shell-backplate {
    display: none;
  }
}
</style>
