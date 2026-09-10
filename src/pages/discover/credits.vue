<script setup lang="ts">
import PersonCardListView from '@/views/discover/PersonCardListView.vue'

// 输入参数
const props = defineProps({
  // API路径
  paths: Array as PropType<string[]> | PropType<string>,
})

// 路由参数
const route = useRoute()

// 标题
let title = route.query?.title?.toString()

// 计算API路径
function getApiPath(paths: string[] | string) {
  if (Array.isArray(paths)) return paths.join('/')
  else return paths
}
</script>

<template>
  <div>
    <VPageContentTitle :title="title" />
    <PersonCardListView :apipath="getApiPath(props.paths || '')" />
  </div>
</template>
