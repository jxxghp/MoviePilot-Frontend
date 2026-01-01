<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import SlideView from '@/components/slide/SlideView.vue'
import { useI18n } from 'vue-i18n'
import { useIntersectionObserver, until } from '@vueuse/core'

const { t } = useI18n()

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

// 数据列表
const dataList = ref<MediaInfo[]>([])

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 获取订阅列表数据
async function fetchData() {
  try {
    if (!props.apipath) return
    dataList.value = await api.get(props.apipath)
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
const { stop } = useIntersectionObserver(
  containerRef,
  ([{ isIntersecting }]) => {
    if (isIntersecting) {
      fetchData()
      stop()
    }
  },
  {
    rootMargin: '300px', // 提前加载距离
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
    <SlideView v-if="componentLoaded">
      <template #content>
        <template v-for="data in dataList" :key="data.tmdb_id || data.douban_id || data.bangumi_id">
          <MediaCard :media="data" width="9rem" />
        </template>
      </template>
    </SlideView>
    <SlideView v-else-if="!componentLoaded">
      <template #content>
        <div v-for="i in 10" :key="i" style="width: 9rem">
          <VCard class="outline-none overflow-hidden">
            <div style="padding-bottom: 150%"></div>
          </VCard>
        </div>
      </template>
    </SlideView>
  </div>
</template>
