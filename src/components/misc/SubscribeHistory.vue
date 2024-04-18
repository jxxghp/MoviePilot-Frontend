<script lang="ts" setup>
import api from '@/api';
import { Subscribe } from '@/api/types';
import { formatDateDifference } from '@core/utils/formatters'

// 输入参数
const props = defineProps({
  type: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 订阅历史列表
const historyList = ref<Subscribe[]>([])

// 当前加载数据
const currData = ref<Subscribe[]>([])

// 当前页
const currentPage = ref(1)

// 每页数量
const pageSize = ref(30)

// 是否加载中
const loading = ref(false)

// 是否加载完成
const isRefreshed = ref(false)

// 调用API查询列表
async function loadHistory({ done }: { done: any }) {
  // 如果正在加载中，直接返回
  if (loading.value) {
    done('ok')
    return
  }

  // 设置加载中
  loading.value = true

  // 调用API查询列表
  try {
    currData.value = await api.get(`subscribe/history/${props.type}`, {
      params: {
        page: currentPage.value,
        count: pageSize.value,
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
    historyList.value = [...historyList.value, ...currData.value]
    // 页码+1
    currentPage.value++
    // 取消加载中
    loading.value = false
    // 返回加载成功
    done('ok')
  } catch (e) {
    console.error(e)
    // 返回加载失败
    done('error')
  }
}

// 重新订阅
function reSubscribe(item: Subscribe) {

}

// 删除记录
function deleteHistory(item: Subscribe) {

}

// 弹出菜单
const dropdownItems = ref([
  {
    title: '重新订阅',
    value: 1,
    color: '',
    props: {
      prependIcon: 'mdi-redo',
      click: reSubscribe,
    },
  },
  {
    title: '删除',
    value: 2,
    color: 'error',
    props: {
      prependIcon: 'mdi-delete',
      click: deleteHistory,
    },
  }
])

</script>

<template>
  <VDialog
    scrollable
    max-width="50rem"
  >
  <VCard
      class="mx-auto"
      width="100%"
      :title = "props.type + '订阅历史'"
    >
      <DialogCloseBtn @click="() => { emit('close') }" />
      <div
        v-if="!isRefreshed"
        class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
      >
        <VProgressCircular
          size="48"
          indeterminate
          color="primary"
        />
      </div>
      <VList
        lines="two"
      >
        <VInfiniteScroll
          v-if="historyList.length > 0"
          mode="intersect"
          side="end"
          :items="historyList"
          class="overflow-hidden"
          @load="loadHistory"
        >
          <template #loading />
            <template v-for="(item, i) in historyList" :key="i">
              <VListItem>
                <template #prepend>
                  <VImg
                    height="75"
                    width="50"
                    :src="item.poster"
                    aspect-ratio="2/3"
                    class="object-cover rounded shadow ring-gray-500 me-3"
                    cover
                  >
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                      </div>
                    </template>
                  </VImg>
                </template>
                <VListItemTitle v-if="item.type == '电视剧'">
                  {{ item.name }} <span class="text-sm">第 {{ item.season }} 季</span>
                </VListItemTitle>
                <VListItemTitle v-else>
                  {{ item.name }}
                </VListItemTitle>
                <VListItemSubtitle class="mt-2">{{ formatDateDifference(item.date) }}</VListItemSubtitle>
                <VListItemSubtitle class="mt-2">{{ item.description }}</VListItemSubtitle>
                <template #append>
                  <div class="me-n3">
                    <IconBtn>
                      <VIcon
                        icon="mdi-dots-vertical"
                      />
                      <VMenu
                        activator="parent"
                        close-on-content-click
                      >
                        <VList>
                          <VListItem
                            v-for="(item, i) in dropdownItems"
                            :key="i"
                            variant="plain"
                            :base-color="item.color"
                            @click="item.props.click"
                          >
                            <template #prepend>
                              <VIcon :icon="item.props.prependIcon" />
                            </template>
                            <VListItemTitle v-text="item.title" />
                          </VListItem>
                        </VList>
                      </VMenu>
                    </IconBtn>
                  </div>
                </template>
              </VListItem>
            </template>
          </VInfiniteScroll>
        </VList>
      <VCardText v-if="historyList.length == 0 && isRefreshed" class="text-center">
        没有数据
      </VCardText>
    </VCard>
  </VDialog>
</template>
