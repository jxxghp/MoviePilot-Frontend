<script lang="ts" setup>
import {
  createGlassNavbarDisplacementMap,
  getGlassNavbarOpticalResponse,
  NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP,
} from '@/utils/glassNavbarRefraction'
import { useEffectiveGlassSettings } from '@/composables/useThemeCustomizer'

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
const MAP_RESIZE_SETTLE_MS = 60
const OBSERVED_SIZE_STYLE_PROPERTIES = [
  '--shell-floating-navbar-radius',
  '--shell-floating-navbar-inset',
  '--layout-navbar-block-size',
  '--layout-navbar-safe-area-top',
  '--navbar-tab-height',
  'border-radius',
  'border-start-start-radius',
  'width',
  'height',
  'inline-size',
  'block-size',
]
const displacementMapUrl = ref(NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP)
const displacementMapSize = reactive({
  height: DEFAULT_NAVBAR_GEOMETRY.height,
  width: DEFAULT_NAVBAR_GEOMETRY.width,
})

let observedNavbar: HTMLElement | null = null
let observedShell: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let stateObserver: MutationObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let transparencyQuery: MediaQueryList | null = null
let mapRevision = 0
let cachedGeometry = ''
let cachedMap = NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP
let failedGeometry = ''
let lastObservedGeometry = ''
const geometryTransitions = new Set<string>()

/** CSS 档、非水平浮动态与无障碍回退不生成或启用位移图。 */
function isRefractionActive() {
  const { theme, glassAppearance, glassQuality } = document.documentElement.dataset

  return (
    theme === 'glass' &&
    (glassAppearance === 'clear' || glassAppearance === 'tinted') &&
    (glassQuality === 'balanced' || glassQuality === 'high') &&
    observedShell?.classList.contains('layout-navbar-floating-eligible') &&
    observedShell.classList.contains('layout-navbar-away-from-top') &&
    !transparencyQuery?.matches
  )
}

