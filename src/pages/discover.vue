<script setup lang="ts">
import { getDiscoverTabs } from '@/router/i18n-menu'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
import AniListView from '@/views/discover/AniListView.vue'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { DiscoverSource } from '@/api/types'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { openSharedDialog } from '@/composables/useSharedDialog'

const DiscoverTabOrderDialog = defineAsyncComponent(() => import('@/components/dialog/DiscoverTabOrderDialog.vue'))

// 国际化
const { t } = useI18n()

// 路由
const route = useRoute()

const activeTab = ref('')

// 本地存储键值
const localOrderKey = 'MP_DISCOVER_TAB_ORDER'

// 顺序配置
const orderConfig = ref<{ name: string }[]>([])

// 标签页
const discoverTabs = ref<DiscoverSource[]>([])

// 标签页项
const discoverTabItems = computed(() => {
  return discoverTabs.value.map(item => ({
    title: item.name,
    tab: item.mediaid_prefix,
  }))
})

// 额外的数据源
const extraDiscoverSources = ref<DiscoverSource[]>([])

let orderDialogController: ReturnType<typeof openSharedDialog> | null = null
let extraSourcesRequest: Promise<void> | null = null
let initialLoadPromise: Promise<void> | null = null

// 打开发现页标签排序共享弹窗。
function openOrderConfigDialog() {
  orderDialogController?.close()
  const releaseController = () => {
    if (orderDialogController === controller) orderDialogController = null
  }

  const controller = openSharedDialog(
    DiscoverTabOrderDialog,
    {
      tabs: discoverTabs.value,
    },
    {
      close: releaseController,
      save: tabs => saveTabOrder(tabs, controller),
      'update:modelValue': (value: boolean) => {
        if (!value) releaseController()
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
  orderDialogController = controller
}

// 关闭发现页标签排序共享弹窗。
function closeOrderConfigDialog(controller = orderDialogController) {
  if (!controller || orderDialogController !== controller) return
  controller.close()
  orderDialogController = null
}

// 构造内置发现标签，扩展来源刷新时以此为稳定基线。
function createBuiltInDiscoverTabs() {
  const tabs = getDiscoverTabs(t)
  return tabs.map(tab => {
    return {
      name: tab.title,
      mediaid_prefix: tab.tab,
      api_path: '',
      filter_params: {},
      filter_ui: [],
    }
  })
}

// 用最近一次成功快照替换扩展来源，并保持 mediaid_prefix 唯一。
function replaceExtraDiscoverSources(sources: DiscoverSource[]) {
  const builtInTabs = createBuiltInDiscoverTabs()
  const seenPrefixes = new Set(builtInTabs.map(tab => tab.mediaid_prefix))
  const nextExtraSources = sources.filter(source => {
    if (seenPrefixes.has(source.mediaid_prefix)) return false
    seenPrefixes.add(source.mediaid_prefix)
    return true
  })

  extraDiscoverSources.value = nextExtraSources
  discoverTabs.value = [...builtInTabs, ...nextExtraSources]
}

// 加载额外的发现数据源；并发生命周期钩子共享同一次请求。
function loadExtraDiscoverSources() {
  if (extraSourcesRequest) return extraSourcesRequest

  extraSourcesRequest = refreshExtraDiscoverSources().finally(() => {
    extraSourcesRequest = null
  })
  return extraSourcesRequest
}

async function refreshExtraDiscoverSources() {
  try {
    const sources: DiscoverSource[] = await api.get('discover/source')
    replaceExtraDiscoverSources(sources)
  } catch (error) {
    console.log(error)
  }
}

// 按order的顺序排序
function sortSubscribeOrder() {
  if (!orderConfig.value) {
    return
  }
  if (discoverTabs.value.length === 0) {
    return
  }
  discoverTabs.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex((item: { name: string }) => item.name === a.name)
    const bIndex = orderConfig.value.findIndex((item: { name: string }) => item.name === b.name)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 加载顺序
async function loadOrderConfig() {
  // 顺序配置
  const local_order = localStorage.getItem(localOrderKey)
  if (local_order) {
    try {
      orderConfig.value = JSON.parse(local_order)
      return
    } catch {
      localStorage.removeItem(localOrderKey)
    }
  }

  const response = await api.get(`/user/config/${localOrderKey}`)
  if (response && response.data && response.data.value) {
    orderConfig.value = response.data.value
    localStorage.setItem(localOrderKey, JSON.stringify(orderConfig.value))
  }
}

// 保存顺序设置
async function saveTabOrder(tabs = discoverTabs.value, controller = orderDialogController) {
  discoverTabs.value = [...tabs]
  // 顺序配置
  const orderObj = discoverTabs.value.map(item => ({ name: item.name }))
  orderConfig.value = orderObj
  const orderString = JSON.stringify(orderObj)
  localStorage.setItem(localOrderKey, orderString)

  // 保存到服务端
  try {
    await api.post(`/user/config/${localOrderKey}`, orderObj)
  } catch (error) {
    console.error(error)
  }
  closeOrderConfigDialog(controller)
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup阶段，但使用computed保证响应性）
registerHeaderTab({
  items: discoverTabItems, // 传递computed值，会自动响应变化
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-order-alphabetical-ascending',
      variant: 'text',
      color: 'grey',
      class: 'settings-icon-button',
      permission: 'discovery',
      action: openOrderConfigDialog,
    },
  ],
})

async function initializeDiscover() {
  discoverTabs.value = createBuiltInDiscoverTabs()
  try {
    await loadOrderConfig()
  } catch (error) {
    console.log(error)
  }
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 选中第一个标签页
  if (discoverTabs.value.length > 0) {
    activeTab.value = discoverTabs.value[0].mediaid_prefix
  }
}

onBeforeMount(() => {
  initialLoadPromise = initializeDiscover().finally(() => {
    initialLoadPromise = null
  })
})

onActivated(async () => {
  if (initialLoadPromise) {
    await initialLoadPromise
    return
  }

  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 如果当前没有选中任何标签页，或者当前选中的标签页不存在，则选中第一个标签页
  if (!activeTab.value || !discoverTabs.value.find(tab => tab.mediaid_prefix === activeTab.value)) {
    if (discoverTabs.value.length > 0) {
      activeTab.value = discoverTabs.value[0].mediaid_prefix
    }
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem value="themoviedb">
        <div>
          <TheMovieDbView />
        </div>
      </VWindowItem>
      <VWindowItem value="douban">
        <div>
          <DoubanView />
        </div>
      </VWindowItem>
      <VWindowItem value="bangumi">
        <div>
          <BangumiView />
        </div>
      </VWindowItem>
      <VWindowItem value="anilist">
        <div>
          <AniListView />
        </div>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.mediaid_prefix">
        <div>
          <ExtraSourceView :source="item" />
        </div>
      </VWindowItem>
    </VWindow>
    <!-- 快速滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/discover'">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
