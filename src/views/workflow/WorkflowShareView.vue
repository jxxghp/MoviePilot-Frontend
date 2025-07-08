<script lang="ts" setup>
import api from '@/api'
import type { WorkflowShare } from '@/api/types'
import NoDataFound from '@/components/NoDataFound.vue'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  // 过滤关键字
  keyword: String,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// API
const apipath = 'workflow/shares'

// 当前页码
const page = ref(1)

// 搜索关键字
const keyword = ref(props.keyword)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 数据列表
const dataList = ref<WorkflowShare[]>([])
const currData = ref<WorkflowShare[]>([])

// 拼装参数
function getParams() {
  let params = {
    page: page.value,
    count: 30,
    name: keyword.value,
  }
  return params
}

// 获取列表数据
async function fetchData({ done }: { done: any }) {
  try {
    // 如果正在加载中，直接返回
    if (loading.value) {
      done('ok')
      return
    }

    // 加载到满屏或者加载出错
    if (!hasScroll()) {
      // 加载多次
      while (!hasScroll()) {
        // 设置加载中
        loading.value = true
        // 请求API
        currData.value = await api.get(apipath, {
          params: getParams(),
        })
        // 取消加载中
        loading.value = false
        // 标计为已请求完成
        isRefreshed.value = true
        if (currData.value.length === 0) {
          // 如果没有数据，跳出
          done('empty')
          return
        }
        // 合并数据
        dataList.value = [...dataList.value, ...currData.value]
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    } else {
      // 设置加载中
      loading.value = true
      // 请求API
      currData.value = await api.get(apipath, {
        params: getParams(),
      })
      loading.value = false
      // 标计为已请求完成
      isRefreshed.value = true
      if (currData.value.length === 0) {
        // 如果没有数据，跳出
        done('empty')
      } else {
        // 合并数据
        dataList.value = [...dataList.value, ...currData.value]
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    }
  } catch (error) {
    console.error(error)
    // 返回加载失败
    done('error')
  }
}

// 将数据从列表中移除
function removeData(id: number) {
  dataList.value = dataList.value.filter(item => item.id !== id)
}
</script>

<template>
  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll mode="intersect" side="end" :items="dataList" class="overflow-visible px-2" @load="fetchData">
    <template #loading />
    <template #empty />
    <div v-if="dataList.length > 0" class="grid gap-4 grid-workflow-share-card" tabindex="0">
      <div v-for="data in dataList" :key="data.id">
        <WorkflowShareCard :media="data" @delete="removeData(data.id || 0)" />
      </div>
    </div>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword ? t('common.noContent') : t('workflow.noShareData')"
    />
  </VInfiniteScroll>
</template>