<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Plugin } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import PluginCard from '@/components/cards/PluginCard.vue'
import noImage from '@images/logos/plugin.png'

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

// 插件安装统计
const PluginStatistics = ref<{ [key: string]: number }>({})

// 搜索窗口
const SearchDialog = ref(false)

// 搜索关键字
const keyword = ref('')

// 每一个插件的图标加载状态
const pluginIconLoaded = ref<{ [key: string]: boolean }>({})

// 每一个插件的动作标识
const pluginActions = ref<{ [key: string]: boolean }>({})

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 进度框文本
const progressText = ref('正在安装插件...')

// 关闭插件市场窗口
function pluginDialogClose() {
  PluginAppDialog.value = false
}

// 安装插件
async function installPlugin(item: Plugin) {
  try {
    // 显示等待提示框
    progressDialog.value = true
    progressText.value = `正在安装 ${item?.plugin_name} v${item?.plugin_version} ...`

    const result: { [key: string]: any } = await api.get(
      `plugin/install/${item?.id}`,
      {
        params: {
          repo_url: item?.repo_url,
          force: item?.has_update,
        },
      },
    )

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(`插件 ${item?.plugin_name} 安装成功！`)

      // 刷新
      refreshData()
    }
    else {
      $toast.error(`插件 ${item?.plugin_name} 安装失败：${result.message}`)
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 打开插件搜索结果
function openPlugin(item: Plugin) {
  // 如果是已安装插件则打开插件详情
  if (item.installed === true) {
    // 标记插件动作
    pluginActions.value[item.id || '0'] = true
  }
  else {
    // 如果是未安装插件则安装
    installPlugin(item)
  }
  closeSearchDialog()
}

// 关闭插件搜索窗口
function closeSearchDialog() {
  SearchDialog.value = false
}

// 插件图标加载错误
function pluginIconError(item: Plugin) {
  pluginIconLoaded.value[item.id || '0'] = false
}

// 插件图标地址
function pluginIcon(item: Plugin) {
  // 如果图片加载错误
  if (pluginIconLoaded.value[item.id || '0'] === false)
    return noImage
  // 如果是网络图片则使用代理后返回
  if (item?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/${encodeURIComponent(item?.plugin_icon)}/1`

  return `./plugin_icon/${item?.plugin_icon}`
}

// 过滤插件
const filterPlugins = computed(() => {
  const all_list = [...dataList.value, ...uninstalledList.value]
  return all_list.filter((item: Plugin) => {
    return item.plugin_name?.includes(keyword.value) || item.plugin_desc?.includes(keyword.value)
  })
})

// 新安装了插件
function pluginInstalled() {
  pluginDialogClose()
  refreshData()
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
    // 设置APP市场加载完成
    isAppMarketLoaded.value = true
    // 设置更新状态
    for (const uninstalled of uninstalledList.value) {
      for (const data of dataList.value) {
        if (uninstalled.id === data.id) {
          data.has_update = true
          data.repo_url = uninstalled.repo_url
        }
      }
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 加载插件统计数据
async function getPluginStatistics() {
  try {
    PluginStatistics.value = await api.get('plugin/statistic')
  }
  catch (error) {
    console.error(error)
  }
}

// 加载所有数据
function refreshData() {
  fetchInstalledPlugins()
  fetchUninstalledPlugins()
}

// 对uninstalledList进行排序，按PluginStatistics倒序
const sortedUninstalledList = computed(() => {
  const list = uninstalledList.value.filter(item => !item.has_update)
  if (PluginStatistics.value.length === 0)
    return list
  return list.sort((a, b) => {
    return PluginStatistics.value[b.id || '0'] - PluginStatistics.value[a.id || '0']
  })
})

// 加载时获取数据
onBeforeMount(() => {
  refreshData()
  getPluginStatistics()
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
      :key="`${data.id}_v${data.plugin_version}`"
      :count="PluginStatistics[data.id || '0']"
      :plugin="data"
      :action="pluginActions[data.id || '0']"
      @remove="refreshData"
      @save="refreshData"
      @action-done="pluginActions[data.id || '0'] = false"
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
    :z-index="1010"
    transition="dialog-bottom-transition"
  >
    <!-- Dialog Activator -->
    <template #activator="{ props }">
      <VFab
        v-bind="props"
        icon="mdi-store-plus"
        location="bottom end"
        size="x-large"
        fixed
        app
        appear
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
          <VProgressCircular
            v-if="!isAppMarketLoaded"
            size="48"
            indeterminate
            color="primary"
          />
        </div>
        <div v-if="isAppMarketLoaded" class="grid gap-4 grid-plugin-card">
          <PluginAppCard
            v-for="data in sortedUninstalledList"
            :key="`${data.id}_v${data.plugin_version}`"
            :plugin="data"
            :count="PluginStatistics[data.id || '0']"
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

  <!-- 插件搜索 -->
  <VDialog
    v-model="SearchDialog"
    scrollable
    :z-index="1010"
    max-width="40rem"
    max-height="90vh"
  >
    <!-- Dialog Activator -->
    <template #activator="{ props }">
      <VFab
        v-bind="props"
        icon="mdi-magnify"
        color="info"
        location="bottom end"
        class="mb-2"
        size="x-large"
        fixed
        app
        appear
      />
    </template>
    <VCard
      class="mx-auto"
      width="100%"
    >
      <VToolbar flat class="p-0">
        <VTextField
          v-model="keyword"
          label="搜索插件"
          single-line
          placeholder="插件名称或描述"
          variant="solo"
          append-inner-icon="mdi-magnify"
          flat
          class="mx-1"
        />
      </VToolbar>

      <VList
        v-if="filterPlugins.length > 0"
        lines="two"
      >
        <template v-for="(item, i) in filterPlugins" :key="i">
          <VListItem
            @click="openPlugin(item)"
          >
            <template #prepend>
              <VAvatar>
                <VImg
                  :src="pluginIcon(item)"
                  @error="pluginIconError(item)"
                >
                  <template #placeholder>
                    <div class="w-full h-full">
                      <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
                    </div>
                  </template>
                </VImg>
              </VAvatar>
            </template>
            <VListItemTitle>
              {{ item.plugin_name }}<span class="text-sm ms-2 mt-1 text-gray-500">v{{ item?.plugin_version }}</span>
              <ExistIcon v-if="item.installed" />
            </VListItemTitle>
            <VListItemSubtitle class="mt-2" v-html="item.plugin_desc" />
          </VListItem>
        </template>
      </VList>
    </VCard>
  </VDialog>
  <!-- 安装插件进度框 -->
  <VDialog
    v-model="progressDialog"
    :scrim="false"
    width="25rem"
  >
    <VCard
      color="primary"
    >
      <VCardText class="text-center">
        {{ progressText }}
        <VProgressLinear
          indeterminate
          color="white"
          class="mb-0 mt-1"
        />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.grid-plugin-card {
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  padding-block-end: 1rem;
}
</style>
