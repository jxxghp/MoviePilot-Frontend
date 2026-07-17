<script setup lang="ts">
import logoUrl from '@images/logo.svg'

/** 使用当前 Vuetify 主题主色渲染非 WebGL 场景中的 MoviePilot 标识。 */
const logoMaskStyle = {
  '--theme-logo-mask': `url("${logoUrl}")`,
}
</script>

<template>
  <span class="theme-logo-mark" :style="logoMaskStyle" role="img" aria-label="MoviePilot" />
</template>

<style scoped lang="scss">
.theme-logo-mark {
  display: inline-block;
  flex: none;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, rgb(var(--v-theme-primary)) 48%, white) 0%,
    rgb(var(--v-theme-primary)) 48%,
    color-mix(in srgb, rgb(var(--v-theme-primary)) 72%, black) 100%
  );
  block-size: 3em;
  inline-size: 3em;
  mask: var(--theme-logo-mask) center / contain no-repeat;
  -webkit-mask: var(--theme-logo-mask) center / contain no-repeat;
}
</style>
