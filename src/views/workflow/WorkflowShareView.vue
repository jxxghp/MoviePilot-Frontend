<script lang="ts" setup>
import api from '@/api'
import type { WorkflowShare } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 定义输入参数
const props = defineProps({
  // 过滤关键字
  keyword: String,
})

// 定义事件
const emit = defineEmits(['update'])

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
const currentKey = ref(0)

// 关键字切换后，旧请求不得再提交分页数据或加载状态。
let requestGeneration = 0

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 当前列表请求是否失败；合法空数组仍使用空数据状态。
const loadError = ref(false)

// 数据列表
const dataList = ref<WorkflowShare[]>([])
const currData = ref<WorkflowShare[]>([])

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

watch(
  () => props.keyword,
  newKeyword => {
    requestGeneration++
    keyword.value = newKeyword || ''
    page.value = 1
    dataList.value = []
    loading.value = false
    isRefreshed.value = false
    loadError.value = false
    currentKey.value++
  },
)

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
  const generation = requestGeneration
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
        const pageData: WorkflowShare[] = await api.get(apipath, {
          params: getParams(),
        })
        if (generation !== requestGeneration) {
          done('ok')
          return
        }
        loadError.value = false
        currData.value = pageData
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
        await nextTick()
      }
    } else {
      // 设置加载中
      loading.value = true
      // 请求API
      const pageData: WorkflowShare[] = await api.get(apipath, {
        params: getParams(),
      })
      if (generation !== requestGeneration) {
        done('ok')
        return
      }
      loadError.value = false
      currData.value = pageData
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
    if (generation !== requestGeneration) {
      done('ok')
      return
    }
    console.error(error)
    isRefreshed.value = true
    loadError.value = true
    // 返回加载失败
    done('error')
  } finally {
    if (generation === requestGeneration) {
      loading.value = false
    }
  }
}

// 将数据从列表中移除
function removeData(id: string) {
  dataList.value = dataList.value.filter(item => item.id !== id)
}

onMounted(() => {
  loadEventTypes()
})
</script>

<template>
  <VPageContentTitle v-if="keyword" :title="`${t('common.search')}：${keyword}`" />
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    class="overflow-visible px-2"
    @load="fetchData"
    :key="currentKey"
  >
    <template #loading />
    <template #empty />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
        <span class="text-medium-emphasis">{{ t('common.apiRequestFailed') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :get-item-key="item => item.id"
      :min-item-width="288"
      :estimated-item-height="220"
      tabindex="0"
    >
      <template #default="{ item }">
        <WorkflowShareCard
          :workflow="item"
          :event-types="eventTypes"
          @delete="removeData(item.id || '')"
          @update="emit('update')"
        />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed && !loadError"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="keyword ? t('common.noContent') : t('workflow.noShareData')"
    />
  </VInfiniteScroll>
</template>
