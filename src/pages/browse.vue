<script setup lang="ts">
import api from '@/api'
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
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

// 类型
const type = route.query?.type?.toString()
if (type === 'person') title = '演员：' + title

// 识别类型
const RecognizeType = ref('themoviedb')

// 计算人物类型
const PersonType = computed(() => {
  if (RecognizeType.value === 'douban') return 'douban'
  else if (RecognizeType.value === 'bangumi') return 'bangumi'
  else return 'tmdb'
})

// 计算API路径
function getApiPath(paths: string[] | string) {
  if (Array.isArray(paths)) return paths.join('/')
  else return paths
}

// 加载系统设计
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) RecognizeType.value = result.data?.RECOGNIZE_SOURCE
  } catch (error) {
    console.error(error)
  }
}

onMounted(async () => {
  if (type === 'person') await loadSystemSettings()
})
</script>

<template>
  <div>
    <div v-if="title" class="mt-3 md:flex md:items-center md:justify-between">
      <div class="min-w-0 flex-1 mx-0">
        <h2
          class="mb-4 truncate text-2xl font-bold leading-7 text-gray-100 sm:overflow-visible sm:text-4xl sm:leading-9 md:mb-0"
          data-testid="page-header"
        >
          <span class="text-moviepilot">{{ title }}</span>
        </h2>
      </div>
    </div>
    <PersonCardListView
      v-if="type === 'person'"
      :apipath="getApiPath(props.paths || '')"
      :type="PersonType"
      :params="route.query"
    />
    <MediaCardListView v-else :apipath="getApiPath(props.paths || '')" :params="route.query" />
  </div>
</template>
