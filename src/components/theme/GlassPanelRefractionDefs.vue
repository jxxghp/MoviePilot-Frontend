<script setup lang="ts">
import { useEffectiveGlassSettings } from '@/composables/useThemeCustomizer'
import {
  createGlassNavbarDisplacementMap,
  createGlassPanelBackdropMap,
  getGlassSidebarOpticalResponse,
  NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP,
  supportsGlassNavbarLiveRefraction,
} from '@/utils/glassNavbarRefraction'
import { getGlassMaterialResponse } from '@/utils/glassOptics'

/** 内容面使用真实背景，固定磨砂导航复用稳定背板。 */
type SurfaceKind = 'card' | 'navbar' | 'sidebar' | 'backplate'

interface FilterDefinition {
  /** 当前组件内稳定且唯一的 SVG 引用。 */
  id: string
  /** 与位移图一致的 CSS 像素宽度。 */
  width: number
  /** 与位移图一致的 CSS 像素高度。 */
  height: number
  /** 已解码的位移和散射权重图。 */
  image: string
}

interface SurfaceBinding {
  /** 表面拥有者；前景内容不进入滤镜输入。 */
  element: HTMLElement
  /** 决定背景滤镜或稳定壁纸滤镜的承载方式。 */
  kind: SurfaceKind
  /** 表面对应的独立滤镜标识。 */
  id: string
  /** 用于检测真实几何改变的缓存键。 */
  key: string
  /** 只恢复本组件仍拥有的内联声明，避免覆盖其他运行态写入。 */
  styles: Map<string, { previous: string; priority: string; applied: string }>
  /** 原有表面标记，解除接管时恢复。 */
  previousMarker: string | null
  /** 背景所有权在解码前发布，避免质量切换时短暂叠加 WebGL 静态背景。 */
  previousOwner: string | null
}

const definitions = shallowRef<FilterDefinition[]>([])
const svg = ref<SVGSVGElement | null>(null)
const settings = useEffectiveGlassSettings()
const prefix = `glass-panel-${getCurrentInstance()?.uid ?? 0}`
const optics = computed(() =>
  getGlassSidebarOpticalResponse({
    deformation: settings.value.glassDeformationStrength,
    translation: settings.value.glassTranslationStrength,
  }),
)
const bodyBlur = computed(() => {
  if (settings.value.glassAppearance !== 'frosted') return 0
  const material = getGlassMaterialResponse(settings.value.glassAppearance, settings.value.glassTransparencyStrength)
  return (settings.value.glassQuality === 'high' ? 10 : 16) * material.frostBlurScale
})
const scale = computed(() => {
  const response = optics.value
  if (!response.horizontalRatio && !response.verticalRatio && !response.translationPx) return 0
  return settings.value.glassQuality === 'high' ? -34 : -22
})
const surfaces = new Map<HTMLElement, SurfaceBinding>()
const imageCache = new Map<string, Promise<string>>()
const geometryAnchors = new Set<HTMLElement>()
const nearbyCards = new Set<HTMLElement>()
// 提前一个短滚动距离准备材质；远处卡片不分配 SVG 滤镜和全尺寸位移图。
const CARD_PREWARM_MARGIN = 256
let shell: HTMLElement | null = null
let observer: MutationObserver | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let reducedTransparency: MediaQueryList | null = null
let syncFrame: number | null = null
let revision = 0
let sequence = 0
let disposed = false

function setStyle(binding: SurfaceBinding, property: string, value: string) {
  const style = binding.element.style
  if (!binding.styles.has(property)) {
    binding.styles.set(property, {
      previous: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
      applied: value,
    })
  }
  style.setProperty(property, value, 'important')
  // CSSOM 可能规范化数值与空白；用浏览器实际保存值判断后续写入所有权。
  binding.styles.get(property)!.applied = style.getPropertyValue(property)
}

function release(binding: SurfaceBinding) {
  for (const [property, record] of binding.styles) {
    if (binding.element.style.getPropertyValue(property) !== record.applied) continue
    if (record.previous) binding.element.style.setProperty(property, record.previous, record.priority)
    else binding.element.style.removeProperty(property)
  }
  binding.styles.clear()
  if (binding.element.dataset.glassPanelRefraction === binding.id) {
    if (binding.previousMarker === null) binding.element.removeAttribute('data-glass-panel-refraction')
    else binding.element.setAttribute('data-glass-panel-refraction', binding.previousMarker)
  }
}

