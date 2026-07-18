<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import PersonCardListView from '@/views/discover/PersonCardListView.vue'
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

function getApiPath(paths: string[]) {
  return paths.join('/')
}
</script>

<template>
  <div>
    <VPageContentTitle :title="title" />
    <PersonCardListView v-if="type === 'person'" :apipath="getApiPath(props.paths)" :params="route.query" />
    <MediaCardListView v-else :apipath="getApiPath(props.paths)" :params="route.query" />
    <Teleport to="body">
      <VScrollToTopBtn />
    </Teleport>
  </div>
</template>
