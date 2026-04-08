<script lang="ts" setup>
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from 'vue-toastification'
import ReorganizeDialog from '../dialog/ReorganizeDialog.vue'
import { formatBytes } from '@core/utils/formatters'
import type { Context, EndPoints, FileItem } from '@/api/types'
import api from '@/api'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { useDisplay } from 'vuetify'
import MediaInfoDialog from '../dialog/MediaInfoDialog.vue'
import { useI18n } from 'vue-i18n'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'
import { usePWA } from '@/composables/usePWA'
import { useAvailableHeight } from '@/composables/useAvailableHeight'

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackgroundOptimization()

// 显示器宽度
const display = useDisplay()

const { appMode } = usePWA()

// 计算列表可用高度
// componentOffset = FileToolbar(48) + FileList操作栏(40) + VCard边距(4) = 92
const { availableHeight: listAvailableHeight } = useAvailableHeight(92, 300)

// 输入参数
const inProps = defineProps({
  icons: Object,
  endpoints: Object as PropType<EndPoints>,
  axios: {
    type: Object as PropType<AxiosInstance>,
    required: true,
  },
  refreshpending: Boolean,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  sort: String,
  showTree: Boolean,
})

// 对外事件
const emit = defineEmits([
  'loading',
  'pathchanged',
  'refreshed',
  'filedeleted',
  'renamed',
  'items-updated',
  'switch-tree',
])

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
const progressText = ref(t('common.pleaseWait'))

// 识别进度
const progressValue = ref(0)

// 内容列表
const items = ref<FileItem[]>([])

// 过滤条件
const filter = ref('')

// 是否忽略大小写
const ignoreCase = ref(true)

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

// 进度是否激活
const progressActive = ref(false)

// 通用过滤
const getFilteredItems = (type: 'dir' | 'file') => {
  const filterValue = filter.value
  if (!filterValue) {
    return items.value.filter(item => item.type === type)
  }

  if (ignoreCase.value) {
    const lowerCaseFilter = filterValue.toLowerCase()
    return items.value.filter(item => item.type === type && item.name.toLowerCase().includes(lowerCaseFilter))
  } else {
    return items.value.filter(item => item.type === type && item.name.includes(filterValue))
  }
}

// 目录过滤
const dirs = computed(() => getFilteredItems('dir'))

// 文件过滤
const files = computed(() => getFilteredItems('file'))
// 是否文件
const isFile = computed(() => inProps.item.type == 'file')

// 需要整理的文件项
const transferItems = ref<FileItem[]>([])

// 当前图片地址
const currentImgLink = ref('')



// 是否为图片文件
const isImage = computed(() => {
  const ext = inProps.item.path?.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext ?? '')
})

// 调整选择模式
function changeSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value = []
}

// 调API加载文件夹内的内容
async function list_files() {
  loading.value = true
  const takeURISnapshot = () => [inProps.item.storage, inProps.item.path].join(':/');
  const prevURI = takeURISnapshot();
  emit('loading', true)

  // 参数
  const url = inProps.endpoints?.list.url.replace(/{sort}/g, inProps.sort || 'name')

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.list.method || 'get',
    data: inProps.item,
  }

  // 加载数据
  const data = ((await inProps.axios.request<FileItem[], FileItem[]>(config))) ?? []
  // 如果当前路径已经变化，则放弃此次加载结果
  if (prevURI !== takeURISnapshot()) {
    return;
  }
  items.value = data
  emit('loading', false)
  loading.value = false

  // 通知父组件文件列表更新
  emit('items-updated', items.value)
}

// 删除项目
async function deleteItem(item: FileItem, confirm: boolean = true) {
  if (confirm) {
    const confirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('file.confirmFileDelete', {
        type: item.type === 'dir' ? t('file.directory') : t('file.file'),
        name: item.name,
      }),
    })
    if (!confirmed) return
  }

  // 加载中
  emit('loading', true)

  // 请求API
  const url = inProps.endpoints?.delete.url
  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.delete.method || 'post',
    data: item,
  }
  await inProps.axios.request(config)

  // 删除完成
  emit('loading', false)
  emit('filedeleted')

  // 重新加载
  list_files()
}

// 批量删除
async function batchDelete() {
  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('file.confirmBatchDelete', { count: selected.value.length }),
  })

  if (!confirmed) return

  // 显示进度条
  progressDialog.value = true
  progressValue.value = 0

  // 删除选中的项目
  selected.value.every(async item => {
    progressText.value = t('file.deleting', { name: item.name })
    await deleteItem(item, false)
  })

  // 关闭进度条
  progressDialog.value = false

  // 重新加载
  list_files()
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
    // 去重
    selected.value = Array.from(new Set(selected.value))
    return false
  }
  changePath(item)
}

// 新窗口中下载文件
async function download(item: FileItem) {
  const url = inProps.endpoints?.download.url
  // 下载文件
  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.download.method || 'post',
    data: item,
    responseType: 'blob',
  }
  // 加载数据
  const result: Blob = (await inProps.axios.request<Blob, Blob>(config))
  if (result) {
    const downloadUrl = URL.createObjectURL(result)
    window.open(downloadUrl, '_blank')
  }
}