function forget(binding: SurfaceBinding) {
  release(binding)
  if (binding.element.dataset.glassPanelOwner === binding.id) {
    if (binding.previousOwner === null) binding.element.removeAttribute('data-glass-panel-owner')
    else binding.element.setAttribute('data-glass-panel-owner', binding.previousOwner)
  }
  resizeObserver?.unobserve(binding.element)
  intersectionObserver?.unobserve(binding.element)
  nearbyCards.delete(binding.element)
}

function suspend() {
  revision += 1
  if (syncFrame !== null) cancelAnimationFrame(syncFrame)
  syncFrame = null
  for (const binding of surfaces.values()) release(binding)
}

function reset() {
  suspend()
  for (const binding of surfaces.values()) forget(binding)
  for (const element of geometryAnchors) resizeObserver?.unobserve(element)
  surfaces.clear()
  geometryAnchors.clear()
  nearbyCards.clear()
  definitions.value = []
}

function isEligible() {
  return (
    !disposed &&
    shell?.isConnected &&
    document.documentElement.dataset.theme === 'glass' &&
    !reducedTransparency?.matches &&
    shell?.dataset.shellMode === 'desktop' &&
    settings.value.glassQuality !== 'css' &&
    supportsGlassNavbarLiveRefraction()
  )
}

function canEnhance() {
  return isEligible() && document.visibilityState !== 'hidden' && document.hasFocus()
}

/** 只收集完整的顶层内容表面，图片、内嵌卡片和弹层保持现有材质。 */
function collectSurfaces() {
  const result = new Map<HTMLElement, SurfaceKind>()
  if (!shell) return result
  for (const element of shell.querySelectorAll<HTMLElement>(
    '.layout-page-content .v-card, .dashboard-grid-content-measure .v-card',
  )) {
    if (
      element.parentElement?.closest('.v-card') ||
      element.closest('.v-overlay, .no-blur, [data-glass-optical-mode="excluded"]') ||
      element.matches('.media-card, .playing-card, .bg-primary, .bg-success, .bg-info, .bg-warning, .bg-error')
    )
      continue
    const bounds = element.getBoundingClientRect()
    if (bounds.width < 4 || bounds.height < 4 || bounds.width * bounds.height > 4_000_000) continue
    result.set(element, 'card')
  }
  if (!shell.matches('.layout-horizontal-nav-active, .layout-window-controls-overlay-shell')) {
    if (settings.value.glassAppearance === 'frosted') {
      for (const element of shell.querySelectorAll<HTMLElement>(
        '.glass-fixed-shell-backplate--main .glass-fixed-shell-backplate__layer',
      ))
        result.set(element, 'backplate')
    } else {
      const header = shell.querySelector<HTMLElement>('.layout-navbar')
      const sidebar = shell.querySelector<HTMLElement>('.layout-vertical-nav:not(.overlay-nav)')
      if (header) result.set(header, 'navbar')
      if (sidebar) result.set(sidebar, 'sidebar')
    }
  }
  return result
}

