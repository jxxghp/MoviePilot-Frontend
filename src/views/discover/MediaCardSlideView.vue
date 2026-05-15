<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import VirtualSlideView from '@/components/slide/VirtualSlideView.vue'
import { useI18n } from 'vue-i18n'
import { useIntersectionObserver, until } from '@vueuse/core'

const { t } = useI18n()

// 模块级数据缓存：当外层用 VirtualList 虚拟化时，SlideView 会随滚动
// 反复 unmount/mount，没有缓存会每次重新请求后端（公网部署还会打到 TMDB）。
// 缓存按 apipath 维度，跨实例共享，刷新页面即失效。
const dataCache = new Map<string, MediaInfo[]>()

// 输入参数
const props = defineProps({
  apipath: String,
  linkurl: String,
  title: String,
  ready: {
    type: Boolean,
    default: true,
  },
})

// 提供给子组件的属性
provide('rankingPropsKey', reactive({ ...props }))

// 组件加载完成
const componentLoaded = ref(false)
// 是否已尝试加载
const hasTriedLoading = ref(false)

// 使用 shallowRef 避免横向卡片区的大数组深层代理
const dataList = shallowRef<MediaInfo[]>([])

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 获取订阅列表数据
async function fetchData() {
  try {
    if (!props.apipath) return
    const cached = dataCache.get(props.apipath)
    if (cached) {
      dataList.value = cached
      if (cached.length > 0) await until(() => props.ready).toBe(true)
      componentLoaded.value = true
      return
    }
    dataList.value = await api.get(props.apipath)
    dataCache.set(props.apipath, dataList.value)
    if (dataList.value.length > 0) {
      // 数据获取后，等待 ready 信号再渲染，避免阻塞动画
      await until(() => props.ready).toBe(true)
    }
    componentLoaded.value = true
  } catch (error) {
    console.error(error)
    componentLoaded.value = true
  } finally {
    hasTriedLoading.value = true
  }
}

// 使用 IntersectionObserver 实现懒加载
// rootMargin 收窄到 100px：仅在 SlideView 真正接近视口时才触发，
// 避免页面初次挂载时多个 SlideView 同时落在探测区导致的层叠 fire +
// 后续 layout shift 引发的"自动一直往下刷"假象。
const { stop } = useIntersectionObserver(
  containerRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      fetchData()
      stop()
    }
  },
  {
    rootMargin: '100px',
  },
)

onActivated(() => {
  if (dataList.value.length == 0 && hasTriedLoading.value) {
    fetchData()
  }
})
</script>

<template>
  <div ref="containerRef">
    <VirtualSlideView
      :items="dataList"
      :loading="!componentLoaded"
      :get-item-key="item => item.tmdb_id || item.douban_id || item.bangumi_id || item.media_id || item.title"
    >
      <template #item="{ item }">
        <MediaCard :media="item" width="9rem" />
      </template>
      <template #loading>
        <div v-for="i in 10" :key="i" style="width: 9rem">
          <VCard class="outline-none overflow-hidden">
            <div style="padding-bottom: 150%"></div>
          </VCard>
        </div>
      </template>
    </VirtualSlideView>
  </div>
</template>
