<script lang="ts" setup>
import type { Ref } from 'vue'
import {
  createGlassNavbarDisplacementMap,
  getGlassNavbarOpticalResponse,
  getGlassSidebarOpticalResponse,
  NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP,
} from '@/utils/glassNavbarRefraction'
import { useEffectiveGlassSettings } from '@/composables/useThemeCustomizer'

/** 独立持有几何、位移图和就绪状态的导航表面。 */
type NavigationSurface = 'navbar' | 'sidebar'

interface NavigationSurfaceState {
  /** 已解码缓存对应的完整几何与光学参数键。 */
  cachedGeometry: string
  /** 已成功解码、允许重新激活的 PNG。 */
  cachedMap: string
  /** 初始图像尺寸与计算样式不可用时的半径回退。 */
  defaultGeometry: {
    height: number
    radius: number
    width: number
  }
  /** 被观察的真实导航元素，前景控件不参与位移。 */
  element: HTMLElement | null
  /** 避免相同失败输入反复解码的键。 */
  failedGeometry: string
  /** 必须全部结束后才允许激活最终几何的过渡属性。 */
  geometryTransitions: Set<string>
  /** 输入改变时解除失败重试抑制的上一份几何键。 */
  lastObservedGeometry: string
  /** 使过时解码结果失效的单调版本。 */
  mapRevision: number
  /** 与 feImage 同批提交的 CSS 像素尺寸。 */
  mapSize: { height: number; width: number }
  /** 当前绑定到 feImage 的位移图。 */
  mapUrl: Ref<string>
  /** 正在解码的输入，重复尺寸通知不会将它取消。 */
  pendingGeometry: string
  /** CSS 只在该属性为 true 时激活对应 SVG。 */
  readyAttribute: string
  /** 承载布局资格与就绪属性的外壳。 */
  shell: HTMLElement | null
}

const settings = useEffectiveGlassSettings()
const opticalResponse = computed(() =>
  getGlassNavbarOpticalResponse({
    deformation: settings.value.glassDeformationStrength,
    translation: settings.value.glassTranslationStrength,
  }),
)

const DEFAULT_NAVBAR_GEOMETRY = {
  height: 64,
  radius: 16,
  width: 1200,
}
const DEFAULT_SIDEBAR_GEOMETRY = {
  height: 800,
  radius: 0,
  width: 260,
}
const MAP_RESIZE_SETTLE_MS = 60
const OBSERVED_SIZE_STYLE_PROPERTIES = [
  '--shell-floating-navbar-radius',
  '--shell-floating-navbar-inset',
  '--layout-navbar-block-size',
  '--layout-navbar-safe-area-top',
  '--navbar-tab-height',
  '--layout-vertical-nav-width',
  '--layout-vertical-nav-collapsed-width',
  'border-radius',
  'border-start-start-radius',
  'width',
  'height',
  'inline-size',
  'block-size',
]
const navbarMapUrl = ref(NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP)
const sidebarMapUrl = ref(NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP)
const navbarMapSize = reactive({
  height: DEFAULT_NAVBAR_GEOMETRY.height,
  width: DEFAULT_NAVBAR_GEOMETRY.width,
})
const sidebarMapSize = reactive({
  height: DEFAULT_SIDEBAR_GEOMETRY.height,
  width: DEFAULT_SIDEBAR_GEOMETRY.width,
})

let observedShell: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let stateObserver: MutationObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let transparencyQuery: MediaQueryList | null = null
const navbarState: NavigationSurfaceState = {
  cachedGeometry: '',
  cachedMap: NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP,
  defaultGeometry: DEFAULT_NAVBAR_GEOMETRY,
  element: null,
  failedGeometry: '',
  geometryTransitions: new Set(),
  lastObservedGeometry: '',
  mapRevision: 0,
  mapSize: navbarMapSize,
  mapUrl: navbarMapUrl,
  pendingGeometry: '',
  readyAttribute: 'data-glass-navbar-refraction-ready',
  shell: null,
}
const sidebarState: NavigationSurfaceState = {
  cachedGeometry: '',
  cachedMap: NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP,
  defaultGeometry: DEFAULT_SIDEBAR_GEOMETRY,
  element: null,
  failedGeometry: '',
  geometryTransitions: new Set(),
  lastObservedGeometry: '',
  mapRevision: 0,
  mapSize: sidebarMapSize,
  mapUrl: sidebarMapUrl,
  pendingGeometry: '',
  readyAttribute: 'data-glass-sidebar-refraction-ready',
  shell: null,
}
const surfaceStates: Record<NavigationSurface, NavigationSurfaceState> = {
  navbar: navbarState,
  sidebar: sidebarState,
}
const SURFACE_KEYS: readonly NavigationSurface[] = ['navbar', 'sidebar']
const transitionHandlers: Record<NavigationSurface, EventListener | null> = {
  navbar: null,
  sidebar: null,
}

