<script lang="ts" setup>
import api from '@/api'
import { Subscribe } from '@/api/types'
import { formatDateDifference } from '@core/utils/formatters'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { mediaTypeDict } from '@/api/constants'

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
const progressText = ref('')

// 调用API查询列表
async function loadHistory({ done }: { done: any }) {
  // 如果正在加载中，直接返回
  if (loading.value) {
    done('ok')
    return
  }

  // 调用API查询列表
  try {
    // 设置加载中
    loading.value = true
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
  } catch (e) {
    console.error(e)
    // 返回加载失败
    done('error')
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
        <VInfiniteScroll mode="intersect" side="end" :items="historyList" class="h-100" @load="loadHistory">
          <template #loading>
            <LoadingBanner />
          </template>
          <template #empty />
          <VVirtualScroll v-if="historyList.length > 0" renderless :items="historyList" :item-height="104">
            <template #default="{ item, itemRef }">
              <div :ref="itemRef">
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
              </div>
            </template>
          </VVirtualScroll>
        </VInfiniteScroll>
      </VList>
      <VCardText v-if="historyList.length === 0 && isRefreshed" class="subscribe-history-empty">
        <VIcon class="subscribe-history-empty__icon" icon="mdi-sync" size="30" />

        <div class="subscribe-history-empty__headline">
          {{ t('dialog.subscribeHistory.noData') }}
        </div>

        <div class="subscribe-history-empty__description">
          {{ t('dialog.subscribeHistory.noDataHint') }}
        </div>
      </VCardText>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
<style scoped>
.subscribe-history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-block-size: 13rem;
  padding-block: 2.5rem !important;
  padding-inline: 1.5rem !important;
  text-align: center;
}

.subscribe-history-empty__icon {
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.subscribe-history-empty__headline {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1.15rem;
  font-weight: 600;
  line-height: 1.4;
}

.subscribe-history-empty__description {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.92rem;
  line-height: 1.65;
  max-inline-size: 25rem;
}
</style>
