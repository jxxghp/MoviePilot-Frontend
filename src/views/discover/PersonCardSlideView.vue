<script lang="ts" setup>
import TmdbPersonCard from '@/components/cards/TmdbPersonCard.vue'
import api from '@/api'
import SlideView from '@/components/slide/SlideView.vue'
import DoubanPersonCard from '@/components/cards/DoubanPersonCard.vue'
import BangumiPersonCard from '@/components/cards/BangumiPersonCard.vue'

// 输入参数
const props = defineProps({
  apipath: String,
  linkurl: String,
  title: String,
  type: String,
})

// 组件加载完成
const componentLoaded = ref(false)

// 数据列表
const dataList = ref<any>([])

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
    v-bind="props"
  >
    <template #content>
      <template
        v-for="data in dataList"
        :key="data.id"
      >
        <TmdbPersonCard
          v-if="props.type === 'tmdb'"
          :person="data"
          height="15rem"
          width="10rem"
        />
        <DoubanPersonCard
          v-if="props.type === 'douban'"
          :person="data"
          height="15rem"
          width="10rem"
        />
        <BangumiPersonCard
          v-if="props.type === 'bangumi'"
          :person="data"
          height="15rem"
          width="10rem"
        />
      </template>
    </template>
  </SlideView>
</template>
