<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo, Subscribe } from '@/api/types'

import MediaCard from '@/components/cards/MediaCard.vue'
import SlideView from '@/components/slide/SlideView.vue'

// 输入参数
const props = defineProps({
  apipath: String,
  linkurl: String,
  title: String,
})

provide('rankingPropsKey', reactive({ ...props }))

// 组件加载完成
const componentLoaded = ref(false)

// 数据列表，包含媒体和订阅状态
const dataList = ref<{ media: MediaInfo; isSubscribed: boolean }[]>([])

// 获取数据
async function fetchData() {
  try {
    if (!props.apipath) return
    // 获取媒体数据
    const medias: MediaInfo[] = await api.get(props.apipath)
    // 组装媒体ID参数列表
    const mediaIds = medias.map(media => ({
      mediaid: media.tmdb_id
        ? `tmdb:${media.tmdb_id}`
        : media.douban_id
        ? `douban:${media.douban_id}`
        : media.bangumi_id
        ? `bangumi:${media.bangumi_id}`
        : '',
      season: media.season || 0,
      title: media.title || '',
    }))
    // 请求订阅数据
    const subscribes: Subscribe[] = await api.post('subscribe/media', mediaIds)
    // 合并媒体和订阅状态
    dataList.value = medias.map((media, index) => ({
      media,
      isSubscribed: Boolean(subscribes[index]?.id),
    }))
    if (dataList.value.length > 0) componentLoaded.value = true
  } catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onMounted(fetchData)
</script>

<template>
  <SlideView v-if="componentLoaded">
    <template #content>
      <template v-for="data in dataList" :key="data.media.tmdb_id || data.media.douban_id || data.media.bangumi_id">
        <!-- 传递 media 和 isSubscribed 数据 -->
        <MediaCard :media="data.media" :isSubscribed="data.isSubscribed" height="15rem" width="10rem" />
      </template>
    </template>
  </SlideView>
</template>
