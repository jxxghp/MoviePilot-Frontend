<script lang="ts" setup>
import type { Axios, AxiosRequestConfig } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import { useToast } from 'vue-toast-notification'
import ReorganizeDialog from '../dialog/ReorganizeDialog.vue'
import { formatBytes } from '@core/utils/formatters'
import type { Context, EndPoints, FileItem } from '@/api/types'
import store from '@/store'
import api from '@/api'
import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

// 输入参数
const inProps = defineProps({
  icons: Object,
  storage: String,
  endpoints: Object as PropType<EndPoints>,
  axios: {
    type: Object as PropType<Axios>,
    required: true,
  },
  refreshpending: Boolean,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  sort: String,
})

// 对外事件
const emit = defineEmits(['loading', 'pathchanged', 'refreshed', 'filedeleted', 'renamed'])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 是否选择模式
const selectMode = ref(false)

// 是否正在加载
const loading = ref(true)

// 重命名loading
const renameLoading = ref(false)

// 识别进度条
const progressDialog = ref(false)

// 识别进度文本
const progressText = ref('请稍候 ...')

// 识别进度
const progressValue = ref(0)

// 内容列表
const items = ref<FileItem[]>([])

// 过滤条件
const filter = ref('')

// 重命名弹窗
const renamePopper = ref(false)

// 整理弹窗
const transferPopper = ref(false)

// 新名称
const newName = ref('')

// 处理目录内所有文件
const renameAll = ref(false)

// 当前操作项
const currentItem = ref<FileItem>()

// 选中的项目
const selected = ref<FileItem[]>([])

// 识别结果
const nameTestResult = ref<Context>()

// 识别结果对话框
const nameTestDialog = ref(false)

// 弹出菜单
const dropdownItems = ref<{ [key: string]: any }[]>([])

// 加载进度SSE
const progressEventSource = ref<EventSource>()

// 目录过滤
const dirs = computed(() => items.value.filter(item => item.type === 'dir' && item.name.includes(filter.value)))

// 文件过滤
const files = computed(() => items.value.filter(item => item.type === 'file' && item.name.includes(filter.value)))
// 是否目录
const isDir = computed(() => inProps.item.path?.endsWith('/'))

// 是否文件
const isFile = computed(() => !isDir.value)

// 需要整理的path
const transferPaths = ref<string[]>([])

// 大小控制
const scrollStyle = computed(() => {
  return appMode
    ? 'height: calc(100vh - 15.5rem - env(safe-area-inset-bottom) - 3.5rem)'
    : 'height: calc(100vh - 14.5rem - env(safe-area-inset-bottom)'
})

// 是否为图片文件
const isImage = computed(() => {
  const ext = inProps.item.path?.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext ?? '')
})

// 调整选择模式
function changeSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value = []
}

// 调API加载文件夹内的内容
async function list_files() {
  loading.value = true
  emit('loading', true)

  // 参数
  const url = inProps.endpoints?.list.url
    .replace(/{storage}/g, inProps.storage)
    .replace(/{sort}/g, inProps.sort || 'name')

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.list.method || 'get',
    data: inProps.item,
  }

  // 加载数据
  items.value = (await inProps.axios.request(config)) ?? []
  emit('loading', false)
  loading.value = false
}

// 删除项目
async function deleteItem(item: FileItem) {
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除${item.type === 'dir' ? '目录' : '文件'} ${item.name}？`,
  })

  if (confirmed) {
    emit('loading', true)

    const url = inProps.endpoints?.delete.url.replace(/{storage}/g, inProps.storage)
    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.delete.method || 'post',
      data: item,
    }

    await inProps.axios.request(config)
    emit('filedeleted')
    emit('loading', false)
    // 重新加载
    list_files()
  }
}

// 批量删除
async function batchDelete() {
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除选中的 ${selected.value.length} 个项目？`,
  })

  if (confirmed) {
    emit('loading', true)

    // 显示进度条
    progressDialog.value = true
    progressValue.value = 0

    // 删除选中的项目
    selected.value.every(async item => {
      progressText.value = `正在删除 ${item.name} ...`
      const url = inProps.endpoints?.delete.url.replace(/{storage}/g, inProps.storage)
      const config: AxiosRequestConfig<FileItem> = {
        url,
        method: inProps.endpoints?.delete.method || 'post',
        data: item,
      }
      await inProps.axios.request(config)
    })

    // 关闭进度条
    progressDialog.value = false

    emit('filedeleted')
    emit('loading', false)
    // 重新加载
    list_files()
  }
}

// 切换路径
function changePath(item: FileItem) {
  item.path = inProps.item.path + item.name + (item.type === 'dir' ? '/' : '')
  emit('pathchanged', item)
}

