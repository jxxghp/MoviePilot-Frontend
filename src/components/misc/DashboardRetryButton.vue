<script setup lang="ts">
const props = defineProps<{
  /** 有可展示快照时，在支持悬停的桌面设备上延后到卡片交互时显示。 */
  deferred?: boolean
  /** 描述当前卡片重试目标的可访问文案。 */
  label: string
}>()

const emit = defineEmits<{
  /** 请求用户主动重新加载当前卡片。 */
  retry: []
}>()
</script>

<template>
  <VBtn
    icon
    variant="text"
    color="warning"
    size="small"
    :class="{ 'dashboard-retry-button--deferred': props.deferred }"
    :aria-label="props.label"
    @click="emit('retry')"
  >
    <VIcon icon="mdi-cloud-alert-outline" size="20" />
    <VTooltip activator="parent" location="top">
      {{ props.label }}
    </VTooltip>
  </VBtn>
</template>

<style scoped>
@media (hover: none), (pointer: coarse) {
  .dashboard-retry-button--deferred {
    display: none;
  }
}

@media (hover: hover) and (pointer: fine) {
  .dashboard-retry-button--deferred {
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease;
  }

  :global(.v-card:hover .dashboard-retry-button--deferred),
  :global(.v-card:focus-within .dashboard-retry-button--deferred) {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-retry-button--deferred {
    transition: none;
  }
}
</style>
