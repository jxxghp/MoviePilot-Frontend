<script lang="ts" setup>
import draggable from 'vuedraggable'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import SubscribeEditDialog from '@/components/dialog/SubscribeEditDialog.vue'
import SubscribeHistoryDialog from '@/components/dialog/SubscribeHistoryDialog.vue'
import store from '@/store'
import { useDisplay } from 'vuetify'

// APP
const display = useDisplay()
const appMode = inject('pwaMode') && display.mdAndDown.value

// 输入参数
const props = defineProps({
  type: String,
  subid: String,
})

// 是否刷新过
let isRefreshed = ref(false)

// 数据列表
const dataList = ref<Subscribe[]>([])

// 弹窗
const subscribeEditDialog = ref(false)

// 历史记录弹窗
const historyDialog = ref(false)

// 订阅顺序配置
const orderConfig = ref<{ id: number }[]>([])

// 排序存储键
const orderKey = props.type === '电影' ? 'MP_SUBSCRIBE_MOVIE_ORDER' : 'MP_SUBSCRIBE_TV_ORDER'

// 显示的订阅列表
const displayList = ref<Subscribe[]>([])

// 监听dataList变化，同步更新displayList
watch(dataList, () => {
  // 从Vuex Store中获取用户信息
  const superUser = store.state.auth.superUser
  const userName = store.state.auth.userName
  if (superUser) displayList.value = dataList.value.filter(data => data.type === props.type)
  else displayList.value = dataList.value.filter(data => data.type === props.type && data.username === userName)
})

// 加载顺序
async function loadSubscribeOrderConfig() {
  // 顺序配置
  const local_order = localStorage.getItem(orderKey)
  if (local_order) {
    orderConfig.value = JSON.parse(local_order)
  } else {
    const response2 = await api.get('/user/config/SubscribeOrder', {
      params: { type: props.type },
    })
    if (response2?.data?.value?.orderList) {
      orderConfig.value = response2.data.value.orderList
      localStorage.setItem(orderKey, JSON.stringify(orderConfig.value))
    }
  }
}

// 按order的顺序排序
function sortSubscribeOrder() {
  if (!orderConfig.value) {
    return
  }
  if (dataList.value.length === 0) {
    return
  }
  dataList.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex((item: { id: number }) => item.id === a.id)
    const bIndex = orderConfig.value.findIndex((item: { id: number }) => item.id === b.id)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 保存顺序设置
async function saveSubscribeOrder() {
  // 顺序配置
  const orderList = displayList.value.map(item => ({ id: item.id }))
  orderConfig.value = orderList
  const orderString = JSON.stringify(orderList)
  localStorage.setItem(orderKey, orderString)

  // 保存到服务端
  try {
    await api.post('/user/config/SubscribeOrder', { orderList, type: props.type })
  } catch (error) {
    console.error(error)
  }
}

// 获取订阅列表数据
async function fetchData() {
  try {
    loading.value = true
    dataList.value = await api.get('subscribe/')
    // 排序
    sortSubscribeOrder()
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 刷新状态
const loading = ref(false)

onMounted(async () => {
  await loadSubscribeOrderConfig()
  await fetchData()
  if (props.subid) {
    // 找到这个订阅
    const sub = dataList.value.find(sub => sub.id.toString() == props.subid?.toString())
    if (sub) {
      // 打开编辑弹窗
      sub.page_open = true
    }
  }
})

onActivated(async () => {
  if (!loading.value) {
    await fetchData()
  }
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <draggable
    v-if="displayList.length > 0"
    v-model="displayList"
    @end="saveSubscribeOrder"
    handle=".cursor-move"
    item-key="id"
    tag="div"
    :component-data="{ class: 'mx-3 grid gap-4 grid-subscribe-card p-1' }"
  >
    <template #item="{ element }">
      <SubscribeCard :key="element.id" :media="element" @remove="fetchData" @save="fetchData" />
    </template>
  </draggable>
  <NoDataFound
    v-if="displayList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有订阅"
    error-description="请通过搜索添加电影、电视剧订阅。"
  />
  <!-- 底部操作按钮 -->
  <div v-if="isRefreshed">
    <VFab
      v-if="store.state.auth.superUser"
      icon="mdi-clipboard-edit"
      location="bottom"
      size="x-large"
      fixed
      app
      appear
      @click="subscribeEditDialog = true"
      :class="{ 'mb-12': appMode }"
    />
    <VFab
      v-if="store.state.auth.superUser"
      icon="mdi-history"
      color="info"
      location="bottom"
      :class="appMode ? 'mb-28' : 'mb-16'"
      size="x-large"
      fixed
      app
      appear
      @click="historyDialog = true"
    />
  </div>
  <!-- 订阅编辑弹窗 -->
  <SubscribeEditDialog
    v-if="subscribeEditDialog"
    v-model="subscribeEditDialog"
    :default="true"
    :type="props.type"
    @save="subscribeEditDialog = false"
    @close="subscribeEditDialog = false"
  />
  <!-- 历史记录弹窗 -->
  <SubscribeHistoryDialog
    v-if="historyDialog"
    v-model="historyDialog"
    :type="props.type"
    @close="historyDialog = false"
    @save="
      () => {
        historyDialog = false
        fetchData()
      }
    "
  />
</template>