/** 几何或状态变化后立即撤销旧 map，避免在另一个尺寸中采样。 */
function invalidateDisplacementMap() {
  mapRevision += 1
  observedShell?.setAttribute('data-glass-navbar-refraction-ready', 'false')
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

/** map 与 feImage 尺寸同批更新；解码失败或过期结果继续使用 CSS 材质。 */
async function syncDisplacementMap() {
  if (!observedNavbar || !isRefractionActive() || geometryTransitions.size > 0) return
  const revision = ++mapRevision

  const bounds = observedNavbar.getBoundingClientRect()
  const styles = getComputedStyle(observedNavbar)
  // 自定义属性可能保留 rem；只有计算后的圆角与位移图使用同一 CSS 像素坐标。
  const borderRadius = Number.parseFloat(styles.borderStartStartRadius)
  const height = Math.max(1, Math.round(bounds.height))
  const width = Math.max(1, Math.round(bounds.width))

  const radius = Number.isFinite(borderRadius) ? borderRadius : DEFAULT_NAVBAR_GEOMETRY.radius
  const optics = opticalResponse.value
  const geometryKey = `${width}:${height}:${radius}:${optics.horizontalRatio}:${optics.verticalRatio}:${optics.translationPx}`
  if (lastObservedGeometry !== geometryKey) {
    lastObservedGeometry = geometryKey
    failedGeometry = ''
  }

  try {
    if (cachedGeometry !== geometryKey) {
      if (failedGeometry === geometryKey) return
      const map = createGlassNavbarDisplacementMap({ height, radius, width, optics })
      if (map === NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP) {
        failedGeometry = geometryKey
        invalidateDisplacementMap()
        return
      }
      const decoded = new Image()
      decoded.src = map
      await decoded.decode()
      if (revision !== mapRevision || !isRefractionActive()) return
      cachedGeometry = geometryKey
      cachedMap = map
      failedGeometry = ''
    }
    displacementMapSize.height = height
    displacementMapSize.width = width
    displacementMapUrl.value = cachedMap
    await nextTick()
    if (revision === mapRevision && isRefractionActive()) {
      observedShell?.setAttribute('data-glass-navbar-refraction-ready', 'true')
    }
  } catch {
    // 位移是增强能力；图片解码失败不阻断导航和原生玻璃表面。
    if (revision === mapRevision) {
      failedGeometry = geometryKey
      invalidateDisplacementMap()
    }
  }
}

// 动画期间使用同族 CSS 材质；尺寸稳定后只重建一次，不逐帧生成或拉伸旧图。
function scheduleDisplacementMapSync() {
  invalidateDisplacementMap()
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  if (!isRefractionActive()) return
  resizeTimer = setTimeout(() => {
    resizeTimer = null
    void syncDisplacementMap()
  }, MAP_RESIZE_SETTLE_MS)
}

function handleGeometryTransition(event: TransitionEvent) {
  if (
    event.target !== observedNavbar ||
    !/^(inset|top|left|right|width|height|inline-size|block-size|border.*radius)/u.test(event.propertyName)
  )
    return
  if (event.type === 'transitionrun') {
    geometryTransitions.add(event.propertyName)
    invalidateDisplacementMap()
  } else {
    geometryTransitions.delete(event.propertyName)
    if (geometryTransitions.size === 0) scheduleDisplacementMapSync()
  }
}

// 草稿预览和取消复用同一有效参数源，旧异步解码不可覆盖新的滑杆值。
watch(opticalResponse, scheduleDisplacementMapSync, { flush: 'sync' })

onMounted(() => {
  observedNavbar = document.querySelector('.layout-wrapper[data-glass-navbar-refraction="chromium"] .layout-navbar')
  if (!observedNavbar) return
  observedShell = observedNavbar.closest('.layout-wrapper')
  transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
  transparencyQuery.addEventListener('change', scheduleDisplacementMapSync)
  stateObserver = new MutationObserver(handleStateMutations)
  stateObserver.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-glass-appearance', 'data-glass-quality'],
  })
  if (observedShell) {
    stateObserver.observe(observedShell, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style'],
    })
  }
  stateObserver.observe(observedNavbar, {
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ['class', 'style'],
  })
  observedNavbar.addEventListener('transitionrun', handleGeometryTransition)
  observedNavbar.addEventListener('transitionend', handleGeometryTransition)
  observedNavbar.addEventListener('transitioncancel', handleGeometryTransition)

  scheduleDisplacementMapSync()
  if (typeof ResizeObserver === 'undefined') {
    window.addEventListener('resize', scheduleDisplacementMapSync, { passive: true })

    return
  }

  resizeObserver = new ResizeObserver(scheduleDisplacementMapSync)
  resizeObserver.observe(observedNavbar)
})

onBeforeUnmount(() => {
  invalidateDisplacementMap()
  geometryTransitions.clear()
  if (resizeTimer !== null) clearTimeout(resizeTimer)
  resizeTimer = null
  resizeObserver?.disconnect()
  resizeObserver = null
  stateObserver?.disconnect()
  stateObserver = null
  transparencyQuery?.removeEventListener('change', scheduleDisplacementMapSync)
  transparencyQuery = null
  observedNavbar?.removeEventListener('transitionrun', handleGeometryTransition)
  observedNavbar?.removeEventListener('transitionend', handleGeometryTransition)
  observedNavbar?.removeEventListener('transitioncancel', handleGeometryTransition)
  observedShell?.removeAttribute('data-glass-navbar-refraction-ready')
  window.removeEventListener('resize', scheduleDisplacementMapSync)
  observedNavbar = null
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
          :width="displacementMapSize.width"
          :height="displacementMapSize.height"
          preserveAspectRatio="none"
          :href="displacementMapUrl"
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
          :width="displacementMapSize.width"
          :height="displacementMapSize.height"
          preserveAspectRatio="none"
          :href="displacementMapUrl"
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