function readGeometry(binding: SurfaceBinding) {
  const bounds = binding.element.getBoundingClientRect()
  const width = Math.round(bounds.width)
  const height = Math.round(bounds.height)
  // 极长滚动容器保留原生材质，不为少量边缘分配整张文档位移图。
  if (width < 4 || height < 4 || width * height > 4_000_000) return null
  const radius = Number.parseFloat(getComputedStyle(binding.element).borderTopLeftRadius) || 0
  const panels =
    binding.kind === 'backplate'
      ? ['.layout-navbar', '.layout-vertical-nav'].flatMap(selector => {
          const element = shell?.querySelector<HTMLElement>(selector)
          if (!element) return []
          const rect = element.getBoundingClientRect()
          return [
            {
              x: Math.round(rect.left - bounds.left),
              y: Math.round(rect.top - bounds.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
            },
          ]
        })
      : null
  return { width, height, radius, panels, optics: optics.value }
}

async function decodedMap(geometry: NonNullable<ReturnType<typeof readGeometry>>, key: string) {
  let pending = imageCache.get(key)
  if (!pending) {
    pending = (async () => {
      const map = geometry.panels
        ? createGlassPanelBackdropMap({ ...geometry, panels: geometry.panels })
        : createGlassNavbarDisplacementMap({ ...geometry, surface: 'panel' })
      if (map === NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP) throw new Error('Panel map unavailable')
      const image = new Image()
      image.src = map
      await image.decode()
      return map
    })()
    imageCache.set(key, pending)
    if (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value!)
    void pending.catch(() => {
      if (imageCache.get(key) === pending) imageCache.delete(key)
    })
  }
  return pending
}

function reconcileBindings() {
  const candidates = collectSurfaces()
  for (const [element, binding] of surfaces) {
    if (!candidates.has(element) || candidates.get(element) !== binding.kind) {
      forget(binding)
      surfaces.delete(element)
    }
  }
  for (const [element, kind] of candidates) {
    if (surfaces.has(element)) continue
    const binding: SurfaceBinding = {
      element,
      kind,
      id: `${prefix}-${sequence++}`,
      key: '',
      styles: new Map(),
      previousMarker: element.getAttribute('data-glass-panel-refraction'),
      previousOwner: element.getAttribute('data-glass-panel-owner'),
    }
    surfaces.set(element, binding)
    element.dataset.glassPanelOwner = binding.id
    if (kind === 'card') {
      const bounds = element.getBoundingClientRect()
      if (bounds.bottom >= -CARD_PREWARM_MARGIN && bounds.top <= window.innerHeight + CARD_PREWARM_MARGIN)
        nearbyCards.add(element)
      intersectionObserver?.observe(element)
    }
  }
}

async function syncSurfaces() {
  syncFrame = null
  if (!canEnhance()) {
    suspend()
    return
  }
  const currentRevision = ++revision
  reconcileBindings()
  for (const binding of surfaces.values()) resizeObserver?.observe(binding.element)
  // 稳定背板自身不随侧栏展开改变尺寸，仍需观察其内部导航轮廓。
  for (const element of shell?.querySelectorAll<HTMLElement>('.layout-navbar, .layout-vertical-nav') ?? []) {
    if (geometryAnchors.has(element)) continue
    geometryAnchors.add(element)
    resizeObserver?.observe(element)
  }
  const pending: Array<Promise<{ binding: SurfaceBinding; definition: FilterDefinition } | null>> = []
  for (const binding of surfaces.values()) {
    if (binding.kind === 'card' && intersectionObserver && !nearbyCards.has(binding.element)) {
      release(binding)
      continue
    }
    const geometry = readGeometry(binding)
    if (!geometry) {
      release(binding)
      continue
    }
    const key = JSON.stringify(geometry)
    if (key !== binding.key) release(binding)
    // 同屏表面并行解码，避免每张图各等一次浏览器解码周期后才让整页接管材质。
    pending.push(
      decodedMap(geometry, key)
        .then(image => {
          if (currentRevision !== revision || !canEnhance()) return null
          binding.key = key
          return { binding, definition: { id: binding.id, width: geometry.width, height: geometry.height, image } }
        })
        .catch(() => {
          if (currentRevision === revision) release(binding)
          return null
        }),
    )
  }
  const active = (await Promise.all(pending)).filter(surface => surface !== null)
  // 过期失败也不能清空新一轮 defs，否则已经绑定的新表面会引用不存在的滤镜。
  if (currentRevision !== revision || !canEnhance()) return
  definitions.value = active.map(surface => surface.definition)
  await nextTick()
  if (currentRevision !== revision || !canEnhance()) return
  for (const { binding } of active) {
    const suffix = settings.value.glassQuality === 'balanced' && bodyBlur.value > 0 ? ` blur(${bodyBlur.value}px)` : ''
    const filter = `url("#${binding.id}")${suffix} saturate(118%) brightness(var(--glass-transmission-brightness, 1))`
    if (binding.kind === 'backplate') setStyle(binding, 'filter', filter)
    else if (binding.kind === 'card') {
      setStyle(binding, 'backdrop-filter', filter)
      setStyle(binding, '-webkit-backdrop-filter', filter)
    } else setStyle(binding, '--glass-panel-filter', filter)
    binding.element.dataset.glassPanelRefraction = binding.id
  }
}

function scheduleSync() {
  if (!isEligible()) {
    reset()
    return
  }
  reconcileBindings()
  for (const [element, binding] of surfaces) {
    if (element.isConnected && shell?.contains(element)) continue
    forget(binding)
    surfaces.delete(element)
  }
  for (const element of geometryAnchors) {
    if (element.isConnected && shell?.contains(element)) continue
    resizeObserver?.unobserve(element)
    geometryAnchors.delete(element)
  }
  if (!canEnhance()) {
    suspend()
    return
  }
  // 路由挂载、图片布局和观察器共享下一帧；连续变更不能不断延后已排定的材质接管。
  if (syncFrame !== null) return
  syncFrame = requestAnimationFrame(() => {
    void syncSurfaces()
  })
}

watch(
  settings,
  () => {
    suspend()
    scheduleSync()
  },
  { deep: true, flush: 'sync' },
)

onMounted(() => {
  shell = svg.value?.closest<HTMLElement>('.layout-wrapper') ?? null
  reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)')
  reducedTransparency.addEventListener('change', scheduleSync)
  observer = new MutationObserver(records => {
    if (
      records.some(record => {
        if (svg.value?.contains(record.target)) return false
        if (record.type === 'attributes') return record.target === shell || record.target === document.documentElement
        return [...record.addedNodes, ...record.removedNodes].some(
          node =>
            node instanceof HTMLElement &&
            (node.matches('.v-card, .glass-fixed-shell-backplate__layer') ||
              node.querySelector('.v-card, .glass-fixed-shell-backplate__layer')),
        )
      })
    )
      scheduleSync()
  })
  if (shell)
    observer.observe(shell, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-shell-mode'],
    })
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-radius'],
  })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (!canEnhance()) return
      let changed = false
      for (const binding of surfaces.values()) {
        const geometry = readGeometry(binding)
        if (!geometry || JSON.stringify(geometry) !== binding.key) {
          release(binding)
          changed = true
        }
      }
      if (changed) revision += 1
      scheduleSync()
    })
  }
  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver(
      entries => {
        let changed = false
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          if (!surfaces.has(element)) continue
          if (entry.isIntersecting === nearbyCards.has(element)) continue
          if (entry.isIntersecting) nearbyCards.add(element)
          else nearbyCards.delete(element)
          changed = true
        }
        if (changed) scheduleSync()
      },
      { rootMargin: `${CARD_PREWARM_MARGIN}px 0px` },
    )
  }
  window.addEventListener('resize', scheduleSync, { passive: true })
  window.addEventListener('focus', scheduleSync)
  window.addEventListener('blur', suspend)
  document.addEventListener('visibilitychange', scheduleSync)
  scheduleSync()
})

