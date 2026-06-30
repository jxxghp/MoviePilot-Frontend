<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import VirtualSlideView from '@/components/slide/VirtualSlideView.vue'
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
const loadingStarted = ref(false)

// 使用 shallowRef 避免横向卡片区的大数组深层代理
const dataList = shallowRef<MediaInfo[]>([])

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 获取订阅列表数据
async function fetchData() {
  if (loadingStarted.value) return

  loadingStarted.value = true
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
    loadingStarted.value = false
    hasTriedLoading.value = true
  }
}

function isNearViewport(element: HTMLElement, rootMargin = 300) {
  const rect = element.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight

  return rect.bottom >= -rootMargin && rect.top <= viewportHeight + rootMargin
}

/** IntersectionObserver 未及时回调时，首屏附近内容仍需主动发起数据请求。 */
function loadIfNearViewport() {
  const element = containerRef.value
  if (!element || loadingStarted.value || hasTriedLoading.value) return

  if (isNearViewport(element)) {
    fetchData()
    stop()
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

onMounted(() => {
  requestAnimationFrame(loadIfNearViewport)
  window.setTimeout(loadIfNearViewport, 600)
})

onActivated(() => {
  loadIfNearViewport()
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
