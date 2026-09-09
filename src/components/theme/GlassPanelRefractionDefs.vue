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
import { syncGlassPanelShadow, withInstantGlassShadow } from '@/utils/glassPanelShadow'

// 与仪表盘统一材质的直接卡片及单层包装选择器保持一致，业务卡片继续持有自己的投影。
const DASHBOARD_SHADOW_SELECTOR =
  '.dashboard-grid-content-measure > .v-card, .dashboard-grid-content-measure > :first-child > .v-card'

/** 内容面和顶栏使用真实背景，磨砂侧栏复用稳定背板。 */
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

interface CachedDisplacementMap {
  /** 相同几何共享一次解码；未完成的图片不能用于同步接管。 */
  pending: Promise<string>
  /** 解码完成的图像地址；与 pending 共用同一缓存淘汰边界。 */
  image: string | null
}

interface SurfaceStyleOwnership {
  /** 接管前的声明，用于恢复业务样式。 */
  previous: string
  /** 接管前的优先级，恢复时不提升业务声明权重。 */
  priority: string
  /** 最近一次请求值，与 CSSOM 正规化后的结果分别保存。 */
  requested: string
  /** 浏览器实际保留的声明，不支持的属性可能为空。 */
  applied: string
  /** 浏览器实际保留的优先级，外部修改优先级也必须重新核对。 */
  appliedPriority: string
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
  styles: Map<string, SurfaceStyleOwnership>
  /** 原有表面标记，解除接管时恢复。 */
  previousMarker: string | null
  /** 背景所有权在解码前发布，避免质量切换时短暂叠加 WebGL 静态背景。 */
  previousOwner: string | null
  /** 外投影与 backdrop 分开绘制；随表面失效、离屏或卸载一并释放。 */
  shadowLayer: HTMLElement | null
  /** 只跟踪影响投影准入的行内变换，材质自身写入不触发重复准备。 */
  shadowInlineTransform: string
}

interface PreparedSurface {
  /** 已完成几何准备、等待同批呈现的表面。 */
  binding: SurfaceBinding
  /** 已解码且对应当前几何的滤镜定义。 */
  definition: FilterDefinition
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
// 页面缓存可复用节点身份，但不强引用已卸载页面或保留其 SVG 绘制资源。
const surfaceIds = new WeakMap<HTMLElement, string>()
const imageCache = new Map<string, CachedDisplacementMap>()
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
  const currentValue = style.getPropertyValue(property)
  const currentPriority = style.getPropertyPriority(property)
  const record = binding.styles.get(property)
  // 相同输入和实际声明都未变时无需重写；不能仅按上次请求值跳过业务覆写。
  if (record?.requested === value && record.applied === currentValue && record.appliedPriority === currentPriority)
    return
  if (!record) {
    binding.styles.set(property, {
      previous: currentValue,
      priority: currentPriority,
      requested: value,
      applied: currentValue,
      appliedPriority: currentPriority,
    })
  }
  const apply = () => style.setProperty(property, value, 'important')
  if (property === 'box-shadow' && currentValue !== value) withInstantGlassShadow(binding.element, apply)
  else apply()
  // CSSOM 可能规范化数值与空白；用浏览器实际保存值判断后续写入所有权。
  const applied = binding.styles.get(property)!
  applied.requested = value
  applied.applied = style.getPropertyValue(property)
  applied.appliedPriority = style.getPropertyPriority(property)
}

/** 只回收仍由当前表面持有的声明，保留其他组件后续写入。 */
function releaseStyle(binding: SurfaceBinding, property: string) {
  const record = binding.styles.get(property)
  if (!record) return
  if (binding.element.style.getPropertyValue(property) === record.applied) {
    const apply = () => {
      if (record.previous) binding.element.style.setProperty(property, record.previous, record.priority)
      else binding.element.style.removeProperty(property)
    }
    if (property === 'box-shadow') withInstantGlassShadow(binding.element, apply)
    else apply()
  }
  binding.styles.delete(property)
}

