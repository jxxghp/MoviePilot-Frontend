<script setup lang="ts">
import { useTheme } from 'vuetify'
import misc404 from '@images/pages/404.png'
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
    <div class="misc-avatar w-100 text-center">
      <VImg
        :src="misc404"
        :max-width="800"
        class="mx-auto"
      />
      <slot name="button" />
    </div>

    <!-- 👉 Footer -->
    <VImg
      :src="tree"
      class="misc-footer-tree d-none d-md-block"
    />

    <VImg
      :src="authThemeMask"
      class="misc-footer-img d-none d-md-block"
    />
  </div>
</template>

<style lang="scss">
@use '@core/scss/pages/misc.scss';

.misc-wrapper .misc-footer-tree {
  position: absolute;
  z-index: 1;
  inline-size: 15.625rem;
  inset-block-end: 3.5rem;
  inset-inline-start: 0.375rem;
}

.misc-wrapper .misc-footer-img {
  position: absolute;
  inline-size: 100%;
  inset-block-end: 0;
}
</style>
