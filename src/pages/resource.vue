<script setup lang="ts">
import NoDataFound from '@/components/NoDataFound.vue'
import api from '@/api'
import type { Context } from '@/api/types'
import store from '@/store'
import TorrentCardListView from '@/views/discover/TorrentCardListView.vue'
import TorrentRowListView from '@/views/discover/TorrentRowListView.vue'

// 路由参数
const route = useRoute()

// 查询TMDBID或标题
const keyword = route.query?.keyword?.toString() ?? ''

// 查询类型
const type = route.query?.type?.toString() ?? ''

// 搜索字段
const area = route.query?.area?.toString() ?? ''

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
  progressEventSource.value.onmessage = (event) => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressEventSource.value?.close()
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
    }
    else {
      startLoadingProgress()
      // 优先按TMDBID精确查询
      if (keyword?.startsWith('tmdb:') || keyword?.startsWith('douban:') || keyword?.startsWith('bangumi:')) {
        const result: {[key: string]: any} = await api.get(`search/media/${keyword}`, {
          params: {
            mtype: type,
            area,
          },
        })
        if (result.success){
          dataList.value = result.data
        } else {
          errorDescription.value = result.message
        }
      }
      else {
        // 按标题模糊查询
        dataList.value = await api.get(`search/title/${keyword}`)
      }
      stopLoadingProgress()
    }
    // 标记已刷新
    isRefreshed.value = true
  }
  catch (error) {
    console.error(error)
    return Promise.reject(error)
  }
}

// 加载数据
onMounted(() => {
  fetchData()
})
</script>

<template>
  <div v-if="!isRefreshed" class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center">
    <VProgressCircular v-if="!keyword" size="48" indeterminate color="primary" />
    <VProgressCircular v-if="keyword" class="mb-3" color="primary" :model-value="progressValue" size="64" />
    <span>{{ progressText }}</span>
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    :error-title="errorTitle"
    :error-description="errorDescription"
  />
  <div v-if="dataList.length > 0">
    <TorrentRowListView
      v-if="viewType === 'list'"
      :items="dataList"
    />
    <TorrentCardListView
      v-else
      :items="dataList"
    />
  </div>
  <!-- 视图切换 -->
  <VFab
    v-if="viewType === 'list'"
    icon="mdi-view-grid"
    location="bottom end"
    size="x-large"
    fixed
    app
    appear
    @click="setViewType('card')"
  />
  <VFab
    v-else
    icon="mdi-view-list"
    location="bottom end"
    size="x-large"
    fixed
    app
    appear
    @click="setViewType('list')"
  />
</template>
