<script setup lang="ts">
import { getDiscoverTabs } from '@/router/i18n-menu'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
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

// 打开发现页标签排序共享弹窗。
function openOrderConfigDialog() {
  orderDialogController?.close()
  orderDialogController = openSharedDialog(
    DiscoverTabOrderDialog,
    {
      tabs: discoverTabs.value,
    },
    {
      close: () => {
        orderDialogController = null
      },
      save: saveTabOrder,
      'update:modelValue': (value: boolean) => {
        if (!value) orderDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭发现页标签排序共享弹窗。
function closeOrderConfigDialog() {
  orderDialogController?.close()
  orderDialogController = null
}

// 初始化发现标签
function initDiscoverTabs() {
  const tabs = getDiscoverTabs(t)
  for (const tab of tabs) {
    discoverTabs.value.push({
      name: tab.title,
      mediaid_prefix: tab.tab,
      api_path: '',
      filter_params: {},
      filter_ui: [],
    })
  }
}

// 加载额外的发现数据源
async function loadExtraDiscoverSources() {
  try {
    extraDiscoverSources.value = await api.get('discover/source')
    if (extraDiscoverSources.value.length === 0) {
      return
    }
    for (const source of extraDiscoverSources.value) {
      if (discoverTabs.value.find(tab => tab.mediaid_prefix === source.mediaid_prefix)) {
        continue
      }
      discoverTabs.value.push(source)
    }
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
    orderConfig.value = JSON.parse(local_order)
  } else {
    const response = await api.get(`/user/config/${localOrderKey}`)
    if (response && response.data && response.data.value) {
      orderConfig.value = response.data.value
      localStorage.setItem(localOrderKey, JSON.stringify(orderConfig.value))
    }
  }
}

// 保存顺序设置
async function saveTabOrder(tabs = discoverTabs.value) {
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
  closeOrderConfigDialog()
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

onBeforeMount(async () => {
  initDiscoverTabs()
  await loadOrderConfig()
  await loadExtraDiscoverSources()
  sortSubscribeOrder()
  // 选中第一个标签页
  if (discoverTabs.value.length > 0) {
    activeTab.value = discoverTabs.value[0].mediaid_prefix
  }
})

onActivated(async () => {
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
        <transition name="fade-slide" appear>
          <div>
            <TheMovieDbView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="douban">
        <transition name="fade-slide" appear>
          <div>
            <DoubanView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="bangumi">
        <transition name="fade-slide" appear>
          <div>
            <BangumiView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.mediaid_prefix">
        <transition name="fade-slide" appear>
          <div>
            <ExtraSourceView :source="item" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
    <!-- 快速滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/discover'">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
