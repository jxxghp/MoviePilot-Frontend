<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { TransferHistory } from '@/api/types'
import ReorganizeForm from '@/components/form/ReorganizeForm.vue'

// 提示框
const $toast = useToast()

// 重新整理对话框
const redoDialog = ref(false)

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// 重新整理IDS
const redoIds = ref<number[]>([])

// 重新整理target
const redoTarget = ref('')

// 已选中的数据
const selected = ref<TransferHistory[]>([])

// 表头
const headers = [
  {
    title: '标题',
    key: 'title',
    sortable: false,
  },
  {
    title: '目录',
    key: 'src',
    sortable: false,
  },
  {
    title: '转移方式',
    key: 'mode',
    sortable: false,
  },
  {
    title: '时间',
    key: 'date',
    sortable: false,
  },
  {
    title: '状态',
    key: 'status',
    sortable: false,
  },
  {
    title: '',
    key: 'actions',
    sortable: false,
  },
]

// 数据列表
const dataList = ref<TransferHistory[]>([])

// 搜索
const search = ref()

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// 加载状态
const loading = ref(false)

// 总条数
const totalItems = ref(0)

// 每页条数
const itemsPerPage = ref(50)

// 当前页码
const currentPage = ref(1)

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

// 获取订阅列表数据
async function fetchData({ page, itemsPerPage }: { page: number; itemsPerPage: number }) {
  loading.value = true
  try {
    currentPage.value = page

    const result: { [key: string]: any } = await api.get('history/transfer', {
      params: {
        page,
        count: itemsPerPage,
        title: search.value,
      },
    })

    dataList.value = result.data.list
    totalItems.value = result.data.total
    searchHintList.value = ['失败', '成功', ...new Set(dataList.value.map(item => item.title || ''))].filter(
      title => title !== '',
    )
  }
  catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 根据 type 返回不同的图标
function getIcon(type: string) {
  if (type === '电影')
    return 'mdi-movie'
  else if (type === '电视剧')
    return 'mdi-television-classic'
  else
    return 'mdi-help-circle'
}

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: '复制',
  move: '移动',
  link: '硬链接',
  softlink: '软链接',
  rclone_copy: 'Rclone复制',
  rclone_move: 'Rclone移动',
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

    if (!result.success)
      $toast.error(`删除失败: ${result.msg}`)
  }
  catch (error) {
    console.error(error)
  }
}

// 删除单条记录
async function removeSingle(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  deleteConfirmDialog.value = false
  if (!currentHistory.value)
    return

  // 删除
  await remove(currentHistory.value, deleteSrc, deleteDest)
  // 刷新
  fetchData({
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
  })
}

// 批量删除记录
async function removeBatch(deleteSrc: boolean, deleteDest: boolean) {
  // 关闭弹窗
  deleteConfirmDialog.value = false
  // 总条数
  const total = selected.value.length
  if (total === 0)
    return

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
  fetchData({
    page: currentPage.value,
    itemsPerPage: itemsPerPage.value,
  })
}

// 响应删除操作
async function deleteConfirmHandler(deleteSrc: boolean, deleteDest: boolean) {
  if (currentHistory.value)
    await removeSingle(deleteSrc, deleteDest)
  else
    await removeBatch(deleteSrc, deleteDest)
}

// 批量删除历史记录
async function removeHistoryBatch() {
  if (selected.value.length === 0)
    return

  // 清空当前操作记录
  currentHistory.value = undefined
  confirmTitle.value = `确认删除 ${selected.value.length} 条记录 ?`
  // 打开确认弹窗
  deleteConfirmDialog.value = true
}

// 计算根路径
function getRootPath(path: string, type: string, category: string) {
  if (!path)
    return ''

  let index = -2
  if (type !== '电影')
    index = -3

  if (category)
    index -= 1

  if (path.includes('/'))
    return path.split('/').slice(0, index).join('/')
  else
    return path.split('\\').slice(0, index).join('\\')
}

