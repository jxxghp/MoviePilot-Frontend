<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'

// update:modelValue 事件
const emit = defineEmits(['update:modelValue', 'close'])

const items = ref<{}[]>([])

// 搜索词
const keyword = ref('')

// 加载中
const loading = ref(false)

// 选中条目
function selectMedia(item: MediaInfo) {
  console.log(item)
  emit('update:modelValue', item.tmdb_id)
  emit('close')
}

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url)
    return ''
  return url.replace('original', 'w500')
}

// 搜索词条
async function searchMedias() {
  if (!keyword)
    return

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
      if (items.value.length > 0)
        items.value.push({ type: 'divider', inset: true })
      items.value.push({
        prependAvatar: getW500Image(item.poster_path),
        title: `${item.title}（${item.year}）`,
        subtitle: `<span class="text-primary">${item.type}</span> ${item.overview}`,
        onClick: () => selectMedia(item),
      })
    }
    loading.value = false
  }
  catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <VCard
    class="mx-auto"
    width="100%"
  >
    <VToolbar flat dense>
      <VTextField
        v-model="keyword"
        density="compact"
        label="输入名称搜索"
        single-line
        hide-details
        flat
        class="mx-3"
        append-inner-icon="mdi-magnify"
        :loading="loading"
        @click:append-inner="searchMedias"
        @keydown.enter="searchMedias"
      />
    </VToolbar>

    <VList
      v-if="items.length > 0"
      :items="items"
      item-props
      lines="three"
    >
      <template #subtitle="{ subtitle }">
        <div v-html="subtitle" />
      </template>
    </VList>
  </VCard>
</template>
