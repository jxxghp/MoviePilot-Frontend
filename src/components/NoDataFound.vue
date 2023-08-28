<script setup lang="ts">
import { useTheme } from 'vuetify'
import miscpose from '@images/pages/pose-fs-9.png'
import miscMaskDark from '@images/pages/misc-mask-dark.png'
import miscMaskLight from '@images/pages/misc-mask-light.png'
import tree from '@images/pages/tree.png'

const props = defineProps<Props>()

const vuetifyTheme = useTheme()

const authThemeMask = computed(() => {
  return vuetifyTheme.global.name.value === 'light' ? miscMaskLight : miscMaskDark
})

interface Props {
  errorCode?: string
  errorTitle?: string
  errorDescription?: string
}
</script>

<template>
  <div class="misc-wrapper">
    <ErrorHeader
      :error-code="props.errorCode"
      :error-title="props.errorTitle"
      :error-description="props.errorDescription"
    />

    <!-- 👉 Image -->
    <div class="misc-avatar text-center">
      <VImg
        :src="miscpose"
        class="mx-auto pt-10"
        max-width="250"
        cover
      />
      <slot name="button" />
    </div>

    <!-- 👉 Footer -->
    <VImg
      :src="tree"
      class="misc-footer-tree d-none d-lg-block"
    />

    <VImg
      :src="authThemeMask"
      class="misc-footer-img d-none d-md-block"
    />
  </div>
</template>

<style lang="scss">
@use "@configured-variables" as variables;
@use '@core/scss/pages/misc.scss';

.misc-wrapper {
  position: relative;

  .misc-footer-tree {
    position: fixed;
    z-index: 1;
    inline-size: 15.625rem;
    inset-block-end: 3.5rem;
    inset-inline-start: 0.375rem;
    left: variables.$layout-vertical-nav-width;
  }

  .misc-footer-img {
    position: fixed;
    inline-size: 100%;
    inset-block-end: 0;
  }
}
</style>
