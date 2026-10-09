<script lang="ts" setup>
import dayjs from 'dayjs'
import type { AxiosRequestConfig } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useToast } from 'vue-toastification'
import { formatBytes } from '@core/utils/formatters'
import type { Context, EndPoints, FileItem, ManualScrapeOptions } from '@/api/types'
import api from '@/api'
import type { DataApiClient } from '@/api'
import { useDisplay } from 'vuetify'
import { useResizeObserver } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'
import FileDetails from './FileDetails.vue'
import type { FileAction } from './types'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 原生滚动条宽度随系统变化，表头与可滚动列表使用同一内容宽度。
const tableRef = ref<HTMLElement | null>(null)
const scrollbarWidth = ref(0)
/** 测量列表的原生滚动条占位，使表头与列表项的右边缘对齐。 */
function measureScrollbar() {
  const list = tableRef.value?.querySelector<HTMLElement>('.file-list-container')
  scrollbarWidth.value = list ? list.offsetWidth - list.clientWidth : 0
}
useResizeObserver(tableRef, measureScrollbar)
onUpdated(measureScrollbar)

const FileRenameDialog = defineAsyncComponent(() => import('../dialog/FileRenameDialog.vue'))
const MediaInfoDialog = defineAsyncComponent(() => import('../dialog/MediaInfoDialog.vue'))
const ProgressDialog = defineAsyncComponent(() => import('../dialog/ProgressDialog.vue'))
const ReorganizeDialog = defineAsyncComponent(() => import('../dialog/ReorganizeDialog.vue'))
const ScrapeDialog = defineAsyncComponent(() => import('../dialog/ScrapeDialog.vue'))

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackground()

// 显示器宽度
const display = useDisplay()

// 输入参数
const inProps = defineProps({
  icons: Object,
  endpoints: Object as PropType<EndPoints>,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<DataApiClient>,
    required: true,
  },
  refreshpending: Boolean,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  sort: String,
  showTree: Boolean,
  active: {
    type: Boolean,
    default: true,
  },
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

// 新名称
const newName = ref('')

// 处理目录内所有文件
const renameAll = ref(false)

// 详情面板只保存文件身份，目录数据不因预览而替换。
const inspectedItem = ref<FileItem>()
const inspectorLoading = ref(false)
let inspectorRequestSeed = 0
const detailItem = computed(() => (isFile.value ? items.value[0] || inProps.item : inspectedItem.value))

// 当前操作项
const currentItem = ref<FileItem>()

// 选中的项目
const selected = ref<FileItem[]>([])

/** 生成文件项稳定键，用于去重和状态同步。 */
function getFileItemKey(item?: FileItem) {
  return [item?.storage ?? inProps.item.storage ?? '', item?.type ?? '', item?.path ?? ''].join('|')
}

/** 按存储、类型和路径去重文件项。 */
function dedupeFileItems(fileItems: FileItem[]) {
  const uniqueItems = new Map<string, FileItem>()
  fileItems.forEach(item => {
    uniqueItems.set(getFileItemKey(item), item)
  })

  return Array.from(uniqueItems.values())
}

/** 列表刷新后将选中项同步为最新文件对象。 */
function syncSelectedItems(nextItems: FileItem[] = items.value) {
  if (!selected.value.length) return

  const currentItemMap = new Map(nextItems.map(item => [getFileItemKey(item), item]))
  selected.value = dedupeFileItems(selected.value)
    .map(item => currentItemMap.get(getFileItemKey(item)))
    .filter((item): item is FileItem => !!item)
}

const selectedKeys = computed(() => new Set(selected.value.map(item => getFileItemKey(item))))

/** 判断文件项当前是否已选中。 */
function isSelected(item: FileItem) {
  return selectedKeys.value.has(getFileItemKey(item))
}

/** 更新单个文件项的选中状态。 */
function setItemSelected(item: FileItem, checked: boolean) {
  const itemKey = getFileItemKey(item)

  if (checked) {
    if (!selectedKeys.value.has(itemKey)) {
      selected.value = [...selected.value, item]
    }
    return
  }

  selected.value = selected.value.filter(selectedItem => getFileItemKey(selectedItem) !== itemKey)
}

// 识别结果
const nameTestResult = ref<Context>()

let renameDialogController: ReturnType<typeof openSharedDialog> | null = null
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

/** 打开共享进度弹窗并记录控制器，方便 SSE 更新文本和进度值。 */
function openProgressDialog(text = progressText.value, value = progressValue.value) {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text, value }, {}, { closeOn: false })
}

/** 关闭当前共享进度弹窗。 */
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 弹出菜单
const dropdownItems = ref<{ [key: string]: any }[]>([])

