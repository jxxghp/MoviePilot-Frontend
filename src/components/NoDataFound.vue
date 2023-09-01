<script setup lang="ts">
import miscpose from '@images/pages/pose-fs-9.png'

const props = defineProps<Props>()

interface Props {
  errorCode?: string
  errorTitle?: string
  errorDescription?: string
}
</script>

<template>
  <div class="flex flex-col">
    <ErrorHeader
      :error-code="props.errorCode"
      :error-title="props.errorTitle"
      :error-description="props.errorDescription"
    />

    <!-- 👉 Image -->
    <div class="text-center">
      <VImg
        :src="miscpose"
        class="mx-auto pt-10"
        max-width="250"
        cover
      />
      <slot name="button" />
    </div>
  </div>
</template>

<style lang="scss">
</style>
