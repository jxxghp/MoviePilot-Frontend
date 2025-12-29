<template>
  <div class="version-update-toast">
    <span class="message">{{ message }}</span>
    <button class="refresh-button" @click="handleRefresh">
      {{ refreshText }}
    </button>
  </div>
</template>

<script setup lang="ts">
// 接收 props
interface Props {
  message: string
  refreshText: string
}

const props = defineProps<Props>()

const handleRefresh = () => {
  window.location.reload()
}
</script>

<style scoped>
.version-update-toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.message {
  flex: 1;
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
</style>
