<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** 空结果使用的图标。 */
  emptyIcon: string
  /** 成功空结果对应的业务文案。 */
  emptyText: string
  /** 当前是否正在等待首次可用结果。 */
  loading: boolean
  /** 当前是否因请求失败而没有可展示的快照。 */
  failed: boolean
  /** 卡片标题。 */
  title: string
}>()

defineSlots<{
  /** 在标题栏右侧显示与当前状态相关的轻量操作。 */
  append?: () => unknown
}>()

const { t } = useI18n()
</script>

<template>
  <VCard class="dashboard-media-state dashboard-grid-fill">
    <VCardItem class="dashboard-media-state-header">
      <VCardTitle>{{ props.title }}</VCardTitle>
      <template #append>
        <slot name="append" />
      </template>
    </VCardItem>

    <VCardText
      class="dashboard-media-state-content text-medium-emphasis"
      :role="props.failed ? 'alert' : 'status'"
      aria-live="polite"
    >
      <template v-if="props.loading">
        <VProgressCircular indeterminate color="primary" size="28" width="2" />
        <span>{{ t('common.loading') }}</span>
      </template>

      <template v-else-if="props.failed">
        <VIcon icon="mdi-server-network-off" color="warning" size="30" />
        <span>{{ t('dashboard.mediaServerLoadFailed') }}</span>
      </template>

      <template v-else>
        <VIcon :icon="props.emptyIcon" size="30" />
        <span>{{ props.emptyText }}</span>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-media-state {
  display: flex;
  flex-direction: column;
  min-block-size: 10rem;
}

.dashboard-media-state-header {
  padding-block-end: 0.25rem;
}

.dashboard-media-state-content {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.65rem;
  min-block-size: 0;
  text-align: center;
}
</style>
