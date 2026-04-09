<script setup lang="ts">
/**
 * 侧栏全页：在主应用 #/plugin-app/:pluginId/:navKey 中渲染，占据主内容区。
 * 需在插件后端实现 get_sidebar_nav 才会出现在侧栏。
 */
const props = defineProps({
  api: {
    type: Object,
    default: () => ({}),
  },
  navKey: {
    type: String,
    default: 'main',
  },
  pluginId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['action'])
</script>

<template>
  <div class="plugin-app-page pa-4">
    <div class="text-h6 mb-2">AppPage（侧栏全页）</div>
    <div class="text-body-2 text-medium-emphasis mb-4">
      pluginId: {{ pluginId }} · navKey: {{ navKey }}
    </div>
    <v-btn size="small" variant="tonal" @click="emit('action')">action</v-btn>
  </div>
</template>