function getSurfaceState(surface: NavigationSurface) {
  return surfaceStates[surface]
}

/** 只有桌面清透/色调导航进入 SVG 位移增强；磨砂固定层沿用稳定背板或原生 CSS。 */
function isRefractionActive(surface: NavigationSurface) {
  const { theme, glassAppearance, glassQuality } = document.documentElement.dataset
  const state = getSurfaceState(surface)
  const shell = state.shell
  const element = state.element

  if (
    !element ||
    !shell ||
    theme !== 'glass' ||
    (glassAppearance !== 'clear' && glassAppearance !== 'tinted') ||
    (glassQuality !== 'balanced' && glassQuality !== 'high') ||
    transparencyQuery?.matches
  )
    return false

  if (surface === 'navbar') {
    return (
      (shell.dataset.shellMode === 'desktop' &&
        !shell.classList.contains('layout-horizontal-nav-active') &&
        !shell.classList.contains('layout-window-controls-overlay-shell')) ||
      (shell.classList.contains('layout-navbar-floating-eligible') &&
        shell.classList.contains('layout-navbar-away-from-top'))
    )
  }

  return (
    !element.classList.contains('overlay-nav') &&
    !shell.classList.contains('layout-overlay-nav') &&
    !shell.classList.contains('layout-app-shell') &&
    !shell.classList.contains('layout-horizontal-nav-active')
  )
}

/** 几何或状态变化后立即撤销对应 map，避免另一个尺寸继续采样旧位移场。 */
function invalidateDisplacementMap(surface: NavigationSurface) {
  const state = getSurfaceState(surface)
  state.mapRevision += 1
  state.pendingGeometry = ''
  state.shell?.setAttribute(state.readyAttribute, 'false')
}

function getInlineStyleValue(styleText: string | null, property: string) {
  const declarations = document.createElement('div').style
  declarations.cssText = styleText ?? ''
  return declarations.getPropertyValue(property).trim()
}

/** 滚动缩放变量不改变真实采样几何，只有尺寸声明变化才撤销当前 map。 */
function hasObservedSizeStyleChange(record: MutationRecord) {
  if (record.attributeName !== 'style') return true

  const target = record.target as Element
  const currentStyle = target.getAttribute('style')

  return OBSERVED_SIZE_STYLE_PROPERTIES.some(
    property => getInlineStyleValue(record.oldValue, property) !== getInlineStyleValue(currentStyle, property),
  )
}

function handleStateMutations(records: MutationRecord[]) {
  if (records.some(hasObservedSizeStyleChange)) scheduleDisplacementMapSync()
}

/** 读取真实表面边界；圆角使用计算后的 CSS 像素，矩形侧栏明确传入 0。 */
function readDisplacementGeometry(surface: NavigationSurface) {
  const state = getSurfaceState(surface)
  if (!state.element) return null
  const bounds = state.element.getBoundingClientRect()
  const styles = getComputedStyle(state.element)
  // 自定义属性可能保留 rem；只有计算后的圆角与位移图使用同一 CSS 像素坐标。
  const borderRadius = Number.parseFloat(styles.borderStartStartRadius)
  const height = Math.max(1, Math.round(bounds.height))
  const width = Math.max(1, Math.round(bounds.width))

  const radius = Number.isFinite(borderRadius) ? borderRadius : state.defaultGeometry.radius
  const optics =
    surface === 'sidebar'
      ? getGlassSidebarOpticalResponse({
          deformation: settings.value.glassDeformationStrength,
          translation: settings.value.glassTranslationStrength,
        })
      : opticalResponse.value
  return {
    height,
    radius,
    width,
    optics,
    key: `${width}:${height}:${radius}:${optics.horizontalRatio}:${optics.verticalRatio}:${optics.translationPx}`,
  }
}

