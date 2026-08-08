<script lang="ts" setup>
import api from '@/api'
import type { MusicArtistInfo } from '@/api/types'
import MusicArtistCard from '@/components/cards/MusicArtistCard.vue'
import VirtualSlideView from '@/components/slide/VirtualSlideView.vue'
import { useIntersectionObserver } from '@vueuse/core'

const props = defineProps({
  // 关联艺术家接口路径
  apipath: String,
  // 区块标题
  title: String,
  // 瀑布浏览全部的路由，对齐影视详情页的“更多”入口
  linkurl: String,
})

// 提供给 VirtualSlideView 的标题与“更多”链接，避免再渲染一层重复标题
provide('rankingPropsKey', reactive({ ...props }))

// 组件是否已经完成首次加载
const componentLoaded = ref(false)

// 是否已尝试加载
const hasTriedLoading = ref(false)

// 使用 shallowRef 避免横向卡片区的深层代理
const dataList = shallowRef<MusicArtistInfo[]>([])

const containerRef = ref<HTMLElement | null>(null)

/** 拉取关联艺术家列表。 */
async function fetchData() {
  if (!props.apipath) return
  try {
    dataList.value = (await api.get(props.apipath)) || []
  } catch (error) {
    console.error(error)
  } finally {
    componentLoaded.value = true
    hasTriedLoading.value = true
  }
}

const { stop } = useIntersectionObserver(
  containerRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      fetchData()
      stop()
    }
  },
  { rootMargin: '300px' },
)

watch(
  () => props.apipath,
  () => {
    dataList.value = []
    componentLoaded.value = false
    hasTriedLoading.value = false
    fetchData()
  },
)

onActivated(() => {
  if (dataList.value.length === 0 && hasTriedLoading.value) fetchData()
})
</script>

<template>
  <div ref="containerRef">
    <VirtualSlideView
      v-if="!componentLoaded || dataList.length > 0"
      :items="dataList"
      :loading="!componentLoaded"
      :get-item-key="item => item.media_id || item.name"
    >
      <template #item="{ item }">
        <MusicArtistCard :artist="item" width="9rem" />
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
