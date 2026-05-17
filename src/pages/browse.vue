<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import PersonCardListView from '@/views/discover/PersonCardListView.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // API路径
  paths: Array as PropType<string[]> | PropType<string>,
})

// 路由参数
const route = useRoute()

// 标题
let title = route.query?.title?.toString()

// 类型
const type = route.query?.type?.toString()
if (type === 'person') title = t('browse.actor') + ': ' + title

// 计算API路径
function getApiPath(paths: string[] | string) {
  if (Array.isArray(paths)) return paths.join('/')
  else return paths
}
</script>

<template>
  <div>
    <VPageContentTitle :title="title" />
    <PersonCardListView v-if="type === 'person'" :apipath="getApiPath(props.paths || '')" :params="route.query" />
    <MediaCardListView v-else :apipath="getApiPath(props.paths || '')" :params="route.query" />
    <Teleport to="body">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
