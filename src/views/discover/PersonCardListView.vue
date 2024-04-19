<script lang="ts" setup>
import api from '@/api'
import DoubanPersonCard from '@/components/cards/DoubanPersonCard.vue'
import TmdbPersonCard from '@/components/cards/TmdbPersonCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
  type: String,
})

// 判断是否有滚动条
function hasScroll() {
  return (
    document.body.scrollHeight
      - (window.innerHeight || document.documentElement.clientHeight)
    > 2
  )
}

// 当前页码
const page = ref(1)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 数据列表
const dataList = ref<any>([])
const currData = ref<any>([])

// 获取列表数据
async function fetchData({ done }: { done: any }) {
  try {
    if (!props.apipath)
      return

    // 如果正在加载中，直接返回
    if (loading.value) {
      done('ok')

      return
    }

    // 设置加载中
    loading.value = true

    // 加载到满屏或者加载出错
    if (!hasScroll()) {
      // 加载多次
      while (!hasScroll()) {
        // 请求API
        currData.value = await api.get(props.apipath, {
          params: {
            page: page.value,
          },
        })

        // 标计为已请求完成
        isRefreshed.value = true
        if (currData.value.length === 0) {
          // 如果没有数据，跳出
          done('ok')

          return
        }

        // 合并数据
        dataList.value = [...dataList.value, ...currData.value]

        // 页码+1
        page.value++
      }
    }
    else {
      // 加载一次
      // 请求API
      currData.value = await api.get(props.apipath, {
        params: {
          page: page.value,
        },
      })

      // 标计为已请求完成
      isRefreshed.value = true
      if (currData.value.length === 0) {
        // 如果没有数据，跳出
        done('ok')

        return
      }

      // 合并数据
      dataList.value = [...dataList.value, ...currData.value]

      // 页码+1
      page.value++
    }

    // 取消加载中
    loading.value = false

    // 返回加载成功
    done('ok')
  }
  catch (error) {
    console.error(error)

    // 返回加载失败
    done('error')
  }
}
</script>

<template>
  <LoadingBanner
    v-if="!isRefreshed"
    class="mt-12"
  />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    class="overflow-hidden"
    @load="fetchData"
  >
    <template #loading />
    <div
      v-if="dataList.length > 0 && props.type === 'tmdb'"
      class="grid gap-4 grid-media-card mx-3"
      tabindex="0"
    >
      <TmdbPersonCard
        v-for="data in dataList"
        :key="data.id"
        :person="data"
      />
    </div>
    <div
      v-if="dataList.length > 0 && props.type === 'douban'"
      class="grid gap-4 grid-media-card mx-3"
      tabindex="0"
    >
      <DoubanPersonCard
        v-for="data in dataList"
        :key="data.id"
        :person="data"
      />
    </div>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      error-title="没有数据"
      error-description="无法获取到媒体信息。"
    />
  </VInfiniteScroll>
</template>

<style lang="scss">
.grid-media-card {
  grid-template-columns: repeat(auto-fill, minmax(9.375rem, 1fr));
}
</style>