function release(binding: SurfaceBinding, preserveShadow = false) {
  // 几何更新不重建仍然对齐的投影，使圆角过渡与卡片保持同一时间线。
  const retained =
    preserveShadow && binding.shadowLayer && binding.element.matches(DASHBOARD_SHADOW_SELECTOR)
      ? syncGlassPanelShadow(binding.element, binding.shadowLayer)
      : null
  if (!retained) binding.shadowLayer?.remove()
  binding.shadowLayer = retained
  for (const property of binding.styles.keys()) {
    if (retained && property === 'box-shadow') continue
    releaseStyle(binding, property)
  }
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
    const header = shell.querySelector<HTMLElement>('.layout-navbar')
    if (header) result.set(header, 'navbar')
    if (settings.value.glassAppearance === 'frosted') {
      for (const element of shell.querySelectorAll<HTMLElement>(
        '.glass-fixed-shell-backplate--main .glass-fixed-shell-backplate__layer',
      ))
        result.set(element, 'backplate')
    } else {
      const sidebar = shell.querySelector<HTMLElement>('.layout-vertical-nav:not(.overlay-nav)')
      if (sidebar) result.set(sidebar, 'sidebar')
    }
  }
  return result
}

function readGeometry(binding: SurfaceBinding, bounds = binding.element.getBoundingClientRect()) {
  const width = Math.round(bounds.width)
  const height = Math.round(bounds.height)
  // 极长滚动容器保留原生材质，不为少量边缘分配整张文档位移图。
  if (width < 4 || height < 4 || width * height > 4_000_000) return null
  const radius = Number.parseFloat(getComputedStyle(binding.element).borderTopLeftRadius) || 0
  const panels =
    binding.kind === 'backplate'
      ? ['.layout-vertical-nav'].flatMap(selector => {
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
  let cached = imageCache.get(key)
  if (!cached) {
    const pending = (async () => {
      const map = geometry.panels
        ? createGlassPanelBackdropMap({ ...geometry, panels: geometry.panels })
        : createGlassNavbarDisplacementMap({ ...geometry, surface: 'panel' })
      if (map === NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP) throw new Error('Panel map unavailable')
      const image = new Image()
      image.src = map
      await image.decode()
      return map
    })()
    const entry: CachedDisplacementMap = { pending, image: null }
    cached = entry
    imageCache.set(key, entry)
    if (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value!)
    void pending.then(
      image => {
        entry.image = image
      },
      () => {
        if (imageCache.get(key) === entry) imageCache.delete(key)
      },
    )
  }
  return cached.pending
}

function reconcileBindings() {
  const candidates = collectSurfaces()
  let changed = false
  for (const [element, binding] of surfaces) {
    if (!candidates.has(element) || candidates.get(element) !== binding.kind) {
      forget(binding)
      surfaces.delete(element)
      changed = true
    }
  }
  for (const [element, kind] of candidates) {
    if (surfaces.has(element)) continue
    const id = surfaceIds.get(element) ?? `${prefix}-${sequence++}`
    surfaceIds.set(element, id)
    const binding: SurfaceBinding = {
      element,
      kind,
      id,
      key: '',
      styles: new Map(),
      previousMarker: element.getAttribute('data-glass-panel-refraction'),
      previousOwner: element.getAttribute('data-glass-panel-owner'),
      shadowLayer: null,
      shadowInlineTransform: element.style.transform,
    }
    surfaces.set(element, binding)
    changed = true
    element.dataset.glassPanelOwner = binding.id
    if (kind === 'card') {
      const bounds = element.getBoundingClientRect()
      if (bounds.bottom >= -CARD_PREWARM_MARGIN && bounds.top <= window.innerHeight + CARD_PREWARM_MARGIN)
        nearbyCards.add(element)
      intersectionObserver?.observe(element)
    }
  }
  // 解码完成与路由 DOM 移动可能发生在同一帧，旧批次不能再次绑定已退出的页面。
  if (changed) revision += 1
}

/** 必须先将对应 defs 提交到 DOM，再发布表面引用和材质接管标记。 */
function bindFilter(binding: SurfaceBinding) {
  const suffix = settings.value.glassQuality === 'balanced' && bodyBlur.value > 0 ? ` blur(${bodyBlur.value}px)` : ''
  const filter = `url("#${binding.id}")${suffix} saturate(118%) brightness(var(--glass-transmission-brightness, 1))`
  if (binding.kind === 'backplate') setStyle(binding, 'filter', filter)
  else if (binding.kind === 'card') {
    setStyle(binding, 'backdrop-filter', filter)
    setStyle(binding, '-webkit-backdrop-filter', filter)
    if (binding.element.matches(DASHBOARD_SHADOW_SELECTOR))
      binding.shadowLayer = syncGlassPanelShadow(binding.element, binding.shadowLayer)
    else {
      binding.shadowLayer?.remove()
      binding.shadowLayer = null
    }
    if (binding.shadowLayer) setStyle(binding, 'box-shadow', 'var(--glass-v3-surface-edge)')
    else releaseStyle(binding, 'box-shadow')
  } else setStyle(binding, '--glass-panel-filter', filter)
  if (binding.element.dataset.glassPanelRefraction !== binding.id)
    binding.element.dataset.glassPanelRefraction = binding.id
}

/** 局部就绪时保留其他表面的 defs；全部完成后才回收不再需要的定义。 */
async function presentSurfaces(active: PreparedSurface[], currentRevision: number, merge: boolean) {
  if (currentRevision !== revision || !canEnhance()) return
  if (merge) {
    const available = new Map(definitions.value.map(definition => [definition.id, definition]))
    for (const { definition } of active) available.set(definition.id, definition)
    definitions.value = [...available.values()]
  } else definitions.value = active.map(surface => surface.definition)
  await nextTick()
  if (currentRevision !== revision || !canEnhance()) return
  for (const { binding } of active) bindFilter(binding)
}

/** 暖返回在首次绘制前恢复已解码材质，不等待同批新卡片或下一帧的冷准备。 */
async function restoreCachedSurfaces() {
  if (!imageCache.size) return
  const currentRevision = revision
  const restored: PreparedSurface[] = []
  for (const binding of surfaces.values()) {
    if (binding.element.dataset.glassPanelRefraction === binding.id) continue
    if (binding.kind === 'card' && intersectionObserver && !nearbyCards.has(binding.element)) continue
    const geometry = readGeometry(binding)
    if (!geometry) continue
    const key = JSON.stringify(geometry)
    const image = imageCache.get(key)?.image
    if (!image) continue
    binding.key = key
    restored.push({ binding, definition: { id: binding.id, width: geometry.width, height: geometry.height, image } })
  }
  if (!restored.length) return
  await presentSurfaces(restored, currentRevision, true)
}

async function syncSurfaces() {
  syncFrame = null
  if (!canEnhance()) {
    suspend()
    return
  }
  reconcileBindings()
  const currentRevision = ++revision
  for (const binding of surfaces.values()) resizeObserver?.observe(binding.element)
  // 稳定背板自身不随侧栏展开改变尺寸，仍需观察其内部导航轮廓。
  for (const element of shell?.querySelectorAll<HTMLElement>('.layout-navbar, .layout-vertical-nav') ?? []) {
    if (geometryAnchors.has(element)) continue
    geometryAnchors.add(element)
    resizeObserver?.observe(element)
  }
  const pending: Array<Promise<PreparedSurface | null>> = []
  const visiblePending: Array<Promise<PreparedSurface | null>> = []
  for (const binding of surfaces.values()) {
    if (binding.kind === 'card' && intersectionObserver && !nearbyCards.has(binding.element)) {
      release(binding)
      continue
    }
    const bounds = binding.element.getBoundingClientRect()
    const geometry = readGeometry(binding, bounds)
    if (!geometry) {
      release(binding)
      continue
    }
    const key = JSON.stringify(geometry)
    if (key !== binding.key) release(binding, true)
    // 同屏表面并行解码，避免每张图各等一次浏览器解码周期后才让整页接管材质。
    const prepared = decodedMap(geometry, key)
      .then(image => {
        if (currentRevision !== revision || !canEnhance()) return null
        binding.key = key
        return { binding, definition: { id: binding.id, width: geometry.width, height: geometry.height, image } }
      })
      .catch(() => {
        if (currentRevision === revision) release(binding)
        return null
      })
    pending.push(prepared)
    if (
      binding.kind !== 'card' ||
      (bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth)
    )
      visiblePending.push(prepared)
  }
  // 屏内表面同批接管；256px 预热区继续并行解码，但不能拖住已完成的首屏材质。
  if (visiblePending.length > 0 && visiblePending.length < pending.length) {
    const visible = (await Promise.all(visiblePending)).filter(surface => surface !== null)
    await presentSurfaces(visible, currentRevision, true)
  }
  const active = (await Promise.all(pending)).filter(surface => surface !== null)
  // 过期失败也不能清空新一轮 defs，否则已经绑定的新表面会引用不存在的滤镜。
  await presentSurfaces(active, currentRevision, false)
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
  void restoreCachedSurfaces()
  // 路由挂载、图片布局和观察器共享下一帧；连续变更不能不断延后已排定的材质接管。
  if (syncFrame !== null) return
  syncFrame = requestAnimationFrame(() => {
    void syncSurfaces()
  })
}

/** 圆角不触发 ResizeObserver；过渡结束后重新核对静态滤镜和投影的几何。 */
function handleSurfaceTransition(event: TransitionEvent) {
  if (
    !(event.target instanceof HTMLElement) ||
    !event.target.matches(DASHBOARD_SHADOW_SELECTOR) ||
    !surfaces.has(event.target)
  )
    return
  if (event.propertyName === 'transform') {
    if (getComputedStyle(event.target).transform === 'none') scheduleSync()
  } else if (event.propertyName.endsWith('radius')) scheduleSync()
}

/** 材质自身的 style 写入不重新准备；业务变换或投影覆写则立即解除不再有效的分层。 */
function handleSurfaceAttribute(record: MutationRecord) {
  if (record.target === shell || record.target === document.documentElement) return true
  if (!(record.target instanceof HTMLElement)) return false
  const binding = surfaces.get(record.target)
  if (binding?.kind !== 'card' || !binding.element.matches(DASHBOARD_SHADOW_SELECTOR)) return false
  const transformChanged = record.target.style.transform !== binding.shadowInlineTransform
  binding.shadowInlineTransform = record.target.style.transform
  const shadowOverridden =
    binding.shadowLayer &&
    record.target.style.getPropertyValue('box-shadow') !== binding.styles.get('box-shadow')?.applied
  const transformed =
    (record.attributeName === 'class' || transformChanged) && getComputedStyle(record.target).transform !== 'none'
  if (shadowOverridden || transformed) {
    binding.shadowLayer?.remove()
    binding.shadowLayer = null
    releaseStyle(binding, 'box-shadow')
  }
  return !transformed && (record.attributeName === 'class' || transformChanged)
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
    let needsSync = false
    // 每条属性记录都需检查所有权，不能因前面的变更已要求同步而跳过后续卡片。
    for (const record of records) {
      if (svg.value?.contains(record.target)) continue
      if (record.type === 'attributes') {
        if (handleSurfaceAttribute(record)) needsSync = true
      } else if (
        [...record.addedNodes, ...record.removedNodes].some(
          node =>
            node instanceof HTMLElement &&
            (node.matches('.v-card, .glass-fixed-shell-backplate__layer') ||
              node.querySelector('.v-card, .glass-fixed-shell-backplate__layer')),
        )
      )
        needsSync = true
    }
    if (needsSync) scheduleSync()
  })
  if (shell)
    observer.observe(shell, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-shell-mode'],
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
          release(binding, geometry !== null)
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
  shell?.addEventListener('transitionend', handleSurfaceTransition)
  shell?.addEventListener('transitioncancel', handleSurfaceTransition)
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
  shell?.removeEventListener('transitionend', handleSurfaceTransition)
  shell?.removeEventListener('transitioncancel', handleSurfaceTransition)
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