// 进度是否激活
const progressActive = ref(false)

/** 将 glob 模式转换为正则表达式。 */
function globToRegex(pattern: string, flags: string = ''): RegExp {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${regexStr}$`, flags)
}

// 通用过滤
const filteredItems = computed(() => {
  const filterValue = filter.value
  if (!filterValue) {
    return items.value
  }

  // 通配符模式
  if (filterValue.includes('*') || filterValue.includes('?')) {
    const flags = ignoreCase.value ? 'i' : ''
    const regex = globToRegex(filterValue, flags)
    return items.value.filter(item => regex.test(item.name ?? ''))
  }

  // 子字符串模式
  if (ignoreCase.value) {
    const lowerCaseFilter = filterValue.toLowerCase()
    return items.value.filter(item => (item.name ?? '').toLowerCase().includes(lowerCaseFilter))
  } else {
    return items.value.filter(item => (item.name ?? '').includes(filterValue))
  }
})

// 目录过滤
const dirs = computed(() => filteredItems.value.filter(item => item.type === 'dir'))

// 文件过滤
const files = computed(() => filteredItems.value.filter(item => item.type === 'file'))

// 虚拟列表数据，保持引用稳定，避免模板内联展开数组导致虚拟列表重算。
const displayItems = computed(() => [...dirs.value, ...files.value])
// 是否文件
const isFile = computed(() => inProps.item.type == 'file')

// 需要整理的文件项
const transferItems = ref<FileItem[]>([])

// 当前图片地址
const currentImgLink = ref('')

let imageRequestSeed = 0
// request seed 决定响应提交和内部 loading 归属；外部 loading 按非静默调用配对，重叠时也分别完成事件收口。
let listLoadingRequestSeed = 0
let listRequestSeed = 0

/** 释放当前图片预览使用的临时对象地址。 */
function revokeCurrentImgLink() {
  if (!currentImgLink.value) return

  URL.revokeObjectURL(currentImgLink.value)
  currentImgLink.value = ''
}

/** 调整选择模式。 */
function changeSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) selected.value = []
}

/** 退出多选模式。 */
function exitSelectMode() {
  selectMode.value = false
  selected.value = []
}

/** 调API加载文件夹内的内容。 */
async function list_files(context: KeepAliveRefreshContext = {}) {
  const requestSeed = ++listRequestSeed
  const silentRefresh = Boolean(context.silent && items.value.length > 0)

  if (!silentRefresh) {
    listLoadingRequestSeed = requestSeed
    loading.value = true
    emit('loading', true)
  }

  try {
    // 参数
    const url = inProps.endpoints?.list.url.replace(/{sort}/g, inProps.sort || 'name')

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.list.method || 'get',
      data: inProps.item,
    }

    // 加载数据
    const data = (await inProps.axios.request<FileItem[], FileItem[]>(config)) ?? []
    if (requestSeed !== listRequestSeed) return

    items.value = data
    syncSelectedItems(data)
    if (inspectedItem.value) {
      const updated = data.find(item => getFileItemKey(item) === getFileItemKey(inspectedItem.value))
      inspectedItem.value = updated ? { ...inspectedItem.value, ...updated } : undefined
    }

    // 通知父组件文件列表更新
    emit('items-updated', items.value)
  } catch (error) {
    console.error(error)
  } finally {
    if (!silentRefresh) {
      emit('loading', false)
      if (requestSeed === listLoadingRequestSeed) loading.value = false
    }
  }
}

/** 请求删除文件项，由单项或批量操作分别决定反馈和刷新策略。 */
async function requestDeleteItem(item: FileItem) {
  const config: AxiosRequestConfig<FileItem> = {
    url: inProps.endpoints?.delete.url,
    method: inProps.endpoints?.delete.method || 'post',
    data: item,
    feedback: 'silent',
  }
  return inProps.axios.request<null>(config)
}

/** 删除项目。 */
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

  try {
    await requestDeleteItem(item)

    emit('filedeleted')
    await list_files()
    return true
  } catch (error) {
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
    return false
  } finally {
    emit('loading', false)
  }
}

/** 批量删除。 */
async function batchDelete() {
  if (!selected.value.length) return

  const confirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('file.confirmBatchDelete', { count: selected.value.length }),
  })

  if (!confirmed) return

  // 显示进度条
  progressValue.value = 0
  openProgressDialog(progressText.value, progressValue.value)
  emit('loading', true)

  try {
    const selectedItems = dedupeFileItems(selected.value)
    const failedItems: FileItem[] = []

    // 删除选中的项目
    for (const [index, item] of selectedItems.entries()) {
      progressText.value = t('file.deleting', { name: item.name })
      progressValue.value = Math.round(((index + 1) / selectedItems.length) * 100)
      progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
      try {
        await requestDeleteItem(item)
      } catch (error) {
        console.error(error)
        failedItems.push(item)
      }
    }

    if (failedItems.length) {
      selected.value = failedItems
      $toast.error(`${t('common.error')}: ${failedItems.map(item => item.name).join(', ')}`)
    } else {
      exitSelectMode()
    }
  } finally {
    // 关闭进度条
    closeProgressDialog()

    // 重新加载
    try {
      await list_files({ silent: true })
    } finally {
      emit('loading', false)
    }
  }
}

/** 切换路径。 */
function changePath(item: FileItem) {
  emit('pathchanged', normalizeItem(item))
}

/** 点击列表项。 */
function listItemClick(item: FileItem) {
  if (selectMode.value) {
    setItemSelected(item, !isSelected(item))
    return false
  }
  if (item.type === 'dir') changePath(item)
  else inspectItem(item)
}

/** 新窗口中下载文件。 */
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
  const result: Blob = await inProps.axios.request<Blob, Blob>(config)
  if (result) {
    const downloadUrl = URL.createObjectURL(result)
    window.open(downloadUrl, '_blank')
    setTimeout(() => {
      URL.revokeObjectURL(downloadUrl)
    }, 60000)
  }
}

/** 获取图片地址。 */
async function getImgLink(item: FileItem) {
  const requestSeed = ++imageRequestSeed
  const url = inProps.endpoints?.image.url
  // 下载文件
  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.image.method || 'post',
    data: item,
    responseType: 'blob',
  }
  // 加载二进制数据
  const result: Blob = await inProps.axios.request<Blob, Blob>(config)
  if (result && requestSeed === imageRequestSeed) {
    // 创建图片地址
    revokeCurrentImgLink()
    currentImgLink.value = URL.createObjectURL(result)
  }
}

/** 路径使用后端返回值；兼容仅返回名称的存储，不修改列表对象。 */
function normalizeItem(item: FileItem): FileItem {
  return {
    ...item,
    path:
      item.path && (item.path !== inProps.item.path || inProps.item.type === 'file')
        ? item.path
        : (inProps.item.path || '/') + item.name + (item.type === 'dir' ? '/' : ''),
  }
}

/** 预览保留目录列表与滚动位置，详情请求以身份和代次隔离迟到响应。 */
async function inspectItem(item: FileItem) {
  const normalized = normalizeItem(item)
  const seed = ++inspectorRequestSeed
  inspectedItem.value = normalized
  inspectorLoading.value = true
  try {
    const data = await inProps.axios.request<FileItem[]>({
      url: inProps.endpoints?.list.url.replace(/{sort}/g, inProps.sort || 'name'),
      method: inProps.endpoints?.list.method || 'post',
      data: normalized,
    })
    if (seed === inspectorRequestSeed && data?.[0]) inspectedItem.value = { ...normalized, ...data[0] }
  } catch (error) {
    console.error(error)
  } finally {
    if (seed === inspectorRequestSeed) inspectorLoading.value = false
  }
}

/** 关闭预览后取消响应提交并释放临时图片，目录浏览状态保持不变。 */
function closeInspector() {
  inspectorRequestSeed += 1
  inspectorLoading.value = false
  inspectedItem.value = undefined
  imageRequestSeed += 1
  revokeCurrentImgLink()
}

/** 移动端操作入口复用详情面板；目录直接展示自身信息，避免将子项作为目录详情。 */
function openActions(item: FileItem) {
  if (item.type === 'file') void inspectItem(item)
  else {
    closeInspector()
    inspectedItem.value = normalizeItem(item)
  }
}

/** 单项入口共用原业务方法，移动详情先关闭，确认与失败反馈继续由原流程负责。 */
function runAction(action: FileAction, item: FileItem) {
  if (display.smAndDown.value) closeInspector()
  const target = normalizeItem(item)
  if (action === 'recognize') void recognize(target.path || '')
  else if (action === 'scrape') showScrape(target)
  else if (action === 'rename') showRenmae(target)
  else if (action === 'reorganize') showTransfer(target)
  else if (action === 'download') void download(target)
  else void deleteItem(target)
}

/** 全选仅针对当前筛选结果；隐藏的已选项保留，取消全选不误清除其它选择。 */
function toggleSelectAll() {
  const allSelected = displayItems.value.length > 0 && displayItems.value.every(isSelected)
  displayItems.value.forEach(item => setItemSelected(item, !allSelected))
}

/** 列表时间列优先保持固定宽度，移动端仅展示本地日期。 */
function formatDate(timestamp?: number) {
  return timestamp ? dayjs(timestamp * 1000).format('YYYY-MM-DD') : '—'
}

/** 显示重命名弹窗。 */
function showRenmae(item: FileItem) {
  currentItem.value = normalizeItem(item)
  newName.value = item.name
  renameAll.value = false
  openRenameDialog()
}

/** 打开共享重命名弹窗，并双向同步当前文件名和递归选项。 */
function openRenameDialog() {
  renameDialogController = openSharedDialog(
    FileRenameDialog,
    {
      item: currentItem.value,
      loading: renameLoading.value,
      name: newName.value,
      recursive: renameAll.value,
    },
    {
      'auto-name': get_recommend_name,
      rename,
      'update:name': (value: string) => {
        newName.value = value
        renameDialogController?.updateProps({ name: value })
      },
      'update:recursive': (value: boolean) => {
        renameAll.value = value
        renameDialogController?.updateProps({ recursive: value })
      },
    },
    { closeOn: ['close'] },
  )
}

/** 调用API获取新名称。 */
async function get_recommend_name() {
  renameLoading.value = true
  renameDialogController?.updateProps({ loading: true })
  try {
    const result = await api.get<{ name: string }>('transfer/name', {
      params: {
        path: currentItem.value?.path,
        filetype: currentItem.value?.type ?? 'file',
      },
    })
    newName.value = result.name
  } catch (error) {
    console.error(error)
  }
  renameLoading.value = false
  renameDialogController?.updateProps({ loading: false, name: newName.value })
}

/** 仅在后端确认成功后关闭编辑弹窗并通知刷新；失败时保留输入以便重试。 */
async function rename() {
  emit('loading', true)
  const recursive = renameAll.value

  // 显示进度条
  progressValue.value = 0
  if (recursive) {
    progressText.value = t('file.renamingAll', { path: currentItem.value?.path })
  } else {
    progressText.value = t('file.renaming', { name: currentItem.value?.name })
  }
  openProgressDialog(progressText.value, progressValue.value)
  if (recursive) {
    startLoadingProgress()
  }

  try {
    let url = inProps.endpoints?.rename.url.replace(/{newname}/g, encodeURIComponent(newName.value))
    if (recursive) url += '&recursive=true'

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.rename.method || 'post',
      data: currentItem.value,
      feedback: 'silent',
    }
    await inProps.axios.request<null>(config)

    newName.value = ''
    renameAll.value = false
    renameDialogController?.close()
    renameDialogController = null
    emit('renamed')
  } catch (error) {
    console.error(error)
    $toast.error(error instanceof Error ? error.message : t('common.error'))
  } finally {
    if (recursive) stopLoadingProgress()
    closeProgressDialog()
    emit('loading', false)
  }
}

/** 显示整理对话框。 */
function showTransfer(item: FileItem) {
  transferItems.value = [item]
  openTransferDialog()
}

/** 显示批量整理对话框。 */
function showBatchTransfer() {
  transferItems.value = dedupeFileItems(selected.value)
  openTransferDialog()
}

/** 整理完成。 */
function transferDone() {
  exitSelectMode()
  list_files()
}

/** 打开共享文件整理弹窗，整理完成后刷新当前目录。 */
function openTransferDialog() {
  openSharedDialog(
    ReorganizeDialog,
    {
      items: transferItems.value,
      target_storage: inProps.item.storage,
    },
    {
      done: transferDone,
      close: transferDone,
    },
    { closeOn: ['close', 'done'] },
  )
}

/** 将文件修改时间（timestape）转换为本地时间。 */
function formatTime(timestape: number) {
  return dayjs(timestape * 1000).format('YYYY-MM-DD HH:mm')
}

/** 切换文件树显示。 */
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
  () => inProps.item,
  async () => {
    // 切换目录使旧详情请求失效，防止将旧文件显示在新目录。
    closeInspector()
    // 清空列表
    items.value = []
    selected.value = []
    // 关闭弹窗
    nameTestResult.value = undefined
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
            showScrape(_item)
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

/** 调用API识别。 */
async function recognize(path: string) {
  try {
    // 显示进度条
    progressText.value = t('file.recognizing', { path })
    progressValue.value = 0
    openProgressDialog(progressText.value, progressValue.value)
    nameTestResult.value = await api.get('media/recognize_file', {
      params: {
        path,
      },
    })
    // 关闭进度条
    closeProgressDialog()
    if (!nameTestResult.value) $toast.error(t('file.recognizeFailed', { path }))
    if (nameTestResult.value?.meta_info?.name || nameTestResult.value?.meta_info?.title) {
      openSharedDialog(MediaInfoDialog, { context: nameTestResult.value }, {}, { closeOn: ['close'] })
    }
  } catch (error) {
    closeProgressDialog()
    console.error(error)
  }
}

/** 调用 API 按请求级媒体条件刮削单个文件项。 */
async function scrape(item: FileItem, options: ManualScrapeOptions, silent = false) {
  try {
    progressText.value = t('file.scraping', { path: item.path })
    progressDialogController?.updateProps({ text: progressText.value })

    await api.post<null>(`media/scrape/${inProps.item.storage}`, item, {
      params: options,
      feedback: 'silent',
    })

    if (!silent) $toast.success(t('file.scrapeCompleted', { path: item.path }))
  } catch (error) {
    console.error(error)
    if (!silent) $toast.error(error instanceof Error ? error.message : t('common.error'))
    throw error
  }
}

/** 按同一媒体条件依次刮削选中的文件项。 */
async function scrapeItems(itemsToScrape: FileItem[], options: ManualScrapeOptions) {
  const normalizedItems = dedupeFileItems(itemsToScrape)
  if (!normalizedItems.length) return

  progressText.value = t('file.scraping', { path: normalizedItems[0].path })
  progressValue.value = 0
  openProgressDialog(progressText.value, progressValue.value)
  const failedItems: FileItem[] = []
  try {
    for (const [index, item] of normalizedItems.entries()) {
      try {
        await scrape(item, options, true)
        $toast.success(t('file.scrapeCompleted', { path: item.path }))
      } catch {
        failedItems.push(item)
      }
      progressValue.value = Math.round(((index + 1) / normalizedItems.length) * 100)
      progressDialogController?.updateProps({ value: progressValue.value })
    }
    if (failedItems.length) {
      $toast.error(`${t('common.error')}: ${failedItems.map(item => item.name).join(', ')}`)
    }
  } finally {
    closeProgressDialog()
    if (selectMode.value) exitSelectMode()
    list_files({ silent: true })
  }
}

/** 打开单项手动刮削弹窗。 */
function showScrape(item: FileItem) {
  openScrapeDialog([item])
}

/** 打开批量手动刮削弹窗。 */
function showBatchScrape() {
  openScrapeDialog(dedupeFileItems(selected.value))
}

/** 打开手动刮削弹窗，并将确认结果交给文件列表执行。 */
function openScrapeDialog(itemsToScrape: FileItem[]) {
  if (!itemsToScrape.length) return
  openSharedDialog(
    ScrapeDialog,
    { items: itemsToScrape },
    {
      scrape: (options: ManualScrapeOptions) => scrapeItems(itemsToScrape, options),
    },
    { closeOn: ['close', 'scrape'] },
  )
}

/** 进度SSE消息处理函数。 */
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text_i18n || progress.text
    progressValue.value = progress.value
    progressDialogController?.updateProps({ text: progressText.value, value: progressValue.value })
  }
}

// 使用进度SSE连接
const progressSSE = useProgressSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/progress/batchrename`,
  handleProgressMessage,
  'file-batch-rename-progress',
  progressActive,
)