// 获取图片地址
async function getImgLink(item: FileItem) {
  let url = inProps.endpoints?.image.url
  // 下载文件
  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.image.method || 'post',
    data: item,
    responseType: 'blob',
  }
  // 加载二进制数据
  const result: Blob = (await inProps.axios.request<Blob, Blob>(config))
  if (result) {
    // 创建图片地址
    currentImgLink.value = URL.createObjectURL(result)
  }
}

// 如果当前是图片且是文件，则获取图片地址
watch(
  () => inProps.item,
  async () => {
    if (isImage.value && isFile.value) {
      await getImgLink(inProps.item)
    }
  },
  { immediate: true },
)

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
    progressText.value = t('file.renamingAll', { path: currentItem.value?.path })
  } else {
    progressText.value = t('file.renaming', { name: currentItem.value?.name })
  }
  if (renameAll.value) {
    startLoadingProgress()
  }

  // 调API
  let url = inProps.endpoints?.rename.url.replace(/{newname}/g, encodeURIComponent(newName.value))
  if (renameAll.value) {
    url += '&recursive=true'
  }

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.rename.method || 'post',
    data: currentItem.value,
  }
  const result: { [key: string]: any } = (await inProps.axios?.request<any, { [key: string]: any }>(config))
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
  transferItems.value = [item]
  transferPopper.value = true
}

// 显示批量整理对话框
function showBatchTransfer() {
  transferItems.value = selected.value
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

// 切换文件树显示
function switchFileTree(state: boolean) {
  emit('switch-tree', state)
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

// 监听item变化
watch(
  [() => inProps.item],
  async () => {
    // 清空列表
    items.value = []
    // 关闭弹窗
    nameTestResult.value = undefined
    nameTestDialog.value = false
    // 重置菜单
    dropdownItems.value = [
      {
        title: t('file.recognize'),
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
        title: t('file.scrape'),
        value: 2,
        show: true,
        props: {
          prependIcon: 'mdi-auto-fix',
          click: (_item: FileItem) => {
            scrape(_item)
          },
        },
      },
      {
        title: t('file.rename'),
        value: 3,
        show: true,
        props: {
          prependIcon: 'mdi-rename',
          click: showRenmae,
        },
      },
      {
        title: t('file.reorganize'),
        value: 4,
        show: true,
        props: {
          prependIcon: 'mdi-folder-arrow-right',
          click: showTransfer,
        },
      },
      {
        title: t('common.delete'),
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
    progressText.value = t('file.recognizing', { path })
    progressValue.value = 0
    nameTestResult.value = await api.get('media/recognize_file', {
      params: {
        path,
      },
    })
    // 关闭进度条
    progressDialog.value = false
    if (!nameTestResult.value) $toast.error(t('file.recognizeFailed', { path }))
    nameTestDialog.value = !!nameTestResult.value?.meta_info?.name
  } catch (error) {
    console.error(error)
  }
}

// 调用API刮削
async function scrape(item: FileItem, confirm: boolean = true) {
  try {
    if (confirm) {
      // 确认
      const confirmed = await createConfirm({
        title: t('common.confirm'),
        content: t('file.confirmScrape', { path: item.path }),
      })
      if (!confirmed) return
    }

    // 显示进度条
    progressDialog.value = true
    progressText.value = t('file.scraping', { path: item.path })

    const result: { [key: string]: any } = await api.post(`media/scrape/${inProps.item.storage}`, item)

    // 关闭进度条
    progressDialog.value = false
    if (!result.success) $toast.error(result.message)
    else $toast.success(t('file.scrapeCompleted', { path: item.path }))
  } catch (error) {
    console.error(error)
  }
}

// 批量刮削
async function batchScrape() {
  // 确认
  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('file.confirmBatchScrape', { count: selected.value.length }),
  })
  if (!confirmed) return

  selected.value.map(item => {
    scrape(item, false)
  })
}

// 进度SSE消息处理函数
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text
    progressValue.value = progress.value
  }
}