// 批量重新整理
async function retransferBatch() {
  if (selected.value.length === 0)
    return

  // 清空当前操作记录
  currentHistory.value = undefined
  // 重新整理IDS
  redoIds.value = selected.value.map(item => item.id)
  // 重新整理target
  if (selected.value.length === 1) {
    // 目的目录
    const dest = selected.value[0].dest ?? ''
    // 类型
    const mediaType = selected.value[0].type ?? ''
    // 分类
    const category = selected.value[0].category ?? ''
    // 计算根路径
    redoTarget.value = getRootPath(dest, mediaType, category)
  }
  else {
    redoTarget.value = ''
  }
  // 打开识别弹窗
  redoDialog.value = true
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
        redoTarget.value = getRootPath(item.dest ?? '', item.type ?? '', item.category ?? '')
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
</script>

<template>
  <VCard class="pb-5">
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol cols="4" md="6">
            历史记录
          </VCol>
          <VCol cols="8" md="6">
            <VCombobox
              key="search_navbar"
              v-model="search"
              :items="searchHintList"
              class="text-disabled"
              density="compact"
              label="搜索标题、状态"
              append-inner-icon="mdi-magnify"
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
    <VDataTableServer
      v-model="selected"
      v-model:items-per-page="itemsPerPage"
      :headers="headers"
      :items="dataList"
      :items-length="totalItems"
      :search="search"
      :loading="loading"
      density="compact"
      item-value="id"
      return-object
      fixed-header
      show-select
      items-per-page-text="每页条数"
      page-text="{0}-{1} 共 {2} 条"
      @update:options="fetchData"
    >
      <template #item.title="{ item }">
        <div class="d-flex align-center">
          <VAvatar>
            <VIcon :icon="getIcon(item.value.type || '')" />
          </VAvatar>
          <div class="d-flex flex-column ms-1">
            <span class="d-block whitespace-nowrap text-high-emphasis">
              {{ item.value.title }} {{ item.value.seasons }}{{ item.value.episodes }}
            </span>
            <small>{{ item.value.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <small>{{ item.value.src }} <br>=> {{ item.value.dest }}</small>
      </template>
      <template #item.mode="{ item }">
        <VChip variant="outlined" color="primary" size="small">
          {{ TransferDict[item.value.mode] }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip v-if="item.value.status" color="success" size="small">
          成功
        </VChip>
        <v-tooltip v-else :text="item.value.errmsg">
          <template #activator="{ props }">
            <VChip v-bind="props" color="error" size="small">
              失败
            </VChip>
          </template>
        </v-tooltip>
      </template>
      <template #item.date="{ item }">
        <small>{{ item.value.date }}</small>
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
                @click="menu.props.click(item.value)"
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
      <template #no-data>
        没有数据
      </template>
    </VDataTableServer>
  </VCard>
  <!-- 底部操作按钮 -->
  <span v-if="selected.length > 0" class="fixed right-5 bottom-5">
    <VBtn icon="mdi-redo-variant" class="me-2" color="primary" size="x-large" @click="retransferBatch" />
    <VBtn icon="mdi-trash-can-outline" color="error" size="x-large" @click="removeHistoryBatch" />
  </span>
  <!-- 底部弹窗 -->
  <VBottomSheet v-model="deleteConfirmDialog" inset>
    <VCard class="text-center rounded-t">
      <DialogCloseBtn @click="deleteConfirmDialog = false" />
      <VCardTitle class="pe-10">
        {{ confirmTitle }}
      </VCardTitle>
      <div class="d-flex flex-column flex-lg-row justify-center my-3">
        <VBtn color="primary" class="mb-2 mx-2" @click="deleteConfirmHandler(false, false)">
          仅删除历史记录
        </VBtn>
        <VBtn color="warning" class="mb-2 mx-2" @click="deleteConfirmHandler(true, false)">
          删除历史记录和源文件
        </VBtn>
        <VBtn color="info" class="mb-2 mx-2" @click="deleteConfirmHandler(false, true)">
          删除历史记录和媒体库文件
        </VBtn>
        <VBtn color="error" class="mb-2 mx-2" @click="deleteConfirmHandler(true, true)">
          删除历史记录、源文件和媒体库文件
        </VBtn>
      </div>
    </VCard>
  </VBottomSheet>
  <!-- 文件整理弹窗 -->
  <ReorganizeForm
    v-model="redoDialog"
    :logids="redoIds"
    :target="redoTarget"
    @done="
      () => {
        redoDialog = false
        // 清空当前操作记录
        currentHistory = undefined
        selected = []
        // 刷新
        fetchData({
          page: currentPage,
          itemsPerPage,
        })
      }
    "
    @close="redoDialog = false"
  />
</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}
</style>
