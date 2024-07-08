<script setup lang="ts">
import { debounce } from 'lodash'
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { TransferHistory } from '@/api/types'
import ReorganizeDialog from '@/components/dialog/ReorganizeDialog.vue'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useRoute } from 'vue-router'
import router from '@/router'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 提示框
const $toast = useToast()

// 路由
const route = useRoute()

// 重新整理对话框
const redoDialog = ref(false)

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// 重新整理IDS
const redoIds = ref<number[]>([])

// 已选中的数据
const selected = ref<TransferHistory[]>([])

// 表头
const headers = [
  {
    title: '标题',
    key: 'title',
    sortable: true,
  },
  {
    title: '目录',
    key: 'src',
    sortable: true,
  },
  {
    title: '转移方式',
    key: 'mode',
    sortable: true,
  },
  {
    title: '时间',
    key: 'date',
    sortable: true,
  },
  {
    title: '状态',
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

// 每页条数
const itemsPerPage = ref<number>(ensureNumber(route.query.itemsPerPage, 50))

// 当前页码
const currentPage = ref<number>(ensureNumber(route.query.currentPage, 1))

// 进度条
const progressDialog = ref(false)

// 进度文本
const progressText = ref('请稍候 ...')

// 进度值
const progressValue = ref(0)

// 删除确认对话框
const deleteConfirmDialog = ref(false)

// 确认框标题
const confirmTitle = ref('')

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: '复制',
  move: '移动',
  link: '硬链接',
  softlink: '软链接',
  rclone_copy: 'Rclone复制',
  rclone_move: 'Rclone移动',
}

const tableStyle = computed(() => {
  return appMode.value
    ? 'height: calc(100vh - 15.5rem - env(safe-area-inset-bottom) - 3.5rem)'
    : 'height: calc(100vh - 14.5rem - env(safe-area-inset-bottom)'
})

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

// 切换页签和搜索词
watch(
  [() => currentPage.value, () => itemsPerPage.value],
  debounce(async () => {
    reloadPage()
  }, 1000),
)

watch(
  [() => search.value],
  debounce(async () => {
    reloadPage(true)
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
  confirmTitle.value = `确认删除 ${item.title} ${item.seasons}${item.episodes} ?`
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

    if (!result.success) $toast.error(`删除失败: ${result.msg}`)
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
  confirmTitle.value = `确认删除 ${selected.value.length} 条记录 ?`
  // 打开确认弹窗
  deleteConfirmDialog.value = true
}

// 计算根路径
function getRootPath(path: string, type: string, category: string) {
  if (!path) return ''

  let index = -2
  if (type !== '电影') index = -3

  if (category) index -= 1

  if (path.includes('/')) return path.split('/').slice(0, index).join('/')
  else return path.split('\\').slice(0, index).join('\\')
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
    title: '重新整理',
    value: 1,
    props: {
      prependIcon: 'mdi-redo-variant',
      click: (item: TransferHistory) => {
        redoIds.value = [item.id]
        redoDialog.value = true
      },
    },
  },
  {
    title: '删除',
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

// 初始加载数据
onMounted(fetchData)
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol cols="4" md="6"> 历史记录 </VCol>
          <VCol cols="8" md="6" class="flex">
            <VCombobox
              key="search_navbar"
              v-model="search"
              :items="searchHintList"
              class="text-disabled"
              density="compact"
              label="搜索目录、状态"
              prepend-inner-icon="mdi-magnify"
              variant="solo-filled"
              single-line
              hide-details
              flat
              rounded
              clearable
            />
          </VCol>
        </VRow>
      </VCardTitle>
    </VCardItem>
    <VDataTableVirtual
      v-model="selected"
      :headers="headers"
      :items="dataList"
      :loading="loading"
      density="compact"
      return-object
      fixed-header
      show-select
      loading-text="加载中..."
      hover
      :style="tableStyle"
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
        <small>{{ item?.src }} <br />=> {{ item?.dest }}</small>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item?.mode || ''] }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item?.status" color="success" size="small"> 成功 </VChip>
        <VTooltip v-else :text="item?.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small"> 失败 </VChip>
          </template>
        </VTooltip>
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
                variant="plain"
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
      <template #no-data> 没有数据 </template>
    </VDataTableVirtual>
    <div class="flex items-center justify-end">
      <div class="w-auto">
        <VSelect v-model="itemsPerPage" :items="pageRange" density="compact" variant="solo" flat />
      </div>
      <div class="w-auto text-sm">{{ pageTip.begin }}-{{ pageTip.end }} / {{ totalItems }}</div>
      <VPagination
        v-model="currentPage"
        show-first-last-page
        :length="totalPage"
        @next="currentPage + 1"
        @prev="currentPage - 1"
      >
      </VPagination>
    </div>
  </VCard>

  <!-- 底部操作按钮 -->
  <span>
    <VFab
      v-if="selected.length > 0"
      icon="mdi-trash-can-outline"
      color="error"
      location="bottom"
      size="x-large"
      fixed
      app
      appear
      @click="removeHistoryBatch"
      :class="{ 'mb-12': appMode }"
    />
    <VFab
      v-if="selected.length > 0"
      :class="appMode ? 'mb-28' : 'mb-16'"
      icon="mdi-redo-variant"
      location="bottom"
      size="x-large"
      fixed
      app
      appear
      @click="retransferBatch"
    />
  </span>
  <!-- 底部弹窗 -->
  <VBottomSheet v-model="deleteConfirmDialog" inset>
    <VCard class="text-center rounded-t">
      <DialogCloseBtn @click="deleteConfirmDialog = false" />
      <VCardTitle class="pe-10">
        {{ confirmTitle }}
      </VCardTitle>
      <div class="d-flex flex-column flex-lg-row justify-center my-3">
        <VBtn color="primary" class="mb-2 mx-2" @click="deleteConfirmHandler(false, false)"> 仅删除历史记录 </VBtn>
        <VBtn color="warning" class="mb-2 mx-2" @click="deleteConfirmHandler(true, false)"> 删除历史记录和源文件 </VBtn>
        <VBtn color="info" class="mb-2 mx-2" @click="deleteConfirmHandler(false, true)">
          删除历史记录和媒体库文件
        </VBtn>
        <VBtn color="error" class="mb-2 mx-2" @click="deleteConfirmHandler(true, true)">
          删除历史记录、源文件和媒体库文件
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
    @done="transferDone"
    @close="redoDialog = false"
  />
</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}
</style>
