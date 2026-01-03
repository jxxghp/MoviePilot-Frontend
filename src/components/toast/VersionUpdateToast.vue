<template>
  <div class="version-update-toast">
    <span class="message">{{ message }}</span>
    <button v-if="refreshText" class="refresh-button" @click="handleRefresh">
      {{ refreshText }}
    </button>
    <div v-else class="spinner"></div>
  </div>
</template>

<script setup lang="ts">
// 接收 props
interface Props {
  message: string
  refreshText?: string
  onRefresh?: () => void
}

const props = defineProps<Props>()

const handleRefresh = () => {
  if (props.onRefresh) {
    props.onRefresh()
  } else {
    window.location.reload()
  }
}
</script>

<style scoped>
.version-update-toast {
  display: flex;
  align-items: center;
  gap: 12px;
}

.message {
  flex: 1;
  word-break: break-all;
  line-height: 1.4;
}

.refresh-button {
  padding: 6px 16px;
  background-color: #fff;
  color: #333;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.refresh-button:hover {
  background-color: #f5f5f5;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.refresh-button:active {
  transform: scale(0.98);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
