<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MediaCard from '@/components/cards/MediaCard.vue'
import SlideView from '@/components/slide/SlideView.vue'

// 输入参数
const props = defineProps({
  apipath: String,
  linkurl: String,
  title: String,
})

provide('rankingPropsKey', reactive({...props}))

// 组件加载完成
const componentLoaded = ref(false)

// 数据列表
const dataList = ref<MediaInfo[]>([])

// 获取订阅列表数据
async function fetchData() {
  try {
    if (!props.apipath)
      return

    dataList.value = await api.get(props.apipath)
    if (dataList.value.length > 0)
      componentLoaded.value = true
  }
  catch (error) {
    console.error(error)
  }
}

// 加载时获取数据
onMounted(fetchData)
</script>

<template>
  <SlideView
    v-if="componentLoaded"
  >
    <template #content>
      <template
        v-for="data in dataList"
        :key="data.tmdb_id || data.douban_id || data.bangumi_id"
      >
        <MediaCard
          :media="data"
          height="15rem"
          width="10rem"
        />
      </template>
    </template>
  </SlideView>
</template>