/** map 与 feImage 尺寸同批更新；解码失败或过期结果继续使用 CSS 材质。 */
async function syncDisplacementMap(surface: NavigationSurface) {
  const state = getSurfaceState(surface)
  if (!isRefractionActive(surface) || state.geometryTransitions.size > 0) return
  const geometry = readDisplacementGeometry(surface)
  if (!geometry || state.pendingGeometry === geometry.key) return
  const { height, radius, width, optics, key: geometryKey } = geometry
  const revision = ++state.mapRevision
  state.pendingGeometry = geometryKey
  if (state.lastObservedGeometry !== geometryKey) {
    state.lastObservedGeometry = geometryKey
    state.failedGeometry = ''
  }

  try {
    if (state.cachedGeometry !== geometryKey) {
      if (state.failedGeometry === geometryKey) return
      const map = createGlassNavbarDisplacementMap({ height, radius, width, optics, surface })
      if (map === NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP) {
        state.failedGeometry = geometryKey
        invalidateDisplacementMap(surface)
        return
      }
      const decoded = new Image()
      decoded.src = map
      await decoded.decode()
      if (revision !== state.mapRevision || !isRefractionActive(surface)) return
      state.cachedGeometry = geometryKey
      state.cachedMap = map
      state.failedGeometry = ''
    }
    state.mapSize.height = height
    state.mapSize.width = width
    state.mapUrl.value = state.cachedMap
    await nextTick()
    if (revision === state.mapRevision && isRefractionActive(surface)) {
      state.shell?.setAttribute(state.readyAttribute, 'true')
    }
  } catch {
    // 位移是增强能力；图片解码失败不阻断导航和原生玻璃表面。
    if (revision === state.mapRevision) {
      state.failedGeometry = geometryKey
      invalidateDisplacementMap(surface)
    }
  } finally {
    if (revision === state.mapRevision) state.pendingGeometry = ''
  }
}

function syncDisplacementMaps() {
  for (const surface of SURFACE_KEYS) void syncDisplacementMap(surface)
}

// 连续 resize 需要合并；相同几何的通知不撤销已就绪或正在解码的位移图。
function scheduleDisplacementMapSync() {
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = null

  let shouldSync = false
  for (const surface of SURFACE_KEYS) {
    const state = getSurfaceState(surface)
    if (!isRefractionActive(surface) || state.geometryTransitions.size > 0) {
      if (state.element) invalidateDisplacementMap(surface)
      continue
    }

    const geometry = readDisplacementGeometry(surface)
    if (!geometry || geometry.key === state.pendingGeometry) continue
    if (geometry.key === state.cachedGeometry && state.mapUrl.value === state.cachedMap) {
      // 取消草稿可能命中旧缓存，同时还有另一参数的解码；先使该异步结果失效。
      if (state.pendingGeometry) invalidateDisplacementMap(surface)
      state.shell?.setAttribute(state.readyAttribute, 'true')
      continue
    }
    invalidateDisplacementMap(surface)
    shouldSync = true
  }
  if (!shouldSync) return

  resizeTimer = setTimeout(() => {
    resizeTimer = null
    syncDisplacementMaps()
  }, MAP_RESIZE_SETTLE_MS)
}

function handleGeometryTransition(surface: NavigationSurface, event: TransitionEvent) {
  const state = getSurfaceState(surface)
  if (
    event.target !== state.element ||
    !/^(inset|top|left|right|width|height|inline-size|block-size|border.*radius)/u.test(event.propertyName)
  )
    return
  if (event.type === 'transitionrun') {
    state.geometryTransitions.add(event.propertyName)
    invalidateDisplacementMap(surface)
  } else {
    state.geometryTransitions.delete(event.propertyName)
    // transitionend/cancel 已给出稳定尺寸，无需再附加 resize 防抖等待。
    if (state.geometryTransitions.size === 0) {
      if (resizeTimer !== null) clearTimeout(resizeTimer)
      resizeTimer = null
      syncDisplacementMaps()
    }
  }
}

