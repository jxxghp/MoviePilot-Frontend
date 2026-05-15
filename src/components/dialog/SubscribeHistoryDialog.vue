<script lang="ts" setup>
import api from '@/api'
import { Subscribe } from '@/api/types'
import { formatDateDifference } from '@core/utils/formatters'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { mediaTypeDict } from '@/api/constants'
import VirtualList from '@/components/virtual/VirtualList.vue'

// 国际化
const { t } = useI18n()

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

// 当前页
const currentPage = ref(1)

// 每页数量
const pageSize = ref(30)

// 是否加载中
const loading = ref(false)

// 是否还有更多数据
const hasMore = ref(true)

// 是否加载完成
const isRefreshed = ref(false)

// 进度框
const progressDialog = ref(false)

// 进度文字
const progressText = ref('')

// VirtualList ref（泛型组件无法用 InstanceType 表达，用 any）
const listRef = ref<any>(null)

// 调用API查询列表（VirtualList @load-more 触发）
async function loadHistory() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const data: Subscribe[] = await api.get(`subscribe/history/${props.type}`, {
      params: {
        page: currentPage.value,
        count: pageSize.value,
      },
    })
    isRefreshed.value = true
    if (!data || data.length === 0) {
      hasMore.value = false
    } else {
      historyList.value.push(...data)
      currentPage.value++
      // 如果服务端返回不足一页，认为没有更多
      if (data.length < pageSize.value) hasMore.value = false
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// 重新订阅
async function reSubscribe(item: Subscribe) {
  if (item.type === '电影') {
    progressText.value = t('dialog.subscribeHistory.resubscribeMovie', { name: item.name })
  } else {
    progressText.value = t('dialog.subscribeHistory.resubscribeTv', { name: item.name, season: item.season })
  }
  progressDialog.value = true
  try {
    const result: { [key: string]: any } = await api.post('subscribe/', item)
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
    title: t('dialog.subscribeHistory.resubscribe'),
    value: 1,
    color: '',
    props: {
      prependIcon: 'mdi-redo',
      click: reSubscribe,
    },
  },
  {
    title: t('common.delete'),
    value: 2,
    color: 'error',
    props: {
      prependIcon: 'mdi-delete',
      click: deleteHistory,
    },
  },
])

// 获取媒体类型文本
function getMediaTypeText(type: string | undefined) {
  if (!type) return ''
  return mediaTypeDict[type]
}

// 初始加载
onMounted(() => {
  void loadHistory()
})
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="mx-auto" width="100%">
      <VCardItem>
        <VCardTitle>{{ t('dialog.subscribeHistory.title', { type: getMediaTypeText(props.type) }) }}</VCardTitle>
      </VCardItem>
      <VDivider />
      <VDialogCloseBtn @click="emit('close')" />
      <VList lines="two" class="flex-grow-1 min-h-0 py-0">
        <VirtualList
          ref="listRef"
          :items="historyList"
          :estimate-size="104"
          :overscan="6"
          key-field="id"
          container-height="60vh"
          :load-more-threshold="5"
          @load-more="loadHistory"
        >
          <template #item="{ item }">
            <VListItem>
              <template #prepend>
                <VImg
                  height="75"
                  width="50"
                  :src="item.poster"
                  aspect-ratio="2/3"
                  class="object-cover rounded ring-gray-500 me-3"
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
                {{ item.name }}
                <span class="text-sm">{{ t('dialog.subscribeHistory.season', { season: item.season }) }}</span>
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
          <template #loading>
            <LoadingBanner v-if="loading" />
          </template>
        </VirtualList>
      </VList>
      <VCardText v-if="historyList.length === 0 && isRefreshed" class="text-center">{{
        t('dialog.subscribeHistory.noData')
      }}</VCardText>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