// 点击列表项
function listItemClick(item: FileItem) {
  if (selectMode.value) {
    if (selected.value.includes(item)) {
      selected.value = selected.value.filter(i => i !== item)
    } else {
      selected.value.push(item)
    }
    return false
  }
  changePath(item)
}

// 新窗口中下载文件
async function download(item: FileItem) {
  const url = inProps.endpoints?.download.url.replace(/{storage}/g, inProps.storage)
  const filterEntries = Object.entries(item).filter(([key, value]) => !['children', 'thumbnail'].includes(key) && value)
  const queryParams = filterEntries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
  window.open(
    `${import.meta.env.VITE_API_BASE_URL}${url.slice(1)}?${queryParams}&token=${store.state.auth.token}`,
    '_blank',
  )
}

// 获取图片地址
function getImgLink(item: FileItem) {
  let url = inProps.endpoints?.image.url.replace(/{storage}/g, inProps.storage)
  const filterEntries = Object.entries(item).filter(([key, value]) => !['children', 'thumbnail'].includes(key) && value)
  const queryParams = filterEntries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
  return `${import.meta.env.VITE_API_BASE_URL}${url.slice(1)}?${queryParams}&token=${store.state.auth.token}`
}

// 显示重命名弹窗
function showRenmae(item: FileItem) {
  currentItem.value = item
  newName.value = item.name
  renameAll.value = false
  renamePopper.value = true
}

// 调用API获取新名称
async function get_recommend_name() {
  renameLoading.value = true
  try {
    const result: { [key: string]: any } = await api.get('transfer/name', {
      params: {
        path: `${inProps.item.path}${currentItem.value?.name}`,
        filetype: currentItem.value?.type ?? 'file',
      },
    })
    if (result.success && result.data) {
      newName.value = result.data.name
    } else {
      $toast.error(result.message)
    }
  } catch (error) {
    console.error(error)
  }
  renameLoading.value = false
}

// 重命名
async function rename() {
  emit('loading', true)

  // 关闭弹窗
  renamePopper.value = false

  // 显示进度条
  progressDialog.value = true
  progressValue.value = 0
  if (renameAll.value) {
    progressText.value = `正在重命名 ${currentItem.value?.path} 及目录内所有文件 ...`
  } else {
    progressText.value = `正在重命名 ${currentItem.value?.name} ...`
  }
  if (renameAll.value) {
    startLoadingProgress()
  }

  // 调API
  let url = inProps.endpoints?.rename.url
    .replace(/{storage}/g, inProps.storage)
    .replace(/{newname}/g, encodeURIComponent(newName.value))
  if (renameAll.value) {
    url += '&recursive=true'
  }

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.rename.method || 'post',
    data: currentItem.value,
  }
  const result: { [key: string]: any } = await inProps.axios?.request(config)
  if (!result.success) {
    $toast.error(result.message)
  }

  // 关闭进度条
  if (renameAll.value) {
    stopLoadingProgress()
  }
  progressDialog.value = false

  // 通知重新加载
  newName.value = ''
  renameAll.value = false
  emit('loading', false)
  emit('renamed')
}

// 显示整理对话框
function showTransfer(item: FileItem) {
  transferPaths.value = [item.path || '']
  transferPopper.value = true
}

// 显示批量整理对话框
function showBatchTransfer() {
  transferPaths.value = selected.value.map(item => item.path || '')
  transferPopper.value = true
}

// 整理完成
function transferDone() {
  transferPopper.value = false
  list_files()
}

// 将文件修改时间（timestape）转换为本地时间
function formatTime(timestape: number) {
  return new Date(timestape * 1000).toLocaleString()
}

// 监听refreshPending变化
watch(
  () => inProps.refreshpending,
  async () => {
    if (inProps.refreshpending) {
      await list_files()
      emit('refreshed')
    }
  },
)

// 监听item变化或者storage变化
watch(
  [() => inProps.item, () => inProps.storage],
  async () => {
    // 清空列表
    items.value = []
    // 关闭弹窗
    nameTestResult.value = undefined
    nameTestDialog.value = false
    // 重置菜单
    dropdownItems.value = [
      {
        title: '识别',
        value: 1,
        show: true,
        props: {
          prependIcon: 'mdi-text-recognition',
          click: (_item: FileItem) => {
            recognize(_item.path || '')
          },
        },
      },
      {
        title: '刮削',
        value: 2,
        show: true,
        props: {
          prependIcon: 'mdi-auto-fix',
          click: (_item: FileItem) => {
            scrape(_item.path || '')
          },
        },
      },
      {
        title: '重命名',
        value: 3,
        show: true,
        props: {
          prependIcon: 'mdi-rename',
          click: showRenmae,
        },
      },
      {
        title: '整理',
        value: 4,
        show: true,
        props: {
          prependIcon: 'mdi-folder-arrow-right',
          click: showTransfer,
        },
      },
      {
        title: '删除',
        value: 5,
        show: true,
        props: {
          prependIcon: 'mdi-delete-outline',
          color: 'error',
          click: deleteItem,
        },
      },
    ]
    await list_files()
  },
  { immediate: true },
)

