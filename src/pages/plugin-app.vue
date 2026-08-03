<script setup lang="ts">
import type { Component } from 'vue'
import api from '@/api'
import { loadRemoteAppPageComponent } from '@/utils/federationLoader'
import { useToast } from 'vue-toastification'
import { usePluginNativeSubscribe } from '@/composables/usePluginNativeSubscribe'

const route = useRoute()

const pluginId = computed(() => route.params.pluginId as string)
const navKey = computed(() => (route.params.navKey as string) || 'main')

const RemoteView = shallowRef<Component | null>(null)
const loadError = ref(false)
let loadGeneration = 0

// 侧栏联邦页面复用主应用 Toast 实例。
const $toast = useToast()
provide('moviepilot:toast', $toast)

// 向侧栏全页联邦组件导出主程序原生订阅入口。
const nativeSubscribe = usePluginNativeSubscribe()
provide('moviepilot:nativeSubscribe', nativeSubscribe)

watch(
  [pluginId, navKey],
  async ([pid, nk]) => {
    const generation = ++loadGeneration
    loadError.value = false
    RemoteView.value = null
    if (!pid) {
      return
    }
    try {
      const remoteView = (await loadRemoteAppPageComponent(pid, nk)) as Component
      if (generation !== loadGeneration) return
      RemoteView.value = remoteView
    } catch (e) {
      if (generation !== loadGeneration) return
      console.error(e)
      loadError.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="plugin-app-page" data-glass-optical-mode="static-material">
    <VAlert v-if="loadError" type="error" class="ma-4" title="组件加载错误">
      无法加载插件全页组件。多入口时请暴露 AppPage 或 AppPage{Pascal}（见文档），并确认插件已启用。
    </VAlert>
    <VSkeletonLoader v-else-if="!RemoteView" class="ma-4" type="article, article, article" />
    <component
      v-else
      :is="RemoteView"
      :key="`${pluginId}-${navKey}`"
      :api="api"
      :native-subscribe="nativeSubscribe"
      :nav-key="navKey"
      :plugin-id="pluginId"
      @action="() => {}"
    />
  </div>
</template>
