<script lang="ts" setup>
import api from '@/api'
import { Subscribe } from '@/api/types'
import { formatDateDifference } from '@core/utils/formatters'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  type: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'save'])

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

// 进度框
const progressDialog = ref(false)

// 进度文字
const progressText = ref('正在重新订阅...')

// 调用API查询列表
async function loadHistory({ done }: { done: any }) {
  console.log('🚀 ~ loadHistory ~ loadHistory:', loadHistory)
  // 如果正在加载中，直接返回
  if (loading.value) {
    done('ok')
    return
  }

  // 调用API查询列表
  try {
    // 设置加载中
    loading.value = true
    const url = `subscribe/history/${props.type}`
    const params = {
      params: {
        page: currentPage.value,
        count: pageSize.value,
      },
    }
    console.log('history url:', url)
    console.log('history params:', params)
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
      done('empty')
    } else {
      // 合并数据
      historyList.value = [...historyList.value, ...currData.value]
      // 页码+1
      currentPage.value++
      // 返回加载成功
      done('ok')
    }
    // 取消加载中
    loading.value = false
  } catch (e) {
    console.error(e)
    // 返回加载失败
    done('error')
  }
}

// 重新订阅
async function reSubscribe(item: Subscribe) {
  if (item.type === '电影') progressText.value = `正在重新订阅 ${item.name} ...`
  else progressText.value = `正在重新订阅 ${item.name} 第 ${item.season} 季 ...`
  progressDialog.value = true
  try {
    const result: { [key: string]: any } = await api.post('subscribe', item)
    if (result.success) {
      emit('save')
    }
  } catch (e) {
    console.error(e)
  }
  progressDialog.value = false
}

// 删除记录
async function deleteHistory(item: Subscribe) {
  try {
    const result: { [key: string]: any } = await api.delete(`subscribe/history/${item.id}`)
    if (result.success) {
      historyList.value = historyList.value.filter(i => i.id !== item.id)
    }
  } catch (e) {
    console.error(e)
  }
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
  },
])
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mx-auto" width="100%">
      <VCardItem>
        <VCardTitle>{{ props.type + '订阅历史' }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <DialogCloseBtn
        @click="
          () => {
            emit('close')
          }
        "
      />
      <!-- <VList lines="two" v-if="historyList.length > 0"> -->
      <VList lines="two">
        <VInfiniteScroll mode="intersect" side="end" :items="historyList" class="overflow-hidden" @load="loadHistory">
          <template #loading>
            <LoadingBanner />
          </template>
          <template #empty />
          <template v-if="historyList.length > 0">
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
                      <VIcon icon="mdi-dots-vertical" />
                      <VMenu activator="parent" close-on-content-click>
                        <VList>
                          <VListItem
                            v-for="(menu, i) in dropdownItems"
                            :key="i"
                            variant="plain"
                            :base-color="menu.color"
                            @click="menu.props.click(item)"
                          >
                            <template #prepend>
                              <VIcon :icon="menu.props.prependIcon" />
                            </template>
                            <VListItemTitle v-text="menu.title" />
                          </VListItem>
                        </VList>
                      </VMenu>
                    </IconBtn>
                  </div>
                </template>
              </VListItem>
            </template>
          </template>
        </VInfiniteScroll>
      </VList>
      <VCardText v-if="historyList.length === 0" class="text-center"> 没有已完成的订阅 </VCardText>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
