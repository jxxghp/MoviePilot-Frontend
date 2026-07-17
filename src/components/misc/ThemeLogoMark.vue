<script setup lang="ts">
import logoSvg from '@images/logo.svg?raw'
import { applyThemeLogoPalette, createThemeLogoPalette } from '@/utils/themeLogo'
import { computed } from 'vue'
import { useTheme } from 'vuetify'

const props = withDefaults(
  defineProps<{
    /** 装饰模式不重复暴露图像语义，适用于已有外层可访问名称的复合标识。 */
    decorative?: boolean
  }>(),
  {
    decorative: false,
  },
)

const theme = useTheme()

/** 保留品牌 SVG 的分面与高光结构，只将原始紫色色阶映射到当前主题色家族。 */
const themedLogoSvg = computed(() =>
  applyThemeLogoPalette(logoSvg, createThemeLogoPalette(theme.current.value.colors.primary)),
)
</script>

<template>
  <span
    class="theme-logo-mark"
    :role="props.decorative ? undefined : 'img'"
    :aria-label="props.decorative ? undefined : 'MoviePilot'"
    :aria-hidden="props.decorative || undefined"
  >
    <span class="theme-logo-mark__svg" v-html="themedLogoSvg" />
  </span>
</template>

<style scoped lang="scss">
.theme-logo-mark {
  display: inline-block;
  flex: none;
  block-size: 3em;
  inline-size: 3em;
}

.theme-logo-mark__svg,
.theme-logo-mark__svg :deep(svg) {
  display: block;
  block-size: 100%;
  inline-size: 100%;
}
</style>