// 调用API识别
async function recognize(path: string) {
  try {
    // 显示进度条
    progressDialog.value = true
    progressText.value = `正在识别 ${path} ...`
    progressValue.value = 0
    nameTestResult.value = await api.get('media/recognize_file', {
      params: {
        path,
      },
    })
    // 关闭进度条
    progressDialog.value = false
    if (!nameTestResult.value) $toast.error(`${path} 识别失败！`)
    nameTestDialog.value = !!nameTestResult.value?.meta_info?.name
  } catch (error) {
    console.error(error)
  }
}

// 调用API刮削
async function scrape(path: string, confirm: boolean = true) {
  try {
    if (confirm) {
      // 确认
      const confirmed = await createConfirm({
        title: '确认',
        content: `是否确认刮削 ${path}？`,
      })
      if (!confirmed) return
    }

    // 显示进度条
    progressDialog.value = true
    progressText.value = `正在刮削 ${path} ...`
    const result: { [key: string]: any } = await api.get('media/scrape', {
      params: {
        path,
        storage: inProps.storage,
      },
    })
    // 关闭进度条
    progressDialog.value = false
    if (!result.success) $toast.error(result.message)
    else $toast.success(`${path} 削刮完成！`)
  } catch (error) {
    console.error(error)
  }
}

// 批量刮削
async function batchScrape() {
  // 确认
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认刮削选中的 ${selected.value.length} 项？`,
  })
  if (!confirmed) return

  selected.value.map(item => {
    scrape(item.path || '', false)
  })
}

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = '请稍候 ...'

  const token = store.state.auth.token

  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/batchrename?token=${token}`,
  )
  progressEventSource.value.onmessage = event => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressEventSource.value?.close()
}

onMounted(() => {
  list_files()
})
</script>

