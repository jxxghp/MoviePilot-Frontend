<script lang="ts" setup>
import { VPullToRefresh } from 'vuetify/labs/VPullToRefresh'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import SubscribeEditDialog from '@/components/dialog/SubscribeEditDialog.vue'
import SubscribeHistoryDialog from '@/components/dialog/SubscribeHistoryDialog.vue'
import store from '@/store'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

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

// 获取订阅列表数据
async function fetchData() {
  try {
    loading.value = true
    dataList.value = await api.get('subscribe/')
    loading.value = false
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 刷新状态
const loading = ref(false)

// 下拉刷新
async function onRefresh({ done }: { done: any }) {
  await fetchData()
  done('ok')
}

// 过滤数据，管理员用户显示全部，非管理员只显示自己的订阅
const filteredDataList = computed(() => {
  // 从Vuex Store中获取用户信息
  const superUser = store.state.auth.superUser
  const userName = store.state.auth.userName
  if (superUser) return dataList.value.filter(data => data.type === props.type)
  else return dataList.value.filter(data => data.type === props.type && data.username === userName)
})

onMounted(async () => {
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
    fetchData()
  }
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VPullToRefresh v-model="loading" @load="onRefresh">
    <div v-if="filteredDataList.length > 0" class="mx-3 grid gap-4 grid-subscribe-card p-1">
      <SubscribeCard
        v-for="data in filteredDataList"
        :key="data.id"
        :media="data"
        @remove="fetchData"
        @save="fetchData"
      />
    </div>
    <NoDataFound
      v-if="filteredDataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有订阅"
      error-description="请通过搜索添加电影、电视剧订阅。"
    />
  </VPullToRefresh>
  <!-- 底部操作按钮 -->
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
