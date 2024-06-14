<script setup lang="ts">
import NoDataFound from '@/components/NoDataFound.vue'
import api from '@/api'
import type { Context } from '@/api/types'
import store from '@/store'
import TorrentCardListView from '@/views/discover/TorrentCardListView.vue'
import TorrentRowListView from '@/views/discover/TorrentRowListView.vue'
import { useDisplay } from 'vuetify'

// APP
const display = useDisplay()
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 路由参数
const route = useRoute()

// 查询TMDBID或标题
const keyword = route.query?.keyword?.toString() ?? ''

// 查询类型
const type = route.query?.type?.toString() ?? ''

// 搜索字段
const area = route.query?.area?.toString() ?? ''

// 搜索季
const season = route.query?.season?.toString() ?? ''

// 视图类型，从localStorage中读取
const viewType = ref<string>(localStorage.getItem('MPTorrentsViewType') ?? 'card')

// 数据列表
const dataList = ref<Array<Context>>([])

// 是否刷新过
const isRefreshed = ref(false)

// 加载进度文本
const progressText = ref('')

// 加载进度
const progressValue = ref(0)

// 加载进度SSE
const progressEventSource = ref<EventSource>()

// 错误标题
const errorTitle = ref('没有数据')

// 错误描述
const errorDescription = ref('未搜索到任何资源')

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = '正在搜索，请稍候...'

  const token = store.state.auth.token

  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/search?token=${token}`,
  )
  progressEventSource.value.onmessage = event => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  if (progressEventSource.value) progressEventSource.value?.close()
}

// 设置视图类型
function setViewType(type: string) {
  localStorage.setItem('MPTorrentsViewType', type)
  viewType.value = type
}

// 获取搜索列表数据
async function fetchData() {
  try {
    if (!keyword) {
      // 查询上次搜索结果
      dataList.value = await api.get('search/last')
    } else {
      startLoadingProgress()
      let result: { [key: string]: any }
      // 优先按TMDBID精确查询
      if (keyword?.startsWith('tmdb:') || keyword?.startsWith('douban:') || keyword?.startsWith('bangumi:')) {
        result = await api.get(`search/media/${keyword}`, {
          params: {
            mtype: type,
            area,
            season,
          },
        })
      } else {
        // 按标题模糊查询
        result = await api.get(`search/title`, {
          params: {
            keyword,
          },
        })
      }
      if (result && result.success) {
        dataList.value = result.data
      } else if (result && result.message) {
        errorDescription.value = result.message
      }
      stopLoadingProgress()
      // 从浏览器历史中删除当前搜索
      window.history.replaceState(null, '', window.location.pathname)
    }
    // 标记已刷新
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
    return Promise.reject(error)
  }
}

// 加载数据
onMounted(() => {
  fetchData()
})

// 卸载时停止加载进度
onUnmounted(() => {
  stopLoadingProgress()
})
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" :text="progressText" :progress="progressValue" />
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
  <div v-if="dataList.length > 0">
    <TorrentRowListView v-if="viewType === 'list'" :items="dataList" />
    <TorrentCardListView v-else :items="dataList" />
  </div>
  <!-- 视图切换 -->
  <VFab
    v-if="viewType === 'list'"
    class="mb-12"
    icon="mdi-view-grid"
    location="bottom"
    size="x-large"
    absolute
    app
    appear
    @click="setViewType('card')"
    :class="{ 'mb-12': appMode }"
  />
  <VFab
    v-else
    icon="mdi-view-list"
    location="bottom"
    size="x-large"
    fixed
    app
    appear
    @click="setViewType('list')"
    :class="{ 'mb-12': appMode }"
  />
</template>
