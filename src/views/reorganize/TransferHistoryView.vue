<script setup lang="ts">
import { debounce } from 'lodash-es'
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { StorageConf, TransferHistory } from '@/api/types'
import ReorganizeDialog from '@/components/dialog/ReorganizeDialog.vue'
import TransferQueueDialog from '@/components/dialog/TransferQueueDialog.vue'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useRoute } from 'vue-router'
import router from '@/router'
import { useDisplay } from 'vuetify'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useAvailableHeight } from '@/composables/useAvailableHeight'

// i18n
const { t } = useI18n()

// APP
const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()

// 计算列表可用高度
// componentOffset = VCardItem搜索栏(68) + VDivider(1) + 分页栏(40) + VCard边距(2) = 111
const { availableHeight } = useAvailableHeight(125, 300)

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()

// 组合式输入法状态
const isComposing = ref(false)

// 重新整理对话框
const redoDialog = ref(false)

// 整理队列对话框
const transferQueueDialog = ref(false)

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// 重新整理IDS
const redoIds = ref<number[]>([])
const redoTargetStorage = ref<string>()

// 已选中的数据
const selected = ref<TransferHistory[]>([])

const getNum = (s?: string) => (s ? parseInt(s.replace(/[^0-9]/g, ''), 10) || 0 : 0)

function sortByTitle(a: TransferHistory, b: TransferHistory) {
  if (a.type !== b.type) {
    return (a.type ?? '').localeCompare(b.type ?? '')
  }
  if (a.title !== b.title) {
    return (a.title ?? '').toLocaleLowerCase().localeCompare((b.title ?? '').toLocaleLowerCase())
  }
  if (a.type === '电视剧') {
    if (a.seasons !== b.seasons) {
      return getNum(a.seasons) - getNum(b.seasons)
    }
    if (a.episodes !== b.episodes) {
      return getNum(a.episodes) - getNum(b.episodes)
    }
  }
  return 0
}

function sortBySourceSize(a: TransferHistory, b: TransferHistory) {
  return (a.src_fileitem?.size ?? 0) - (b.src_fileitem?.size ?? 0)
}

