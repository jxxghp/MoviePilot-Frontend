<script lang="ts" setup>
import PersonCard from '@/components/cards/PersonCard.vue'
import type { Person } from '@/api/types'
import api from '@/api'
import VirtualSlideView from '@/components/slide/VirtualSlideView.vue'
import { useIntersectionObserver } from '@vueuse/core'

// 输入参数
const props = defineProps({
  apipath: String,
  linkurl: String,
  title: String,
  type: String,
})

provide('rankingPropsKey', reactive({ ...props }))

// 组件加载完成
const componentLoaded = ref(false)

// 是否已尝试加载
const hasTriedLoading = ref(false)

// 数据列表
const dataList = shallowRef<Person[]>([])

// 容器引用
const containerRef = ref<HTMLElement | null>(null)

// 获取订阅列表数据
async function fetchData() {
  try {
    if (!props.apipath) return

    dataList.value = await api.get(props.apipath)
    componentLoaded.value = true
  } catch (error) {
    console.error(error)
  } finally {
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
  {
    rootMargin: '300px',
  },
)

onActivated(() => {
  if (dataList.value.length === 0 && hasTriedLoading.value) {
    fetchData()
  }
})
</script>

<template>
  <div ref="containerRef">
    <VirtualSlideView :items="dataList" :loading="!componentLoaded" :get-item-key="item => item.id">
      <template #item="{ item }">
        <PersonCard :person="item" width="9rem" />
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