<template>
  <VCard class="d-flex flex-column">
    <VToolbar v-if="!loading" density="compact" flat color="gray">
      <VTextField
        v-if="!isFile"
        v-model="filter"
        hide-details
        flat
        density="compact"
        variant="solo-filled"
        placeholder="搜索 ..."
        prepend-inner-icon="mdi-filter-outline"
        class="me-2"
        rounded="0"
      />
      <VSpacer v-if="isFile" />
      <IconBtn v-if="!isFile" @click="changeSelectMode">
        <VIcon color="primary" v-if="selectMode"> mdi-selection-remove </VIcon>
        <VIcon color="primary" v-else>mdi-select</VIcon>
      </IconBtn>
      <IconBtn v-if="isFile" @click="recognize(inProps.item.path || '')">
        <VIcon color="primary"> mdi-text-recognition </VIcon>
      </IconBtn>
      <IconBtn v-if="isFile && items.length > 0" @click="download(items[0])">
        <VIcon color="primary"> mdi-download </VIcon>
      </IconBtn>
      <IconBtn v-if="!isFile" @click="list_files">
        <VIcon color="primary"> mdi-refresh </VIcon>
      </IconBtn>
      <!-- 批量操作按钮 -->
      <span v-if="selected.length > 0">
        <IconBtn @click.stop="batchScrape">
          <VIcon color="primary" icon="mdi-auto-fix" />
        </IconBtn>
        <IconBtn @click.stop="showBatchTransfer">
          <VIcon color="primary" icon="mdi-folder-arrow-right" />
        </IconBtn>
        <IconBtn @click.stop="batchDelete">
          <VIcon icon="mdi-delete-outline" color="error" />
        </IconBtn>
      </span>
    </VToolbar>
    <VCardText v-if="loading" class="text-center flex flex-col items-center">
      <VProgressCircular size="48" indeterminate color="primary" />
    </VCardText>
    <!-- 文件详情 -->
    <VCardText v-else-if="isFile && !isImage && items.length > 0" class="text-center break-all">
      <div v-if="items[0]?.thumbnail" class="flex justify-center">
        <VImg max-width="15rem" cover :src="items[0]?.thumbnail" class="rounded border shadow-lg">
          <template #placeholder>
            <VSkeletonLoader class="object-cover w-full h-full" />
          </template>
        </VImg>
      </div>
      <div class="text-xl text-high-emphasis mt-3">{{ items[0]?.name }}</div>
      <p class="mt-2" v-if="items[0]?.size && items[0].modify_time">
        大小：{{ formatBytes(items[0]?.size || 0) }}<br />
        修改时间：{{ formatTime(items[0]?.modify_time || 0) }}
      </p>
    </VCardText>
    <!-- 图片 -->
    <VCardText v-else-if="isFile && isImage && items.length > 0" class="grow d-flex justify-center align-center">
      <VImg :src="getImgLink(items[0])" max-width="100%" max-height="100%" />
    </VCardText>
    <!-- 目录和文件列表 -->
    <VCardText v-else-if="dirs.length || files.length" class="p-0">
      <VList subheader>
        <VVirtualScroll :items="[...dirs, ...files]" :style="scrollStyle">
          <template #default="{ item }">
            <VHover>
              <template #default="hover">
                <VListItem v-bind="hover.props" class="px-3 pe-1" @click="listItemClick(item)">
                  <template #prepend>
                    <VListItemAction v-if="selectMode">
                      <VCheckbox v-model="selected" :value="item" />
                    </VListItemAction>
                    <template v-else>
                      <VIcon
                        v-if="inProps.icons && item.extension"
                        :icon="inProps.icons[item.extension.toLowerCase()] || inProps.icons?.other"
                      />
                      <VIcon v-else icon="mdi-folder-outline" />
                    </template>
                  </template>
                  <VListItemTitle v-text="item.name" />
                  <VListItemSubtitle v-if="item.size">
                    {{ formatBytes(item.size) }}
                  </VListItemSubtitle>
                  <template #append>
                    <IconBtn v-if="display.smAndDown.value && !selectMode">
                      <VIcon icon="mdi-dots-vertical" />
                      <VMenu activator="parent" close-on-content-click>
                        <VList>
                          <template v-for="(menu, i) in dropdownItems" :key="i">
                            <VListItem
                              v-if="menu.show"
                              variant="plain"
                              :base-color="menu.props.color"
                              @click="menu.props.click(item)"
                            >
                              <template #prepend>
                                <VIcon :icon="menu.props.prependIcon" />
                              </template>
                              <VListItemTitle v-text="menu.title" />
                            </VListItem>
                          </template>
                        </VList>
                      </VMenu>
                    </IconBtn>
                    <span v-if="hover.isHovering && display.mdAndUp.value && !selectMode" class="flex">
                      <VTooltip text="识别">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" @click.stop="recognize(item.path)">
                            <VIcon icon="mdi-text-recognition" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="刮削">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" @click.stop="scrape(item.path)">
                            <VIcon icon="mdi-auto-fix" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="重命名">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" @click.stop="showRenmae(item)">
                            <VIcon icon="mdi-rename" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="整理">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" @click.stop="showTransfer(item)">
                            <VIcon icon="mdi-folder-arrow-right" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="删除">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" @click.stop="deleteItem(item)">
                            <VIcon icon="mdi-delete-outline" color="error" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                    </span>
                  </template>
                </VListItem>
              </template>
            </VHover>
          </template>
        </VVirtualScroll>
      </VList>
    </VCardText>
    <VCardText v-else-if="filter" class="grow d-flex justify-center align-center grey--text py-5">
      没有目录或文件
    </VCardText>
    <VCardText v-else-if="!loading" class="grow d-flex justify-center align-center grey--text py-5"> 空目录 </VCardText>
  </VCard>
  <!-- 重命名弹窗 -->
  <VDialog v-if="renamePopper" v-model="renamePopper" max-width="50rem">
    <VCard title="重命名">
      <DialogCloseBtn @click="renamePopper = false" />
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField v-model="newName" label="新名称" :loading="renameLoading" />
          </VCol>
          <VCol cols="12" md="6" v-if="currentItem && currentItem.type == 'dir'">
            <VSwitch v-model="renameAll" label="自动重命名目录内所有媒体文件" />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions>
        <VBtn color="success" variant="elevated" @click="get_recommend_name" prepend-icon="mdi-magic" class="px-5 me-3">
          自动识别名称
        </VBtn>
        <VBtn :disabled="!newName" variant="elevated" @click="rename" prepend-icon="mdi-check" class="px-5 me-3">
          确定
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 文件整理弹窗 -->
  <ReorganizeDialog
    v-if="transferPopper"
    v-model="transferPopper"
    :storage="inProps.storage"
    :paths="transferPaths"
    @done="transferDone"
    @close="transferPopper = false"
  />
  <!-- 进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
  <!-- 识别结果对话框 -->
  <VDialog v-if="nameTestDialog" v-model="nameTestDialog" width="50rem">
    <VCard>
      <DialogCloseBtn @click="nameTestDialog = false" />
      <VCardItem>
        <MediaInfoCard :context="nameTestResult" />
      </VCardItem>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.v-card {
  block-size: 100%;
}

.v-toolbar {
  background: rgb(var(--v-table-header-background));
}
</style>
