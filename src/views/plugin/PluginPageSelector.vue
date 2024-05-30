<script lang="ts" setup>
import type { Plugin } from '@/api/types'
import api from '@/api'
import PluginPageSelectorItem from '@/views/plugin/PluginPageSelectorItem.vue'


// 已安装插件
const installedPlugins = ref<Plugin[]>([])

// 获取已安装并且有页面的插件数据
async function fetchInstalledPlugins() {
  try {
    installedPlugins.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
    installedPlugins.value = installedPlugins.value?.filter(plugin => plugin?.has_page)
  } catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(async () => {
  await fetchInstalledPlugins()
})
</script>
<template>
  <div style="overflow: hidden auto; block-size: calc(100% - 10px);">
    <VRow>
      <VCol v-for="item in installedPlugins" cols="12" md="2" sm="3">
        <PluginPageSelectorItem :plugin="item" />
      </VCol>
    </VRow>
  </div>
</template>