// 表头
const headers = [
  {
    title: t('transferHistory.titleColumn'),
    key: 'title',
    sortable: true,
    sortRaw: sortByTitle,
  },
  {
    title: t('transferHistory.pathColumn'),
    key: 'src',
    sortable: true,
  },
  {
    title: t('transferHistory.modeColumn'),
    key: 'mode',
    sortable: true,
  },
  {
    title: t('transferHistory.sizeColumn'),
    key: 'size',
    sortable: true,
    sortRaw: sortBySourceSize,
  },
  {
    title: t('transferHistory.dateColumn'),
    key: 'date',
    sortable: true,
  },
  {
    title: t('transferHistory.statusColumn'),
    key: 'status',
    sortable: true,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

// 分组表头
const groupHeaders = [
  {
    title: t('transferHistory.seasonEpisode'),
    key: 'title',
    sortable: true,
    sortRaw: sortByTitle,
  },
  {
    title: t('transferHistory.pathColumn'),
    key: 'src',
    sortable: true,
  },
  {
    title: t('transferHistory.modeColumn'),
    key: 'mode',
    sortable: true,
  },
  {
    title: t('transferHistory.sizeColumn'),
    key: 'size',
    sortable: true,
    sortRaw: sortBySourceSize,
  },
  {
    title: t('transferHistory.dateColumn'),
    key: 'date',
    sortable: true,
  },
  {
    title: t('transferHistory.statusColumn'),
    key: 'status',
    sortable: true,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

const pageRange = [
  { title: '25', value: 25 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
  { title: '500', value: 500 },
  { title: '1000', value: 1000 },
  { title: 'All', value: -1 },
]

// 数据列表
const dataList = ref<TransferHistory[]>([])

// 搜索
const search = ref(route.query.search as string)

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// 加载状态
const loading = ref(false)

// 总条数
const totalItems = ref(0)

// 是否要分组
const group = ref<boolean>(route.query.grouped === 'true')

// 分组条件
const groupBy = ref<any>([
  {
    key: 'title',
  },
])

// 每页条数
const itemsPerPage = ref<number>(ensureNumber(route.query.itemsPerPage, 50))

// 当前页码
const currentPage = ref<number>(ensureNumber(route.query.currentPage, 1))

// 进度条
const progressDialog = ref(false)

// 进度文本
const progressText = ref(t('transferHistory.progress.pleaseWait'))

// 进度值
const progressValue = ref(0)

// 是否已刷新
const isRefreshed = ref(false)

// 删除确认对话框
const deleteConfirmDialog = ref(false)

// 确认框标题
const confirmTitle = ref('')

// 所有存储
const storages = ref<StorageConf[]>([])

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 存储字典
const storageDict = computed(() => {
  return storages.value.reduce(
    (dict, item) => {
      dict[item.type] = item.name
      return dict
    },
    {} as Record<string, string>,
  )
})

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: t('transferHistory.transferMode.copy'),
  move: t('transferHistory.transferMode.move'),
  link: t('transferHistory.transferMode.link'),
  softlink: t('transferHistory.transferMode.softlink'),
  rclone_copy: t('transferHistory.transferMode.rclone_copy'),
  rclone_move: t('transferHistory.transferMode.rclone_move'),
}

// 分页提示
const pageTip = computed(() => {
  const begin = itemsPerPage.value * (currentPage.value - 1) + 1
  const end = itemsPerPage.value * currentPage.value === -1 ? 'ALL' : itemsPerPage.value * currentPage.value
  return {
    begin,
    end,
  }
})

// 分页总数
const totalPage = computed(() => {
  const total = Math.ceil(totalItems.value / itemsPerPage.value)
  return total
})

// 切换页签
watch(
  [() => currentPage.value, () => itemsPerPage.value],
  debounce(async () => {
    reloadPage()
  }, 1000),
)

// 搜索监听
watch(
  [() => search.value, () => isComposing.value],
  debounce(async () => {
    if (!isComposing.value) {
      console.log('search: ' + search.value)
      reloadPage(true)
    }
  }, 1000),
)

// 获取订阅列表数据
async function fetchData(page = currentPage.value, count = itemsPerPage.value) {
  loading.value = true

  try {
    const result: { [key: string]: any } = await api.get('history/transfer', {
      params: {
        page,
        count,
        title: search.value,
      },
    })
    isRefreshed.value = true
    dataList.value = result.data?.list
    totalItems.value = result.data?.total
    searchHintList.value = ['失败', '成功', ...new Set(dataList.value.map(item => item.title || ''))].filter(
      title => title !== '',
    )
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 根据 type 返回不同的图标
function getIcon(type: string) {
  if (type === '电影') return 'mdi-movie'
  else if (type === '电视剧') return 'mdi-television-classic'
  else return 'mdi-help-circle'
}

// 删除历史记录
async function removeHistory(item: TransferHistory) {
  currentHistory.value = item
  confirmTitle.value = t('transferHistory.deleteConfirm', {
    title: item.title,
    seasons: item.seasons || '',
    episodes: item.episodes || '',
  })
  deleteConfirmDialog.value = true
}

// 调用API删除记录
async function remove(item: TransferHistory, deleteSrc: boolean, deleteDest: boolean) {
  try {
    // 调用删除API
    const result: {
      [key: string]: any
    } = await api.delete(`history/transfer?deletesrc=${deleteSrc}&deletedest=${deleteDest}`, {
      data: item,
    })

    if (!result.success) $toast.error(`删除失败: ${result.message}`)
  } catch (error) {
    console.error(error)
  }
}

// 删除单条记录
async function removeSingle(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  deleteConfirmDialog.value = false
  if (!currentHistory.value) return

  // 删除
  await remove(currentHistory.value, deleteSrc, deleteDest)
  // 刷新
  fetchData()
}

// 批量删除记录
async function removeBatch(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  deleteConfirmDialog.value = false
  // 总条数
  const total = selected.value.length
  if (total === 0) return

  // 已处理条数
  let handled = 0
  // 显示进度条
  progressDialog.value = true
  // 循环调用removeHistory
  for (const item of selected.value) {
    // 开始删除
    progressText.value = `正在删除 ${item.title} ${item.seasons}${item.episodes} ...`
    await remove(item, deleteSrc, deleteDest)
    // 删除完成
    handled++
    progressValue.value = (handled / total) * 100
  }
  // 清空选中项
  selected.value = []
  // 隐藏进度条
  progressDialog.value = false
  // 重新获取数据
  fetchData()
}

// 响应删除操作
async function deleteConfirmHandler(deleteSrc: boolean, deleteDest: boolean) {
  if (currentHistory.value) await removeSingle(deleteSrc, deleteDest)
  else await removeBatch(deleteSrc, deleteDest)
}

// 批量删除历史记录
async function removeHistoryBatch() {
  if (selected.value.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  confirmTitle.value = t('transferHistory.deleteConfirmBatch', {
    count: selected.value.length,
  })
  // 打开确认弹窗
  deleteConfirmDialog.value = true
}

// 批量重新整理
async function retransferBatch() {
  if (selected.value.length === 0) return

  // 清空当前操作记录
  currentHistory.value = undefined
  // 重新整理IDS
  redoIds.value = selected.value.map(item => item.id)
  // 打开识别弹窗
  redoDialog.value = true
}

// 整理完成
function transferDone() {
  redoDialog.value = false
  // 清空当前操作记录
  currentHistory.value = undefined
  selected.value = []
  // 刷新
  fetchData()
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: t('transferHistory.actions.redo'),
    value: 1,
    props: {
      prependIcon: 'mdi-redo-variant',
      click: (item: TransferHistory) => {
        redoIds.value = [item.id]
        redoTargetStorage.value = item.dest_storage
        redoDialog.value = true
      },
    },
  },
  {
    title: t('transferHistory.actions.delete'),
    value: 2,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: (item: TransferHistory) => {
        removeHistory(item)
      },
    },
  },
])

// 添加url参数
function addUrlQuery(url: string, name: string, value: any) {
  if (!url || !name || !value) return url
  const separator = url.includes('?') ? '&' : '?'
  return url + separator + name + '=' + encodeURIComponent(value)
}

// 重载页面
function reloadPage(resetPage = false) {
  let url = '/history'
  if (search.value) {
    url = addUrlQuery(url, 'search', search.value)
  }
  if (itemsPerPage.value) {
    url = addUrlQuery(url, 'itemsPerPage', itemsPerPage.value)
  }
  if (currentPage.value) {
    url = addUrlQuery(url, 'currentPage', resetPage ? 1 : currentPage.value)
  }
  if (group.value) {
    url = addUrlQuery(url, 'grouped', 'true')
  }
  router.push(url)
}

// 确保值为number类型
function ensureNumber(value: any, defaultValue: number = 0) {
  value = Number(value)
  // 如果不是数字
  if (Number.isNaN(value)) {
    value = defaultValue
  }
  return value
}

// 按标题分组后的选中数量统计，键为标题，值为对应分组的选中数
const selectedCountsGroupedByTitle = computed(() => {
  return selected.value.reduce(
    (acc, item) => {
      const title = item.title || ''
      acc[title] = (acc[title] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
})

// 控制分组内所有子项的选中状态
const toggleGroupSelection = (checked: boolean | null, items: readonly any[]) => {
  const values = items.map(item => item.value)
  if (checked) {
    selected.value = [...new Set([...selected.value, ...values])]
  } else {
    const itemsSet = new Set(values)
    selected.value = selected.value.filter(item => !itemsSet.has(item))
  }
}

// 初始加载数据
onMounted(() => {
  loadStorages()
  fetchData()
})
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol cols="8" md="6" class="flex">
            <VCombobox
              key="search_navbar"
              v-model="search"
              :items="searchHintList"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              class="text-disabled"
              density="compact"
              :label="t('transferHistory.searchPlaceholder')"
              prepend-inner-icon="mdi-magnify"
              variant="solo-filled"
              max-width="25rem"
              single-line
              hide-details
              flat
              rounded="pill"
              clearable
            />
          </VCol>
          <VCol cols="4" md="6" class="text-end">
            <VBtnGroup variant="outlined" divided rounded>
              <VBtn icon="mdi-timer-sand-paused" @click="transferQueueDialog = true" />
              <VBtn :icon="group ? 'mdi-format-list-bulleted' : 'mdi-format-list-group'" @click="group = !group" />
            </VBtnGroup>
          </VCol>
        </VRow>
      </VCardTitle>
    </VCardItem>
    <!-- 分组模式 -->
    <VDataTableVirtual
      v-if="group"
      v-model="selected"
      :groupBy="groupBy"
      :headers="groupHeaders"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      fixed-header
      show-select
      :loading-text="t('transferHistory.loading')"
      hover
      :style="{ height: `${availableHeight}px` }"
    >
      <template #header.data-table-group>
        <span>{{ t('transferHistory.titleColumn') }}</span>
      </template>
      <template v-slot:group-header="{ item, columns, toggleGroup, isGroupOpen }">
        <tr>
          <td :colspan="columns.length">
            <div class="d-flex align-center gap-2">
              <VBtn
                :icon="isGroupOpen(item) ? '$expand' : '$next'"
                size="small"
                variant="text"
                @click="toggleGroup(item)"
              />
              <VCheckbox
                :model-value="selectedCountsGroupedByTitle[item.value] == item.items.length"
                :indeterminate="selectedCountsGroupedByTitle[item.value] < item.items.length"
                @update:modelValue="checked => toggleGroupSelection(checked, item.items)"
              />
              {{ item.value }}
            </div>
          </td>
        </tr>
      </template>
      <template #item.title="{ item }">
        <div class="d-flex align-center">
          <VAvatar>
            <VIcon :icon="getIcon(item.type || '')" />
          </VAvatar>
          <div class="d-flex flex-column ms-1">
            <span v-if="item.type === '电视剧'" class="d-block text-high-emphasis min-w-20">
              {{ item?.seasons }}{{ item?.episodes }}
            </span>
            <small>{{ item?.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <div>
          <span>
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.src_storage || ''] }}</VChip>
            <small>{{ item?.src }}</small>
          </span>
          <span class="text-high-emphasis text-bold"> => </span>
          <br />
          <span v-if="item?.dest">
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.dest_storage || ''] }}</VChip>
            <small>{{ item?.dest }}</small>
          </span>
        </div>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item?.status" color="success" size="small"> {{ t('transferHistory.status.success') }} </VChip>
        <VTooltip v-else :text="item?.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small"> {{ t('transferHistory.status.failed') }} </VChip>
          </template>
        </VTooltip>
      </template>
      <template #item.size="{ item }">
        <small>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</small>
      </template>
      <template #item.date="{ item }">
        <small>{{ item?.date }}</small>
      </template>
      <template #item.actions="{ item }">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem
                v-for="(menu, i) in dropdownItems"
                :key="i"
                :base-color="menu.props.color"
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
      </template>
      <template #no-data> {{ t('transferHistory.noData') }} </template>
    </VDataTableVirtual>
    <!-- 列表模式 -->
    <VDataTableVirtual
      v-else
      v-model="selected"
      :headers="headers"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      fixed-header
      show-select
      :loading-text="t('transferHistory.loading')"
      hover
      :style="{ height: `${availableHeight}px` }"
    >
      <template #item.title="{ item }">
        <div class="d-flex align-center">
          <VAvatar>
            <VIcon :icon="getIcon(item.type || '')" />
          </VAvatar>
          <div class="d-flex flex-column ms-1">
            <span v-if="item.type === '电视剧'" class="d-block text-high-emphasis min-w-20">
              {{ item?.title }} {{ item?.seasons }}{{ item?.episodes }}
            </span>
            <span v-else class="d-block text-high-emphasis min-w-20">
              {{ item?.title }}
            </span>
            <small>{{ item?.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <div>
          <span>
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.src_storage || ''] }}</VChip>
            <small>{{ item?.src }}</small>
          </span>
          <span class="text-high-emphasis text-bold"> => </span>
          <br />
          <span v-if="item?.dest">
            <VChip variant="tonal" size="small" label class="my-1"> {{ storageDict[item?.dest_storage || ''] }}</VChip>
            <small>{{ item?.dest }}</small>
          </span>
        </div>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item?.mode ?? ''] || t('common.unknown') }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item?.status" color="success" size="small"> {{ t('transferHistory.status.success') }} </VChip>
        <VTooltip v-else :text="item?.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small"> {{ t('transferHistory.status.failed') }} </VChip>
          </template>
        </VTooltip>
      </template>
      <template #item.size="{ item }">
        <small>{{ formatFileSize(item?.src_fileitem?.size || 0) }}</small>
      </template>
      <template #item.date="{ item }">
        <small>{{ item?.date }}</small>
      </template>
      <template #item.actions="{ item }">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem
                v-for="(menu, i) in dropdownItems"
                :key="i"
                :base-color="menu.props.color"
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
      </template>
      <template #no-data> {{ t('transferHistory.noData') }} </template>
    </VDataTableVirtual>
    <VDivider />
    <div class="flex items-center justify-between">
      <div class="w-auto">
        <VSelect v-model="itemsPerPage" :items="pageRange" density="compact" flat class="ms-1" />
      </div>
      <div class="w-auto text-sm">{{ t('transferHistory.pageInfo', pageTip) }} {{ totalItems }}</div>
      <VPagination
        v-model="currentPage"
        show-first-last-page
        :length="totalPage"
        :total-visible="display.mdAndUp.value ? 7 : 0"
        @next="currentPage + 1"
        @prev="currentPage - 1"
      >
      </VPagination>
    </div>
  </VCard>

  <!-- 底部操作按钮 -->
  <Teleport to="body" v-if="route.path === '/history'">
    <div v-if="isRefreshed && selected.length > 0">
      <VFab
        icon="mdi-trash-can-outline"
        color="error"
        location="bottom"
        size="x-large"
        fixed
        app
        appear
        @click="removeHistoryBatch"
        :class="appMode ? 'mb-28' : 'mb-16'"
      />
      <VFab
        :class="appMode ? 'mb-44' : 'mb-32'"
        icon="mdi-redo-variant"
        location="bottom"
        size="x-large"
        fixed
        app
        appear
        @click="retransferBatch"
      />
    </div>
  </Teleport>
  <!-- 底部弹窗 -->
  <VBottomSheet v-model="deleteConfirmDialog" inset>
    <VCard class="text-center">
      <VDialogCloseBtn @click="deleteConfirmDialog = false" />
      <VCardTitle class="pe-10">
        {{ confirmTitle }}
      </VCardTitle>
      <div class="d-flex flex-column flex-lg-row justify-center my-3">
        <VBtn color="primary" class="mb-2 mx-2" @click="deleteConfirmHandler(false, false)">
          {{ t('transferHistory.deleteRecordOnly') }}
        </VBtn>
        <VBtn color="warning" class="mb-2 mx-2" @click="deleteConfirmHandler(true, false)">
          {{ t('transferHistory.deleteSourceOnly') }}
        </VBtn>
        <VBtn color="info" class="mb-2 mx-2" @click="deleteConfirmHandler(false, true)">
          {{ t('transferHistory.deleteDestOnly') }}
        </VBtn>
        <VBtn color="error" class="mb-2 mx-2" @click="deleteConfirmHandler(true, true)">
          {{ t('transferHistory.deleteAll') }}
        </VBtn>
      </div>
    </VCard>
  </VBottomSheet>
  <!-- 进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
  <!-- 文件整理弹窗 -->
  <ReorganizeDialog
    v-if="redoDialog"
    v-model="redoDialog"
    :logids="redoIds"
    :target_storage="redoTargetStorage"
    @done="transferDone"
    @close="redoDialog = false"
  />
  <!-- 整理队列进度弹窗 -->
  <TransferQueueDialog v-if="transferQueueDialog" v-model="transferQueueDialog" @close="transferQueueDialog = false" />
</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}

.v-table__wrapper {
  border-radius: 0;
}
</style>
