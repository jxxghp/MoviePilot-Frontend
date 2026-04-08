<script setup lang="ts">
import type { Component } from 'vue'
import api from '@/api'
import { loadRemoteAppPageComponent } from '@/utils/federationLoader'

const route = useRoute()

const pluginId = computed(() => route.params.pluginId as string)
const navKey = computed(() => (route.params.navKey as string) || 'main')

const RemoteView = shallowRef<Component | null>(null)
const loadError = ref(false)

watch(
  [pluginId, navKey],
  async ([pid, nk]) => {
    loadError.value = false
    if (!pid) {
      RemoteView.value = null
      return
    }
    try {
      RemoteView.value = (await loadRemoteAppPageComponent(pid, nk)) as Component
    } catch (e) {
      console.error(e)
      RemoteView.value = null
      loadError.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="plugin-app-page">
    <VAlert v-if="loadError" type="error" class="ma-4" title="组件加载错误">
      无法加载插件全页组件。多入口时请暴露 AppPage 或 AppPage{Pascal}（见文档），并确认插件已启用。
    </VAlert>
    <VSkeletonLoader v-else-if="!RemoteView" class="ma-4" type="article, article, article" />
    <component
      v-else
      :is="RemoteView"
      :key="`${pluginId}-${navKey}`"
      :api="api"
      :nav-key="navKey"
      :plugin-id="pluginId"
      @action="() => {}"
    />
  </div>
</template>
