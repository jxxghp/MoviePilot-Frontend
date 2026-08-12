<script lang="ts" setup>
import api from '@/api'
import type { Person } from '@/api/types'
import PersonCard from '@/components/cards/PersonCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 输入参数
const props = defineProps({
  apipath: String,
  params: Object as PropType<{ [key: string]: any }>,
  type: String,
})

// 判断是否有滚动条
function hasScroll() {
  return document.body.scrollHeight - (window.innerHeight || document.documentElement.clientHeight) > 2
}

// 当前页码
const page = ref(1)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 首次成功响应前，请求失败只展示错误和重试入口。
const loadFailed = ref(false)

// 使用 shallowRef 避免长列表中的深层代理开销
const dataList = shallowRef<Person[]>([])

function appendData(items: Person[]) {
  dataList.value = dataList.value.concat(items)
}

async function loadPageData() {
  const params = getParams()
  return api.get(props.apipath!, {
    params,
    ...(Array.isArray(params.media_source) ? { paramsSerializer: { indexes: null } } : {}),
  }) as Promise<Person[]>
}

// 拼装参数
function getParams(): Record<string, unknown> {
  let params: Record<string, unknown> = {
    page: page.value,
  }
  if (props.params) params = { ...params, ...props.params }

  return params
}

// 获取列表数据
async function fetchData({ done }: { done: any }) {
  try {
    if (!props.apipath) return
    loadFailed.value = false

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
        const currentData = await loadPageData()
        // 标计为已请求完成
        isRefreshed.value = true
        if (currentData.length === 0) {
          // 如果没有数据，跳出
          done('empty')
          return
        } else {
          // 合并数据
          appendData(currentData)
          // 页码+1
          page.value++
          // 返回加载成功
          done('ok')
          await nextTick()
        }
      }
    } else {
      // 加载一次
      // 设置加载中
      loading.value = true
      // 请求API
      const currentData = await loadPageData()
      // 标计为已请求完成
      isRefreshed.value = true
      if (currentData.length === 0) {
        // 如果没有数据，跳出
        done('empty')
      } else {
        // 合并数据
        appendData(currentData)
        // 页码+1
        page.value++
        // 返回加载成功
        done('ok')
      }
    }
  } catch (error) {
    console.error(error)
    loadFailed.value = true
    // 返回加载失败
    done('error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <LoadingBanner v-if="!isRefreshed && !loadFailed" class="mt-12" />
  <VInfiniteScroll
    mode="intersect"
    side="end"
    :items="dataList"
    :margin="dataList.length > 0 ? 600 : 0"
    class="overflow-visible px-3"
    @load="fetchData"
  >
    <template #loading />
    <template #empty />
    <template #error="{ props: retryProps }">
      <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
        <span class="text-body-2 text-medium-emphasis">{{ t('error.networkError') }}</span>
        <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
          {{ t('common.retry') }}
        </VBtn>
      </div>
    </template>
    <ProgressiveCardGrid
      v-if="dataList.length > 0"
      :items="dataList"
      :item-aspect-ratio="1.5"
      :get-item-key="item => item.id"
      tabindex="0"
    >
      <template #default="{ item }">
        <PersonCard :person="item" />
      </template>
    </ProgressiveCardGrid>
    <NoDataFound
      v-if="dataList.length === 0 && isRefreshed"
      error-code="404"
      :error-title="t('common.noData')"
      :error-description="t('error.networkError')"
    />
  </VInfiniteScroll>
</template>
