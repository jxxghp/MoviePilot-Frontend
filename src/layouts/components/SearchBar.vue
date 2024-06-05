<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarView from '@/views/system/SearchBarView.vue'
import type { Plugin } from '@/api/types'
import api from '@/api'
import { useDisplay } from 'vuetify'
import PageRender from '@/components/render/PageRender.vue'

// 显示器
const display = useDisplay()

const searchDialog = ref(false)

// 注册快捷键
Mousetrap.bind(['command+k', 'ctrl+k'], openSearchDialog)

// 打开搜索弹窗
function openSearchDialog() {
  searchDialog.value = true
  return false
}

// 插件数据页面Dialog
const pluginPageDialog = ref<boolean>(false)

// 当前插件数据页面插件
const currentPluginPagePlugin = ref<Plugin>()

// 当前插件数据页面配置项
const currentPluginPageItems = ref([])

// 跳转插件数据页面
async function showPluginPage(plugin: Plugin) {
  if (!plugin || !plugin.id || !plugin.plugin_name) return
  try {
    const result: [] = await api.get(`plugin/page/${plugin.id}`)
    if (!result) return
    currentPluginPagePlugin.value = plugin
    currentPluginPageItems.value = result
    pluginPageDialog.value = true
  } catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <!-- 👉 Search Icon -->
  <div class="d-flex align-center cursor-pointer ms-lg-n2" style="user-select: none">
    <IconBtn @click="openSearchDialog">
      <VIcon icon="ri-search-line" />
    </IconBtn>
    <span class="d-none d-md-flex align-center text-disabled ms-2" @click="openSearchDialog">
      <span class="me-3">搜索</span>
      <span class="meta-key">⌘K</span>
    </span>
  </div>
  <!-- 搜索弹窗 -->
  <SearchBarView v-model="searchDialog" v-if="searchDialog" @close="searchDialog = false" @showPluginPage="showPluginPage" />
  <!-- 插件数据页面 -->
  <VDialog v-model="pluginPageDialog" scrollable max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <VCard :title="`${currentPluginPagePlugin?.plugin_name}`" class="rounded-t">
      <DialogCloseBtn v-model="pluginPageDialog" />
      <VCardText class="min-h-40">
        <PageRender v-for="(item, index) in currentPluginPageItems" :key="index" :config="item" />
      </VCardText>
    </VCard>
  </VDialog>
</template>
<style type="scss" scoped>
.meta-key {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  block-size: 1.75rem;
  padding-block: 0.1rem;
  padding-inline: 0.25rem;
}
</style>
