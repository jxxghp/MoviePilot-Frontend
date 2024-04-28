<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Plugin } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import PluginCard from '@/components/cards/PluginCard.vue'
import noImage from '@images/logos/plugin.png'
import { useDisplay } from 'vuetify'
import { isNullOrEmptyObject } from '@/@core/utils'

// 显示器宽度
const display = useDisplay()

// 已安装插件列表
const dataList = ref<Plugin[]>([])

// 未安装插件列表
const uninstalledList = ref<Plugin[]>([])

// 插件市场插件列表
const marketList = ref<Plugin[]>([])

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

// 过滤表单
const filterForm = reactive({
  // 名称
  name: [] as string[],
  // 作者
  author: [] as string[],
  // 标签
  label: [] as string[],
  // 插件库
  repo: [] as string[],
})

// 名称过滤项
const nameFilterOptions = ref<string[]>([])
// 作者过滤项
const authorFilterOptions = ref<string[]>([])
// 标签过滤项
const labelFilterOptions = ref<string[]>([])
// 插件库过滤项
const repoFilterOptions = ref<string[]>([])

// 初始化过滤选项
function initOptions(item: Plugin) {
  const optionValue = (options: Array<string>, value: string | undefined) => {
    value && !options.includes(value) && options.push(value)
  }
  const optionMutipleValue = (options: Array<string>, value: string | undefined) => {
    value && value.split(',').forEach(v => !options.includes(v) && options.push(v))
  }
  optionValue(nameFilterOptions.value, item.plugin_name)
  optionValue(authorFilterOptions.value, item.plugin_author)
  optionMutipleValue(labelFilterOptions.value, item.plugin_label)
  optionValue(repoFilterOptions.value, item.repo_url)
}

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

    const result: { [key: string]: any } = await api.get(`plugin/install/${item?.id}`, {
      params: {
        repo_url: item?.repo_url,
        force: item?.has_update,
      },
    })

    // 隐藏等待提示框
    progressDialog.value = false

    if (result.success) {
      $toast.success(`插件 ${item?.plugin_name} 安装成功！`)

      // 刷新
      refreshData()
    } else {
      $toast.error(`插件 ${item?.plugin_name} 安装失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
}

// 打开插件搜索结果
function openPlugin(item: Plugin) {
  // 如果是已安装插件则打开插件详情
  if (item.installed === true) {
    // 标记插件动作
    pluginActions.value[item.id || '0'] = true
  } else {
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
  if (pluginIconLoaded.value[item.id || '0'] === false) return noImage
  // 如果是网络图片则使用代理后返回
  if (item?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(item?.plugin_icon)}`

  return `./plugin_icon/${item?.plugin_icon}`
}

// 过滤插件
const filterPlugins = computed(() => {
  const all_list = [...dataList.value, ...uninstalledList.value]
  return all_list.filter((item: Plugin) => {
    // 需要忽略大小写
    return (
      item.plugin_name?.toLowerCase().includes(keyword.value.toLowerCase()) ||
      item.plugin_desc?.toLowerCase().includes(keyword.value.toLowerCase())
    )
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
  } catch (error) {
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
          data.history = uninstalled.history
          data.plugin_label = uninstalled.plugin_label
        }
      }
    }
    // 更新插件市场列表
    // 排除已安装且有更新的，上面的问题在于“本地存在未安装的旧版本插件且云端有更新时”不会在插件市场展示
    marketList.value = uninstalledList.value.filter(item => !(item.has_update && item.installed))
    // 初始化过滤选项
    marketList.value.forEach(initOptions)
  } catch (error) {
    console.error(error)
  }
}

// 加载插件统计数据
async function getPluginStatistics() {
  try {
    PluginStatistics.value = await api.get('plugin/statistic')
  } catch (error) {
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
  // 匹配过滤函数
  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))
  const matchMultiple = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && value.split(',').some(v => filter.includes(v)))

  // 过滤后的数据列表
  const ret_list: Plugin[] = []

  // 过滤
  marketList.value.forEach(value => {
    if (value) {
      if (
        match(filterForm.name, value.plugin_name) &&
        match(filterForm.author, value.plugin_author) &&
        matchMultiple(filterForm.label, value.plugin_label) &&
        match(filterForm.repo, value.repo_url)
      ) {
        ret_list.push(value)
      }
    }
  })

  // 按照统计数据排序
  if (isNullOrEmptyObject(PluginStatistics.value)) return ret_list
  return ret_list.sort((a, b) => {
    return PluginStatistics.value[b.id || '0'] - PluginStatistics.value[a.id || '0']
  })
})

