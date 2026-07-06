<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'

// 定义输入变量
const props = defineProps({
  type: String, // 来源 themoviedb | douban
})

interface TmdbItem {
  // 媒体标题
  title: string
  // 媒体简介，包含类型标签
  overview: string
  // TMDB ID
  tmdbid: number
  // 豆瓣 ID
  doubanid: string
  // 海报地址
  poster: string
  // 媒体类型
  type?: string
}

// update:modelValue 事件
const emit = defineEmits(['update:modelValue', 'select', 'close'])

const items = ref<TmdbItem[]>([])

// 搜索词
const keyword = ref('')

// 加载中
const loading = ref(false)

// ref
const inputKeyword = ref<HTMLElement | null>(null)

// 选中条目并通知父组件同步额外媒体信息。
function selectMedia(item: TmdbItem) {
  emit('update:modelValue', item.tmdbid || item.doubanid)
  emit('select', item)
  emit('close')
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

// 搜索词条
async function searchMedias() {
  if (!keyword) return

  // 调用API搜索词条
  try {
    loading.value = true
    const result: MediaInfo[] = await api.get('media/search', {
      params: {
        title: keyword.value,
        page: 1,
        count: 20,
      },
    })

    // 清空
    items.value = []

    // 赋值
    for (const item of result) {
      if (props.type && props.type !== item.source) continue
      items.value.push({
        tmdbid: item.tmdb_id || 0,
        doubanid: item.douban_id || '',
        poster: getW500Image(item.poster_path),
        type: item.type,
        title: `${item.title}（${item.year}）`,
        overview: `<span class="text-primary">${item.type}</span> ${item.overview}`,
      })
    }
    loading.value = false
  } catch (e) {
    console.error(e)
  }
}

// 加载时聚焦搜索框
onMounted(() => {
  // 500ms后聚焦
  setTimeout(() => {
    inputKeyword.value?.focus()
  }, 500)
})
</script>

<template>
  <VCard class="mx-auto" width="100%">
    <VToolbar flat class="p-0">
      <VTextField
        ref="inputKeyword"
        v-model="keyword"
        label="输入名称搜索"
        single-line
        placeholder="电影或电视剧名称"
        variant="solo"
        prepend-inner-icon="mdi-magnify"
        flat
        class="mx-1"
        :loading="loading"
        @click:append-inner="searchMedias"
        @keydown.enter="searchMedias"
      />
    </VToolbar>
    <VDialogCloseBtn
      @click="
        () => {
          emit('close')
        }
      "
    />
    <VDivider />
    <VList v-if="items.length > 0" lines="three">
      <template v-for="(item, i) in items" :key="i">
        <VListItem @click="selectMedia(item)">
          <template #prepend>
            <VImg
              height="75"
              width="50"
              :src="item.poster"
              aspect-ratio="2/3"
              class="object-cover rounded ring-gray-500 me-3"
              cover
            >
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
            </VImg>
          </template>
          <VListItemTitle>
            {{ item.title }}
          </VListItemTitle>
          <VListItemSubtitle class="mt-2" v-html="item.overview" />
        </VListItem>
      </template>
    </VList>
  </VCard>
</template>
