<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})
</script>
<template>
  <div>
    <VCard class="workflow-node-card" elevation="4">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem class="workflow-node-header">
        <template v-slot:prepend>
          <VAvatar class="workflow-node-avatar" color="primary" variant="tonal">
            <VIcon icon="mdi-file-find" size="large"></VIcon>
          </VAvatar>
        </template>
        <div>
          <VCardTitle class="workflow-node-title">刮削文件</VCardTitle>
          <VCardSubtitle class="workflow-node-subtitle">刮削媒体信息和图片</VCardSubtitle>
        </div>
      </VCardItem>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.workflow-node-card {
  min-width: 200px;
  max-width: 280px;
  border-radius: 12px;
  overflow: visible;
  box-shadow: 0 6px 16px rgba(var(--v-shadow-key-umbra-color), 0.1);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
  background: linear-gradient(135deg, rgba(var(--v-theme-surface), 1), rgba(var(--v-theme-surface-variant), 0.8));
  backdrop-filter: blur(12px);
  transition: all 0.2s ease;
  
  &:hover {
    box-shadow: 0 8px 24px rgba(var(--v-theme-primary), 0.15);
    border-color: rgba(var(--v-theme-primary), 0.25);
    transform: translateY(-2px);
  }
}

.workflow-node-header {
  padding: 16px;
}

.workflow-node-avatar {
  margin-right: 12px;
  box-shadow: 0 4px 8px rgba(var(--v-theme-primary), 0.2);
}

.workflow-node-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.workflow-node-subtitle {
  font-size: 0.8rem;
  opacity: 0.8;
}
</style>
