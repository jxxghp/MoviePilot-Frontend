<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import PersonCardListView from '@/views/discover/PersonCardListView.vue'
import { parseMediaDataSources } from '@/utils/mediaId'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  // `/browse/:paths+` 捕获的 API 路径段。
  paths: {
    type: Array as PropType<string[]>,
    required: true,
  },
})

const route = useRoute()

let title = route.query?.title?.toString()

const type = route.query?.type?.toString()
if (type === 'person') title = t('browse.actor') + ': ' + title

/** 将路由段转换为后端 API 路径。 */
function getApiPath(paths: string[]) {
  return paths.join('/')
}

// 只有统一媒体搜索接受多个枚举来源，其余 browse 接口保持原始路由参数契约。
const requestParams = computed<Record<string, unknown>>(() => {
  const params: Record<string, unknown> = { ...route.query }
  if (getApiPath(props.paths) !== 'media/search') return params

  const mediaSources = parseMediaDataSources(route.query.media_source)
  if (mediaSources.length > 0) params.media_source = mediaSources
  else delete params.media_source
  return params
})
</script>

<template>
  <div>
    <VPageContentTitle :title="title" />
    <PersonCardListView v-if="type === 'person'" :apipath="getApiPath(props.paths)" :params="requestParams" />
    <MediaCardListView v-else :apipath="getApiPath(props.paths)" :params="requestParams" />
    <Teleport to="body">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