/** 使用SSE监听加载进度。 */
function startLoadingProgress() {
  progressText.value = t('common.pleaseWait')
  progressActive.value = true
  progressSSE.start()
}

/** 停止监听加载进度。 */
function stopLoadingProgress() {
  progressActive.value = false
  progressSSE.stop()
}

watch(
  () => detailItem.value,
  async item => {
    imageRequestSeed += 1
    revokeCurrentImgLink()
    if (item?.type === 'file' && /\.(png|jpe?g|gif|bmp|webp)$/i.test(item.path || '')) await getImgLink(item)
  },
  { immediate: true },
)

useKeepAliveRefresh(list_files, {
  active: computed(() => inProps.active),
})

onUnmounted(() => {
  inspectorRequestSeed += 1
  imageRequestSeed += 1
  listLoadingRequestSeed = ++listRequestSeed
  revokeCurrentImgLink()
  stopLoadingProgress()
  closeProgressDialog()
  renameDialogController?.close()
})
</script>

<template>
  <div class="file-list">
    <div class="file-list__toolbar">
      <VBtn
        variant="outlined"
        color="on-surface"
        class="file-list__tree"
        :aria-label="t('file.directoryTree')"
        :aria-pressed="showTree"
        @click="switchFileTree(!showTree)"
      >
        <VIcon icon="mdi-file-tree-outline" /><span>{{ t('file.directoryTree') }}</span>
      </VBtn>
      <div v-if="!isFile" class="file-list__filter file-list__search search-input-wrapper">
        <VIcon icon="mdi-magnify" size="18" class="search-input-icon" />
        <input
          class="search-native-input"
          v-model="filter"
          :placeholder="t('file.currentDirectoryFilter')"
          :aria-label="t('file.currentDirectoryFilter')"
          type="search"
        />
      </div>
      <div v-else class="file-list__filter" />
      <IconBtn
        v-if="!isFile"
        variant="outlined"
        :aria-label="t('file.ignoreCase')"
        :aria-pressed="ignoreCase"
        @click="ignoreCase = !ignoreCase"
        ><VIcon icon="mdi-format-letter-case" :color="ignoreCase ? 'primary' : undefined"
      /></IconBtn>
      <VBtn
        v-if="!isFile"
        variant="outlined"
        color="on-surface"
        :aria-pressed="selectMode"
        :aria-label="t('file.select')"
        @click="changeSelectMode"
        ><VIcon :icon="selectMode ? 'mdi-selection-remove' : 'mdi-select'" /><span class="file-list__select-label">{{
          t(selectMode ? 'file.finishSelection' : 'file.select')
        }}</span></VBtn
      >
    </div>
    <div v-if="selectMode" class="file-list__selection">
      <VBtn variant="text" @click="toggleSelectAll">{{ t('file.selectAll') }}</VBtn>
      <span>{{ t('file.selectedItems', { count: selected.length }) }}</span>
      <div class="file-list__batch">
        <IconBtn :disabled="!selected.length" :aria-label="t('file.scrape')" @click="showBatchScrape"
          ><VIcon icon="mdi-auto-fix"
        /></IconBtn>
        <IconBtn :disabled="!selected.length" :aria-label="t('file.reorganize')" @click="showBatchTransfer"
          ><VIcon icon="mdi-folder-arrow-right"
        /></IconBtn>
        <IconBtn :disabled="!selected.length" :aria-label="t('common.delete')" @click="batchDelete"
          ><VIcon icon="mdi-delete-outline" color="error"
        /></IconBtn>
      </div>
    </div>
    <div
      class="file-list__content"
      :class="{ 'file-list__content--detail': detailItem && display.mdAndUp.value, 'file-list__content--file': isFile }"
    >
      <div
        v-if="!isFile"
        ref="tableRef"
        class="file-list__table"
        :style="{ '--file-scrollbar-width': `${scrollbarWidth}px` }"
      >
        <div class="file-list__columns">
          <span>{{ t('file.fileName') }}</span
          ><span>{{ t('file.size') }}</span
          ><span>{{ t('file.modifyTime') }}</span
          ><span />
        </div>
        <LoadingBanner v-if="loading" />
        <VVirtualScroll
          v-else-if="displayItems.length"
          :items="displayItems"
          :item-height="display.mdAndUp.value ? 58 : 52"
          class="file-list-container"
          role="list"
          :aria-label="t('navItems.fileManager')"
        >
          <template #default="{ item }">
            <VListItem
              class="file-row"
              :class="{
                'file-row--active': isSelected(item) || getFileItemKey(inspectedItem) === getFileItemKey(item),
              }"
              role="listitem"
              tabindex="0"
              @click="listItemClick(item)"
              @keydown.enter.prevent="listItemClick(item)"
              @keydown.space.prevent="listItemClick(item)"
            >
              <div class="file-row__name">
                <VCheckbox
                  v-if="selectMode"
                  :model-value="isSelected(item)"
                  :aria-label="item.name"
                  hide-details
                  density="compact"
                  @update:model-value="setItemSelected(item, !!$event)"
                  @click.stop
                />
                <VIcon
                  v-else
                  :icon="
                    item.type === 'dir'
                      ? 'mdi-folder'
                      : icons?.[item.extension?.toLowerCase() || ''] || 'mdi-file-outline'
                  "
                  :color="item.type === 'dir' ? 'primary' : undefined"
                  size="24"
                />
                <span :title="item.name">{{ item.name }}</span>
              </div>
              <span class="file-row__size">{{
                typeof item.size === 'number' && Number.isFinite(item.size) && item.size >= 0
                  ? formatBytes(item.size)
                  : ''
              }}</span>
              <span class="file-row__time" :title="item.modify_time ? formatTime(item.modify_time) : undefined">{{
                display.mdAndUp.value && item.modify_time ? formatTime(item.modify_time) : formatDate(item.modify_time)
              }}</span>
              <template #append>
                <IconBtn
                  v-if="display.smAndDown.value && !selectMode"
                  :aria-label="t('file.actionsFor', { name: item.name })"
                  @click.stop="openActions(item)"
                  ><VIcon icon="mdi-dots-horizontal"
                /></IconBtn>
                <VMenu v-else-if="!selectMode">
                  <template #activator="{ props }"
                    ><IconBtn v-bind="props" :aria-label="t('file.actionsFor', { name: item.name })" @click.stop
                      ><VIcon icon="mdi-dots-horizontal" /></IconBtn
                  ></template>
                  <VList
                    ><VListItem
                      v-for="menu in dropdownItems"
                      :key="menu.value"
                      :title="menu.title"
                      :prepend-icon="menu.props.prependIcon"
                      :base-color="menu.props.color"
                      @click="
                        runAction(
                          menu.value === 1
                            ? 'recognize'
                            : menu.value === 2
                              ? 'scrape'
                              : menu.value === 3
                                ? 'rename'
                                : menu.value === 4
                                  ? 'reorganize'
                                  : 'delete',
                          item,
                        )
                      " />
                    <VListItem
                      v-if="item.type === 'file'"
                      :title="t('file.download')"
                      prepend-icon="mdi-download"
                      @click="runAction('download', item)"
                  /></VList>
                </VMenu>
              </template>
            </VListItem>
          </template>
        </VVirtualScroll>
        <div v-else class="file-list__empty">
          <VIcon icon="mdi-folder-open-outline" size="40" />
          <p>{{ t(filter ? 'file.noFiles' : 'file.emptyDirectory') }}</p>
        </div>
      </div>
      <FileDetails
        v-if="detailItem && (display.mdAndUp.value || isFile)"
        class="file-list__inspector"
        :item="detailItem"
        :image-url="currentImgLink"
        :loading="inspectorLoading"
        @action="runAction"
        @close="
          isFile
            ? emit('pathchanged', {
                ...inProps.item,
                type: 'dir',
                path: (inProps.item.path || '').replace(/[^/]+$/, ''),
                name: '',
              })
            : closeInspector()
        "
      />
    </div>
    <VDialog
      :model-value="Boolean(detailItem && display.smAndDown.value && !isFile)"
      class="file-preview-sheet"
      content-class="file-browser-sheet"
      max-width="600"
      scrollable
      @update:model-value="!$event && closeInspector()"
    >
      <VCard class="file-browser-sheet__surface"
        ><FileDetails
          v-if="detailItem"
          :item="detailItem"
          :image-url="currentImgLink"
          :loading="inspectorLoading"
          @action="runAction"
          @close="closeInspector"
      /></VCard>
    </VDialog>
  </div>