onBeforeUnmount(() => {
  disposed = true
  reset()
  observer?.disconnect()
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  reducedTransparency?.removeEventListener('change', scheduleSync)
  window.removeEventListener('resize', scheduleSync)
  window.removeEventListener('focus', scheduleSync)
  window.removeEventListener('blur', suspend)
  document.removeEventListener('visibilitychange', scheduleSync)
  surfaces.clear()
  geometryAnchors.clear()
  imageCache.clear()
})

onDeactivated(reset)
onActivated(scheduleSync)
</script>

<template>
  <svg ref="svg" class="glass-panel-refraction-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter
        v-for="definition in definitions"
        :id="definition.id"
        :key="definition.id"
        x="0"
        y="0"
        :width="definition.width"
        :height="definition.height"
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        color-interpolation-filters="sRGB"
      >
        <feImage
          x="0"
          y="0"
          :width="definition.width"
          :height="definition.height"
          :href="definition.image"
          preserveAspectRatio="none"
          result="map"
        />
        <template v-if="settings.glassQuality === 'high' && settings.glassAppearance === 'frosted'">
          <feGaussianBlur in="SourceGraphic" :stdDeviation="bodyBlur" edgeMode="duplicate" result="diffused" />
          <feDisplacementMap
            in="diffused"
            in2="map"
            xChannelSelector="R"
            yChannelSelector="B"
            :scale="scale"
            result="body"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            xChannelSelector="R"
            yChannelSelector="B"
            :scale="scale"
            result="edge"
          />
          <feColorMatrix in="map" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0" result="body-mask" />
          <feComposite in="body" in2="body-mask" operator="in" result="body-slice" />
          <feComposite in="edge" in2="body-mask" operator="out" result="edge-slice" />
          <feComposite in="body-slice" in2="edge-slice" operator="arithmetic" k2="1" k3="1" />
        </template>
        <feDisplacementMap
          v-else
          in="SourceGraphic"
          in2="map"
          xChannelSelector="R"
          yChannelSelector="B"
          :scale="scale"
        />
      </filter>
    </defs>
  </svg>
</template>

<style scoped>
.glass-panel-refraction-defs {
  position: fixed;
  pointer-events: none;
  overflow: hidden;
}
</style>