// 使用优化的进度SSE连接
const progressSSE = useProgressSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/progress/batchrename`,
  handleProgressMessage,
  'file-batch-rename-progress',
  progressActive,
)

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = t('common.pleaseWait')
  progressActive.value = true
  progressSSE.start()
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  progressSSE.stop()
}

onMounted(() => {
  list_files()
})
</script>

<style scoped>
.file-list-container {
  overflow: hidden auto;
  block-size: 100%;
  max-block-size: 100%;
}
</style>

<template>
  <div>
    <VCard class="d-flex flex-column w-full h-full rounded-t-0" :class="{ 'rounded-s-0': showTree }">
      <div v-if="!loading" class="flex">
        <IconBtn v-if="display.mdAndUp.value">
          <VIcon v-if="showTree" icon="mdi-file-tree" @click="switchFileTree(false)" />
          <VIcon v-else icon="mdi-file-tree-outline" @click="switchFileTree(true)" />
        </IconBtn>
        <VTextField
          v-if="!isFile"
          v-model="filter"
          hide-details
          flat
          density="compact"
          variant="plain"
          :placeholder="t('common.search')"
          prepend-inner-icon="mdi-filter-outline"
          class="mx-2"
          rounded
        />
        <VSpacer v-if="isFile" />
        <IconBtn v-if="!isFile" @click="ignoreCase = !ignoreCase">
          <VIcon :color="ignoreCase ? 'primary' : 'error'" icon="mdi-format-letter-case" />
        </IconBtn>
        <IconBtn v-if="!isFile" @click="changeSelectMode">
          <VIcon color="primary" :icon="selectMode ? 'mdi-selection-remove' : 'mdi-select'" />
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
      </div>
      <LoadingBanner v-if="loading" />
      <!-- 文件详情 -->
      <VCardText v-else-if="isFile && !isImage && items.length > 0" class="text-center break-all">
        <div v-if="items[0]?.thumbnail" class="flex justify-center">
          <VImg max-width="15rem" cover :src="items[0]?.thumbnail" class="rounded border">
            <template #placeholder>
              <VSkeletonLoader class="object-cover w-full h-full" />
            </template>
          </VImg>
        </div>
        <div class="text-xl text-high-emphasis mt-3">{{ items[0]?.name }}</div>
        <p class="mt-2" v-if="items[0]?.size && items[0].modify_time">
          {{ t('file.size') }}：{{ formatBytes(items[0]?.size || 0) }}<br />
          {{ t('file.modifyTime') }}：{{ formatTime(items[0]?.modify_time || 0) }}
        </p>
      </VCardText>
      <!-- 图片 -->
      <VCardText v-else-if="isFile && isImage && items.length > 0" class="grow d-flex justify-center align-center">
        <VImg :src="currentImgLink" max-width="100%" max-height="100%" />
      </VCardText>
      <!-- 目录和文件列表 -->
      <VCardText v-else-if="dirs.length || files.length" class="p-0 flex-grow-1 overflow-hidden">
        <VList
          class="text-high-emphasis file-list-container"
          :style="{ height: `${listAvailableHeight}px`, maxHeight: `${listAvailableHeight}px` }"
        >
          <VVirtualScroll :items="[...dirs, ...files]" style="block-size: 100%">
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
                        <VIcon v-else-if="item.type == 'dir'" icon="mdi-folder" />
                        <VIcon v-else icon="mdi-file-outline" />
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
                        <IconBtn @click.stop="recognize(item.path)">
                          <VIcon icon="mdi-text-recognition" />
                        </IconBtn>
                        <IconBtn @click.stop="scrape(item)">
                          <VIcon icon="mdi-auto-fix" />
                        </IconBtn>
                        <IconBtn @click.stop="showRenmae(item)">
                          <VIcon icon="mdi-rename" />
                        </IconBtn>
                        <IconBtn @click.stop="showTransfer(item)">
                          <VIcon icon="mdi-folder-arrow-right" />
                        </IconBtn>
                        <IconBtn @click.stop="deleteItem(item)">
                          <VIcon icon="mdi-delete-outline" color="error" />
                        </IconBtn>
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
        {{ t('file.noFiles') }}
      </VCardText>
      <VCardText v-else-if="!loading" class="grow d-flex justify-center align-center grey--text py-5">
        {{ t('file.emptyDirectory') }}
      </VCardText>
    </VCard>
    <!-- 重命名弹窗 -->
    <VDialog v-if="renamePopper" v-model="renamePopper" max-width="35rem">
      <VCard>
        <VCardItem>
          <template #prepend>
            <VIcon icon="mdi-pencil" class="me-2" />
          </template>
          <VCardTitle>{{ t('file.rename') }}</VCardTitle>
        </VCardItem>
        <VDialogCloseBtn @click="renamePopper = false" />
        <VDivider />
        <VCardText>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="newName"
                :label="t('file.newName')"
                :loading="renameLoading"
                prepend-inner-icon="mdi-format-text"
              />
            </VCol>
            <VCol cols="12" v-if="currentItem && currentItem.type == 'dir'">
              <VSwitch v-model="renameAll" :label="t('file.includeSubfolders')" />
            </VCol>
          </VRow>
        </VCardText>
        <VCardActions>
          <VBtn color="success" @click="get_recommend_name" prepend-icon="mdi-magic" class="px-5 me-3">
            {{ t('file.autoRecognizeName') }}
          </VBtn>
          <VBtn :disabled="!newName" @click="rename" prepend-icon="mdi-check" class="px-5 me-3">
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
    <!-- 文件整理弹窗 -->
    <ReorganizeDialog
      v-if="transferPopper"
      v-model="transferPopper"
      :items="transferItems"
      :target_storage="inProps.item.storage"
      @done="transferDone"
      @close="transferPopper = false"
    />
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
    <!-- 识别结果对话框 -->
    <MediaInfoDialog
      v-if="nameTestDialog"
      v-model="nameTestDialog"
      :context="nameTestResult"
      @close="nameTestDialog = false"
    />
  </div>
</template>
