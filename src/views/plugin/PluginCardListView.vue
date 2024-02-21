<script lang="ts" setup>
import api from '@/api'
import type { Plugin } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import PluginCard from '@/components/cards/PluginCard.vue'

// 已安装插件列表
const dataList = ref<Plugin[]>([])

// 未安装插件列表
const uninstalledList = ref<Plugin[]>([])

// 是否刷新过
const isRefreshed = ref(false)

// APP市场是否加载完成
const isAppMarketLoaded = ref(false)

// APP市场窗口
const PluginAppDialog = ref(false)

// 关闭插件市场窗口
function pluginDialogClose() {
  PluginAppDialog.value = false
}

// 新安装了插件
function pluginInstalled() {
  fetchInstalledPlugins()
  pluginDialogClose()
  fetchUninstalledPlugins()
}

// 获取插件列表数据
async function fetchInstalledPlugins() {
  try {
    dataList.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 获取未安装插件列表数据
async function fetchUninstalledPlugins() {
  try {
    uninstalledList.value = await api.get('plugin/', {
      params: {
        state: 'market',
      },
    })
    isAppMarketLoaded.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onBeforeMount(() => {
  fetchInstalledPlugins()
  fetchUninstalledPlugins()
})
</script>

<template>
  <div
    v-if="!isRefreshed"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      v-if="!isRefreshed"
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <div
    v-if="dataList.length > 0"
    class="grid gap-4 grid-plugin-card"
  >
    <PluginCard
      v-for="data in dataList"
      :key="data.id"
      :plugin="data"
      @remove="fetchInstalledPlugins"
      @save="fetchInstalledPlugins"
    />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有安装插件"
    error-description="点击右下角按钮，前往插件市场安装插件。"
  />
  <!-- App市场 -->
  <VDialog
    v-model="PluginAppDialog"
    fullscreen
    scrollable
    :scrim="false"
    transition="dialog-bottom-transition"
  >
    <!-- Dialog Activator -->
    <template #activator="{ props }">
      <VBtn
        icon="mdi-store-plus"
        v-bind="props"
        size="x-large"
        class="fixed right-5 bottom-5"
      />
    </template>

    <!-- Dialog Content -->
    <VCard>
      <!-- Toolbar -->
      <div>
        <VToolbar color="primary">
          <VToolbarTitle>插件市场</VToolbarTitle>

          <VSpacer />

          <VToolbarItems>
            <VBtn
              size="x-large"
              @click="pluginDialogClose"
            >
              <VIcon
                color="white"
                icon="mdi-close"
              />
            </VBtn>
          </VToolbarItems>
        </VToolbar>
      </div>
      <VCardText>
        <div
          v-if="!isAppMarketLoaded"
          class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
        >
          正在加载插件市场，请稍候...
          <VProgressCircular
            v-if="!isAppMarketLoaded"
            size="48"
            indeterminate
            color="primary"
          />
        </div>
        <div v-if="isAppMarketLoaded" class="grid gap-4 grid-plugin-card">
          <PluginAppCard
            v-for="data in uninstalledList"
            :key="data.id"
            :plugin="data"
            @install="pluginInstalled"
          />
        </div>
        <NoDataFound
          v-if="uninstalledList.length === 0 && isAppMarketLoaded"
          error-code="404"
          error-title="没有未安装插件"
          error-description="所有可用插件均已安装。"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.grid-plugin-card {
  grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
  padding-block-end: 1rem;
}
</style>