// 标签转换
function pluginLabels(label: string | undefined) {
  if (!label) return []
  return label.split(',')
}

// 加载时获取数据
onBeforeMount(() => {
  refreshData()
  getPluginStatistics()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <div v-if="dataList.length > 0" class="grid gap-4 grid-plugin-card">
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
  <VFab icon="mdi-store-plus" location="bottom end" size="x-large" fixed app appear @click="PluginAppDialog = true" />
  <VDialog
    v-if="PluginAppDialog"
    v-model="PluginAppDialog"
    fullscreen
    scrollable
    :scrim="false"
    :z-index="1010"
    transition="dialog-bottom-transition"
  >
    <VCard>
      <!-- 标题栏 -->
      <div>
        <VToolbar color="primary">
          <VToolbarTitle>插件市场</VToolbarTitle>
          <VSpacer />
          <VToolbarItems>
            <VBtn size="x-large" @click="pluginDialogClose">
              <VIcon color="white" icon="mdi-close" />
            </VBtn>
          </VToolbarItems>
        </VToolbar>
      </div>
      <VCardText>
        <LoadingBanner v-if="!isAppMarketLoaded" class="mt-12" />
        <!-- 过滤表单 -->
        <div v-if="isAppMarketLoaded" class="bg-transparent mb-3 shadow-none">
          <VRow>
            <VCol v-if="nameFilterOptions.length > 0" cols="6" md="3">
              <VSelect
                v-model="filterForm.name"
                :items="nameFilterOptions"
                size="small"
                density="compact"
                chips
                label="名称"
                multiple
              />
            </VCol>
            <VCol v-if="authorFilterOptions.length > 0" cols="6" md="3">
              <VSelect
                v-model="filterForm.author"
                :items="authorFilterOptions"
                size="small"
                density="compact"
                chips
                label="作者"
                multiple
              />
            </VCol>
            <VCol v-if="labelFilterOptions.length > 0" cols="6" md="3">
              <VSelect
                v-model="filterForm.label"
                :items="labelFilterOptions"
                size="small"
                density="compact"
                chips
                label="标签"
                multiple
              />
            </VCol>
            <VCol v-if="repoFilterOptions.length > 0" cols="6" md="3">
              <VSelect
                v-model="filterForm.repo"
                :items="repoFilterOptions"
                size="small"
                density="compact"
                chips
                label="插件库"
                multiple
              />
            </VCol>
          </VRow>
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
  <VFab
    icon="mdi-magnify"
    color="info"
    location="bottom end"
    class="mb-2"
    size="x-large"
    fixed
    app
    appear
    @click="SearchDialog = true"
  />
  <VDialog
    v-if="SearchDialog"
    v-model="SearchDialog"
    scrollable
    :z-index="1010"
    max-width="40rem"
    :max-height="!display.mdAndUp.value ? '' : '85vh'"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mx-auto" width="100%">
      <VToolbar flat class="p-0">
        <VTextField
          v-model="keyword"
          label="搜索插件"
          single-line
          placeholder="插件名称或描述"
          variant="solo"
          prepend-inner-icon="mdi-magnify"
          flat
          class="mx-1"
        />
      </VToolbar>
      <DialogCloseBtn @click="closeSearchDialog" />
      <VList v-if="filterPlugins.length > 0" lines="two">
        <template v-for="(item, i) in filterPlugins" :key="i">
          <VListItem @click="openPlugin(item)">
            <template #prepend>
              <VAvatar>
                <VImg :src="pluginIcon(item)" @error="pluginIconError(item)">
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
              <VIcon v-if="item.installed" color="success" icon="mdi-check-circle" class="ms-2" size="small" />
            </VListItemTitle>
            <VListItemSubtitle class="mt-2">
              <VChip
                v-for="label in pluginLabels(item.plugin_label)"
                variant="tonal"
                size="small"
                class="me-1 my-1"
                color="info"
                label
              >
                {{ label }}
              </VChip>
              <span>
                {{ item.plugin_desc }}
              </span>
            </VListItemSubtitle>
          </VListItem>
        </template>
      </VList>
    </VCard>
  </VDialog>
  <!-- 安装插件进度框 -->
  <VDialog v-model="progressDialog" :scrim="false" width="25rem">
    <VCard color="primary">
      <VCardText class="text-center">
        {{ progressText }}
        <VProgressLinear indeterminate color="white" class="mb-0 mt-1" />
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