// 草稿预览和取消复用同一有效参数源，旧异步解码不可覆盖新的滑杆值。
watch(opticalResponse, scheduleDisplacementMapSync, { flush: 'sync' })

onMounted(() => {
  observedShell =
    document.querySelector<HTMLElement>('.layout-wrapper[data-glass-navigation-refraction="chromium"]') ??
    document.querySelector<HTMLElement>('.layout-wrapper[data-glass-navbar-refraction="chromium"]')
  if (!observedShell) return

  navbarState.element = observedShell.querySelector<HTMLElement>('.layout-navbar')
  // Drawer 与桌面共用此元素；资格随断点判断，不能在挂载时永久排除 overlay 状态。
  sidebarState.element = observedShell.querySelector<HTMLElement>('.layout-vertical-nav')
  for (const surface of SURFACE_KEYS) getSurfaceState(surface).shell = observedShell

  transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
  transparencyQuery.addEventListener('change', scheduleDisplacementMapSync)
  stateObserver = new MutationObserver(handleStateMutations)
  stateObserver.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: [
      'class',
      'style',
      'data-theme',
      'data-theme-radius',
      'data-glass-appearance',
      'data-glass-quality',
    ],
  })
  stateObserver.observe(observedShell, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style'],
  })
  for (const surface of SURFACE_KEYS) {
    const state = getSurfaceState(surface)
    const element = state.element
    if (!element) continue
    stateObserver.observe(element, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style'],
    })
    const transitionHandler: EventListener = event => handleGeometryTransition(surface, event as TransitionEvent)
    transitionHandlers[surface] = transitionHandler
    element.addEventListener('transitionrun', transitionHandler)
    element.addEventListener('transitionend', transitionHandler)
    element.addEventListener('transitioncancel', transitionHandler)
  }

  scheduleDisplacementMapSync()
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', scheduleDisplacementMapSync, { passive: true })

    return
  }

  resizeObserver = new ResizeObserver(scheduleDisplacementMapSync)
  for (const surface of SURFACE_KEYS) {
    const element = getSurfaceState(surface).element
    if (element) resizeObserver.observe(element)
  }
})

onBeforeUnmount(() => {
  for (const surface of SURFACE_KEYS) {
    const state = getSurfaceState(surface)
    invalidateDisplacementMap(surface)
    state.geometryTransitions.clear()
    if (state.element && transitionHandlers[surface]) {
      state.element.removeEventListener('transitionrun', transitionHandlers[surface])
      state.element.removeEventListener('transitionend', transitionHandlers[surface])
      state.element.removeEventListener('transitioncancel', transitionHandlers[surface])
    }
    transitionHandlers[surface] = null
    state.shell?.removeAttribute(state.readyAttribute)
    state.element = null
    state.shell = null
  }
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = null
  resizeObserver?.disconnect()
  resizeObserver = null
  stateObserver?.disconnect()
  stateObserver = null
  transparencyQuery?.removeEventListener('change', scheduleDisplacementMapSync)
  transparencyQuery = null
  window.removeEventListener('resize', scheduleDisplacementMapSync)
  observedShell = null
})
</script>

<template>
  <svg class="glass-navbar-refraction-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter
        id="glass-navbar-live-refraction-balanced"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          :width="navbarMapSize.width"
          :height="navbarMapSize.height"
          preserveAspectRatio="none"
          :href="navbarMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-22" />
      </filter>

      <filter
        id="glass-navbar-live-refraction-high"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          :width="navbarMapSize.width"
          :height="navbarMapSize.height"
          preserveAspectRatio="none"
          :href="navbarMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-34" />
      </filter>

      <filter
        id="glass-sidebar-live-refraction-balanced"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          :width="sidebarMapSize.width"
          :height="sidebarMapSize.height"
          preserveAspectRatio="none"
          :href="sidebarMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-22" />
      </filter>

      <filter
        id="glass-sidebar-live-refraction-high"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          :width="sidebarMapSize.width"
          :height="sidebarMapSize.height"
          preserveAspectRatio="none"
          :href="sidebarMapUrl"
          result="map"
        />
        <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="-34" />
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
.glass-navbar-refraction-defs {
  position: fixed;
  overflow: hidden;
  pointer-events: none;
}
</style>
