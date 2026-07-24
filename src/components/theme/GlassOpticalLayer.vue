<script setup lang="ts">
import type { ThemeCustomizerGlassAppearance, ThemeCustomizerGlassQuality } from '@/composables/useThemeCustomizer'
import { useGlassOpticalRenderer } from '@/composables/useGlassOpticalRenderer'

const props = defineProps<{
  /** 当前玻璃材质，用于选择透明、色调或磨砂的光学参数。 */
  appearance: ThemeCustomizerGlassAppearance
  /** 用户选择的实时流动反馈强度。 */
  motionStrength: number
  /** 当前光学质量；标准档不会挂载该组件。 */
  quality: Exclude<ThemeCustomizerGlassQuality, 'css'>
  /** 用户选择的亮边、镜面高光与焦散强度。 */
  reflectionStrength: number
  /** 用户选择的真实壁纸可见度。 */
  transparencyStrength: number
  /** 路由变化标识，用于在页面内容稳定后重新发现高价值表面。 */
  routeKey: string
  /** 当前主题主色，用于同步色调材质的光学高光。 */
  tintColor: string
  /** 与 CSS 背景保持一致的活动壁纸。 */
  wallpaperUrl: string
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const { state } = useGlassOpticalRenderer({
  active: true,
  appearance: () => props.appearance,
  canvas,
  motionStrength: () => props.motionStrength,
  quality: () => props.quality,
  reflectionStrength: () => props.reflectionStrength,
  transparencyStrength: () => props.transparencyStrength,
  routeKey: () => props.routeKey,
  tintColor: () => props.tintColor,
  wallpaperUrl: () => props.wallpaperUrl,
})
</script>

<template>
  <canvas ref="canvas" class="glass-optical-layer" aria-hidden="true" :data-state="state" />
</template>
