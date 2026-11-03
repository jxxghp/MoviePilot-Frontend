<script setup lang="ts">
import { providePluginHostSDK } from '@/composables/usePluginHostSDK'
import type { Component } from 'vue'
import { createPluginInstanceApi } from '@/api'
import { getRemoteModuleInfo, loadRemoteAppPageComponent } from '@/utils/federationLoader'

const route = useRoute()

const pluginId = computed(() => route.params.pluginId as string)
const navKey = computed(() => (route.params.navKey as string) || 'main')

const RemoteView = shallowRef<Component | null>(null)
const pluginSourceId = ref<string>()
const loadError = ref(false)
let loadGeneration = 0

// 统一 SDK 与兼容注入共用同一组宿主服务。
const hostSdk = providePluginHostSDK({
  surface: 'app',
  pluginId,
  sourcePluginId: pluginSourceId,
  api: () => scopedPluginApi.value,
})
const nativeSubscribe = hostSdk.subscriptions.create
const subscriptionManager = hostSdk.subscriptions.manage

watch(
  [pluginId, navKey],
  async ([pid, nk]) => {
    const generation = ++loadGeneration
    loadError.value = false
    RemoteView.value = null
    pluginSourceId.value = undefined
    if (!pid) {
      return
    }
    try {
      const remoteModule = await getRemoteModuleInfo(pid)
      if (generation !== loadGeneration) return
      pluginSourceId.value = remoteModule?.source_plugin_id
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

// 路由只携带实例 ID，源身份由联邦发现结果补齐。
const scopedPluginApi = computed(() => createPluginInstanceApi(pluginId.value, pluginSourceId.value))
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
      :api="scopedPluginApi"
      :host-sdk="hostSdk"
      :subscription-manager="subscriptionManager"
      :native-subscribe="nativeSubscribe"
      :nav-key="navKey"
      :plugin-id="pluginId"
      :source-plugin-id="pluginSourceId"
      @action="() => {}"
    />
  </div>
</template>
