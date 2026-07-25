<script setup lang="ts">
import type { ThemeCustomizerGlassAppearance, ThemeCustomizerGlassQuality } from '@/composables/useThemeCustomizer'
import {
  setGlassRendererState,
  useGlassOpticalInteractionSource,
  useGlassOpticalRenderer,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'

const props = defineProps<{
  /** 当前玻璃材质，用于选择透明、色调或磨砂的光学参数。 */
  appearance: ThemeCustomizerGlassAppearance
  /** 用户选择的局部非均匀形变强度。 */
  deformationStrength: number
  /** 用户选择的轨迹、尾波与惯性强度。 */
  flowStrength: number
  /** 当前光学质量；标准档不会挂载该组件。 */
  quality: Exclude<ThemeCustomizerGlassQuality, 'css'>
  /** 用户选择的亮边、镜面高光与焦散强度。 */
  reflectionStrength: number
  /** 用户选择的真实壁纸可见度。 */
  transparencyStrength: number
  /** 用户选择的共享壁纸采样平移强度。 */
  translationStrength: number
  /** 路由变化标识，用于在页面内容稳定后重新发现高价值表面。 */
  routeKey: string
  /** 当前主题主色，用于同步色调材质的光学高光。 */
  tintColor: string
  /** 外层壁纸交叉淡化的时长，shader 使用同一时钟混合双纹理。 */
  transitionDuration: number
  /** 外层壁纸交叉淡化的 performance timeline 起点。 */
  transitionStartedAt: number
  /** 与 CSS 背景保持一致的活动壁纸。 */
  wallpaperUrl: string
  /** 切换期保留的上一张壁纸；空值表示当前没有交叉淡化。 */
  previousWallpaperUrl: string
}>()

const fixedCanvas = ref<HTMLCanvasElement | null>(null)
const scrollCanvas = ref<HTMLCanvasElement | null>(null)
const interactionSource = useGlassOpticalInteractionSource()
const fixedRenderer = useGlassOpticalRenderer({
  active: true,
  appearance: () => props.appearance,
  canvas: fixedCanvas,
  deformationStrength: () => props.deformationStrength,
  flowStrength: () => props.flowStrength,
  interactionSource,
  quality: () => props.quality,
  reflectionStrength: () => props.reflectionStrength,
  transparencyStrength: () => props.transparencyStrength,
  translationStrength: () => props.translationStrength,
  routeKey: () => props.routeKey,
  tintColor: () => props.tintColor,
  transitionDuration: () => props.transitionDuration,
  transitionStartedAt: () => props.transitionStartedAt,
  wallpaperUrl: () => props.wallpaperUrl,
  previousWallpaperUrl: () => props.previousWallpaperUrl,
  surfaceSpace: 'fixed',
  syncDocumentState: false,
})
const scrollRenderer = useGlassOpticalRenderer({
  active: true,
  appearance: () => props.appearance,
  canvas: scrollCanvas,
  deformationStrength: () => props.deformationStrength,
  flowStrength: () => props.flowStrength,
  interactionSource,
  quality: () => props.quality,
  reflectionStrength: () => props.reflectionStrength,
  transparencyStrength: () => props.transparencyStrength,
  translationStrength: () => props.translationStrength,
  routeKey: () => props.routeKey,
  tintColor: () => props.tintColor,
  transitionDuration: () => props.transitionDuration,
  transitionStartedAt: () => props.transitionStartedAt,
  wallpaperUrl: () => props.wallpaperUrl,
  previousWallpaperUrl: () => props.previousWallpaperUrl,
  surfaceSpace: 'scroll',
  syncDocumentState: false,
})

const rendererState = ref<GlassRendererState>('loading')

/** 两个呈现 context 作为同一材质能力接管 CSS，避免部分就绪时出现混合材质。 */
watchEffect(() => {
  const states = [fixedRenderer.state.value, scrollRenderer.state.value]
  const state: GlassRendererState = states.every(value => value === 'ready')
    ? 'ready'
    : states.some(value => value === 'loading')
      ? 'loading'
      : 'fallback'

  setGlassRendererState(rendererState, state)
})

onScopeDispose(() => {
  setGlassRendererState(rendererState, 'fallback')
})
</script>

<template>
  <canvas
    ref="fixedCanvas"
    class="glass-optical-layer glass-optical-layer--fixed"
    aria-hidden="true"
    data-presentation-space="fixed"
    :data-state="fixedRenderer.state.value"
  />
  <canvas
    ref="scrollCanvas"
    class="glass-optical-layer glass-optical-layer--scroll"
    aria-hidden="true"
    data-presentation-space="scroll"
    :data-state="scrollRenderer.state.value"
  />
</template>
