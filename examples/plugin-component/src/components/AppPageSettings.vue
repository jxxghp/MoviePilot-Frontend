<script setup lang="ts">
/**
 * 示例：nav_key=settings 时主应用会优先加载 AppPageSettings，再回退 AppPage。
 */
const props = defineProps({
  api: { type: Object, default: () => ({}) },
  navKey: { type: String, default: 'settings' },
  pluginId: { type: String, default: '' },
})
</script>

<template>
  <div class="pa-4">
    <div class="text-subtitle-1">Settings 子界面（AppPageSettings）</div>
    <div class="text-caption text-medium-emphasis">navKey={{ navKey }} · pluginId={{ pluginId }}</div>
  </div>
</template>
