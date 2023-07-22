<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import { numberValidator, requiredValidator } from '@/@validators'
import api from '@/api'
import type { TransferHistory } from '@/api/types'

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 重新整理对话框
const redoDialog = ref(false)

// TMDB编号
const redoTmdbId = ref('')

// 当前操作记录
const currentHistory = ref<TransferHistory>()

// 表头
const headers = [
  { title: '标题', key: 'title', sortable: false },
  { title: '目录', key: 'src', sortable: false },
  { title: '转移方式', key: 'mode', sortable: false },
  { title: '时间', key: 'date', sortable: false },
  { title: '状态', key: 'status', sortable: false },
  { title: '失败原因', key: 'errmsg', sortable: false },
  { title: '', key: 'actions', sortable: false },
]

// 数据列表
const dataList = ref<TransferHistory[]>([])

// 搜索
const search = ref('')

// 加载状态
const loading = ref(false)

// 总条数
const totalItems = ref(0)

// 每页条数
const itemsPerPage = ref(25)

// 当前页码
const currentPage = ref(1)

// 获取订阅列表数据
async function fetchData({
  page,
  itemsPerPage,
}: {
  page: number
  itemsPerPage: number
}) {
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

// 计算颜色
function getStatusColor(status: boolean) {
  return status ? 'success' : 'error'
}

// 转移方式字典
const TransferDict: { [key: string]: string } = {
  copy: '复制',
  move: '移动',
  link: '硬链接',
  softlink: '软链接',
}

// 删除历史记录
async function removeHistory(item: TransferHistory) {
  try {
    const isConfirmed = await createConfirm({
      title: '确认',
      content: `同步删除 ${item.title} 对应的媒体库文件 ?`,
      confirmationText: '同步删除文件',
      cancellationText: '仅删除历史记录',
      dialogProps: {
        maxWidth: 600,
      },
    })

    let deleteFile = false
    if (isConfirmed)
      deleteFile = true

    // 调用删除API
    const result: { [key: string]: any } = await api.delete('history/transfer', {
      data: {
        ...item,
        delete_file: deleteFile,
      },
    })

    if (result.success) {
      fetchData({
        page: currentPage.value,
        itemsPerPage: itemsPerPage.value,
      })
    }
    else {
      $toast.error(`删除失败: ${result.msg}`)
    }
  }
  catch (error) {
    console.error(error)
  }
}

// 重新整理
async function rehandleHistory() {
  try {
    if (!redoTmdbId.value)
      return

    redoDialog.value = false
    $toast.info(`正在重新整理 ${currentHistory.value?.title} ...`)

    // 调用API接口重新转移
    const requestData = {
      ...currentHistory.value,
    }

    const result: { [key: string]: any } = await api.post(
      'history/transfer',
      requestData,
      {
        params: {
          new_tmdbid: parseInt(redoTmdbId.value),
        },
      },
    )

    if (result.success) {
      fetchData({
        page: currentPage.value,
        itemsPerPage: itemsPerPage.value,
      })
    }
    else {
      $toast.error(`重新整理失败: ${result.message}！`)
    }
  }
  catch (e) {
    console.log(e)
  }
}

// 弹出菜单
const dropdownItems = ref([
  {
    title: '重新整理',
    value: 1,
    props: {
      prependIcon: 'mdi-redo-variant',
      click: (item: TransferHistory) => {
        redoDialog.value = true
        currentHistory.value = item
      },
    },
  },
  {
    title: '删除',
    value: 2,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: removeHistory,
    },
  },
])
</script>

<template>
  <VCard class="pb-5">
    <VCardItem>
      <VCardTitle>
        <VRow>
          <VCol> 历史记录 </VCol>
          <VCol>
            <VTextField
              key="search_navbar"
              v-model="search"
              class="text-disabled"
              density="compact"
              label="搜索"
              append-inner-icon="mdi-magnify"
              variant="solo-filled"
              single-line
              hide-details
              flat
              rounded
            />
          </VCol>
        </VRow>
      </VCardTitle>
    </VCardItem>
    <VDataTableServer
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
      items-per-page-text="每页条数"
      page-text="{0}-{1} 共 {2} 条"
      @update:options="fetchData"
    >
      <template #item.title="{ item }">
        <div class="d-flex">
          <VAvatar><VIcon :icon="getIcon(item.raw.type || '')" /></VAvatar>
          <div class="d-flex flex-column ms-1">
            <span class="d-block whitespace-nowrap text-high-emphasis">
              {{ item.raw.title }} {{ item.raw.seasons }}{{ item.raw.episodes }}
            </span>
            <small>{{ item.raw.category }}</small>
          </div>
        </div>
      </template>
      <template #item.src="{ item }">
        <small>{{ item.raw.src }} <br>=> {{ item.raw.dest }}</small>
      </template>
      <template #item.mode="{ item }">
        <VChip
          variant="outlined"
          color="primary"
          size="small"
        >
          {{
            TransferDict[item.raw.mode]
          }}
        </VChip>
      </template>
      <template #item.status="{ item }">
        <VChip
          :color="getStatusColor(item.raw.status)"
          size="small"
        >
          {{ item.raw.status ? "成功" : "失败" }}
        </VChip>
      </template>
      <template #item.date="{ item }">
        <small>{{ item.raw.date }}</small>
      </template>
      <template #item.errmsg="{ item }">
        <small class="text-error">{{ item.raw.errmsg }}</small>
      </template>
      <template #item.actions="{ item }">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu
            activator="parent"
            close-on-content-click
          >
            <VList>
              <VListItem
                v-for="(menu, i) in dropdownItems"
                :key="i"
                variant="plain"
                :base-color="menu.props.color"
                @click="menu.props.click(item.raw)"
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
  <VDialog
    v-model="redoDialog"
    max-width="600"
  >
    <!-- Dialog Content -->
    <VCard title="重新整理">
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="redoTmdbId"
              label="请输入TMDB编号"
              :rules="[requiredValidator, numberValidator]"
            />
          </VCol>
        </VRow>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn
          @click="rehandleHistory"
          @keydown.enter="rehandleHistory"
        >
          确定
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
.v-table th {
  white-space: nowrap;
}
</style>