</template>
<style scoped lang="scss">
.file-list {
  container-type: inline-size;
  container-name: file-list;
  display: flex;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
  block-size: 100%;
}
.file-list__toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.5rem;
  padding-block-end: 0.625rem;
}
.file-list__toolbar :deep(.v-btn) {
  min-block-size: 2rem;
  block-size: 2rem;
  border-color: var(--app-grouped-list-separator-color);
  border-radius: var(--app-control-radius);
  letter-spacing: 0;
}
.file-list__tree {
  gap: 0.5rem;
}
.file-list__filter {
  flex: 1;
  min-inline-size: 0;
}
.file-list__search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  block-size: 2rem;
  padding-inline: 0.75rem;
  border-radius: var(--app-search-input-radius);
  background: var(--app-search-input-background);
  color: rgba(var(--v-theme-on-surface), 0.45);
}
.file-list__search input {
  flex: 1;
  min-inline-size: 0;
  inline-size: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.87);
  font-size: 0.8125rem;
}
.file-list__search input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.38);
}
.file-list__search:focus-within {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary)) !important;
}
.file-list__selection {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.5rem;
  border-block-end: 1px solid var(--app-grouped-list-separator-color);
  padding-block: 0.25rem;
}
.file-list__batch {
  margin-inline-start: auto;
  display: flex;
}
.file-list__content {
  display: flex;
  flex: 1;
  min-block-size: 0;
  min-inline-size: 0;
  overflow: hidden;
}
.file-list__table {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-inline-size: 0;
  min-block-size: 0;
}
.file-list__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6rem 10rem 2.75rem;
  // Safari 的 flex-basis 不会建立确定的网格块高度，需显式约束行尺寸。
  block-size: 2rem;
  min-block-size: 2rem;
  grid-template-rows: minmax(0, 1fr);
  align-items: center;
  align-content: center;
  flex: 0 0 2rem;
  margin-inline-end: var(--file-scrollbar-width, 0px);
  padding-inline: 1rem 0.25rem;
  gap: 1rem;
  font-size: 0.875rem;
  background: rgba(var(--v-theme-on-surface), var(--v-hover-opacity));
  border-block-end: 1px solid var(--app-grouped-list-separator-color);
}
.file-list-container {
  flex: 1;
  min-block-size: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  border-radius: 0;
}
.file-row {
  min-block-size: 3.625rem;
  padding-inline: 1rem 0.25rem;
  border-block-end: 1px solid var(--app-grouped-list-separator-color);
  border-radius: 0;
  display: grid;
  align-items: center;
  cursor: pointer;
}
.file-row :deep(.v-list-item__content) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 6rem 10rem;
  align-items: center;
  gap: 1rem;
}
.file-row :deep(.v-list-item__append) {
  inline-size: 2.75rem;
  margin-inline-start: 1rem;
  justify-content: center;
}
.file-row:hover,
.file-row:focus-visible,
.file-row--active {
  border-radius: var(--app-control-radius);
}
.file-row--active {
  background: var(--app-grouped-list-active-background);
}
.file-row__name {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-inline-size: 0;
}
.file-row__name > span {
  font-size: 0.875rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.file-row__name :deep(.v-input) {
  flex: 0 0 auto;
}
.file-row__size,
.file-row__time {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.file-list__inspector {
  flex: 0 0 32%;
  min-inline-size: 16rem;
  border-inline-start: 1px solid var(--app-grouped-list-separator-color);
}
.file-list__content--file .file-list__inspector {
  flex: 1;
  max-inline-size: 48rem;
  margin-inline: auto;
  border-inline-start: 0;
}
.file-list__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
@container file-list (width < 900px) {
  .file-list__content--detail .file-row :deep(.v-list-item__content) {
    grid-template-columns: minmax(0, 1fr) 5rem;
  }
  .file-list__content--detail .file-list__columns {
    grid-template-columns: minmax(0, 1fr) 5rem 2.75rem;
  }
  .file-list__content--detail .file-row__time,
  .file-list__content--detail .file-list__columns > span:nth-child(3) {
    display: none;
  }
}
@media (width < 960px) {
  .file-list__toolbar {
    flex-wrap: nowrap;
    gap: 0.375rem;
    padding-block-end: 0.5rem;
  }
  .file-list__filter {
    flex: 1;
  }
  .file-list__toolbar :deep(.v-btn) {
    min-inline-size: 2rem;
    inline-size: 2rem;
    padding-inline: 0;
  }
  .file-list__tree,
  .file-list__select-label {
    display: none;
  }
  .file-list__columns {
    grid-template-columns: minmax(0, 1fr) 3.75rem 5rem 2rem;
    padding-inline: 0.5rem 0;
    gap: 0.375rem;
    font-size: 0.75rem;
  }
  .file-row {
    min-block-size: 3.25rem;
    padding-inline: 0.5rem 0;
  }
  .file-row :deep(.v-list-item__content) {
    grid-template-columns: minmax(0, 1fr) 3.75rem 5rem;
    gap: 0.375rem;
  }
  .file-row :deep(.v-list-item__append) {
    inline-size: 2rem;
    margin-inline-start: 0.375rem;
  }
  .file-row__name {
    gap: 0.375rem;
  }
  .file-row__name > span {
    white-space: normal;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  .file-row__name :deep(.v-icon) {
    font-size: 1.25rem;
  }
  .file-row__size,
  .file-row__time {
    font-size: 0.6875rem;
  }
  .file-row :deep(.v-list-item__append .v-btn) {
    inline-size: 2rem;
  }
}
@media (width < 360px) {
  .file-list__columns {
    grid-template-columns: minmax(0, 1fr) 3.75rem 2rem;
  }
  .file-row :deep(.v-list-item__content) {
    grid-template-columns: minmax(0, 1fr) 3.75rem;
  }
  .file-row__time,
  .file-list__columns > span:nth-child(3) {
    display: none;
  }
}
</style>
<style lang="scss">
.file-browser-sheet.v-overlay__content {
  align-self: flex-end;
  margin: 0 !important;
  inline-size: 100% !important;
  max-block-size: calc(100dvh - env(safe-area-inset-top, 0px) - 1rem) !important;
}
.file-browser-sheet__surface {
  overflow: hidden;
  min-block-size: 0;
  max-block-size: inherit;
  border-end-start-radius: var(--app-vuetify-rounded-0) !important;
  border-end-end-radius: var(--app-vuetify-rounded-0) !important;
  padding-block-end: env(safe-area-inset-bottom, 0px);
}
.file-browser-sheet .file-details {
  max-block-size: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem);
}
</style>
