<script lang="ts" setup>
import CryptoJS from 'crypto-js'
import { useToast } from 'vue-toastification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import { transferTypeOptions } from '@/api/constants'
import {
  ApiResponse,
  FileItem,
  ManualTransferPayload,
  ManualTransferPreviewData,
  ManualTransferPreviewItem,
  StorageConf,
  TransferDirectoryConf,
  TransferForm,
} from '@/api/types'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackgroundOptimization()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  logids: Array<number>,
  items: Array<FileItem>,
  target_storage: String,
  target_path: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前识别类型
const mediaSource = ref(globalSettings.RECOGNIZE_SOURCE || 'themoviedb')

// 定义事件
const emit = defineEmits(['done', 'close'])

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: `${t('dialog.subscribeEdit.seasonFormat', { number: item })}`,
    value: item,
  })),
)

// 提示框
const $toast = useToast()

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 进度是否激活
const progressActive = ref(false)

// 整理进度条
const progressDialog = ref(false)

// 整理进度文本
const progressText = ref(t('dialog.reorganize.processing'))

// 整理进度
const progressValue = ref(0)

// 进度SSE连接
const progressSSE = ref<any>(null)

// 预览加载状态
const previewLoading = ref(false)

// 预览面板显隐
const previewVisible = ref(false)

// 是否已加载预览
const previewLoaded = ref(false)

// 预览数据
const previewData = ref<ManualTransferPreviewData>()

function getFileItemKey(item?: FileItem) {
  return [item?.storage ?? '', item?.type ?? '', item?.path ?? ''].join('|')
}

function dedupeFileItems(fileItems?: FileItem[]) {
  if (!fileItems?.length) return []

  const uniqueItems = new Map<string, FileItem>()
  fileItems.forEach(item => {
    uniqueItems.set(getFileItemKey(item), item)
  })

  return Array.from(uniqueItems.values())
}

function getPreviewItemKey(item: ManualTransferPreviewItem) {
  return [item.source ?? '', item.target ?? '', item.success === false ? 'failed' : 'success'].join('|')
}

const normalizedItems = computed(() => dedupeFileItems(props.items))

// 分页
const previewPage = ref(1)
const previewPageSize = ref(10)

// 预览列表主体元素
const previewFileBodyRef = ref<HTMLElement>()

// 预览列表尺寸观察器
let previewFileBodyResizeObserver: ResizeObserver | undefined

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
const storageOptions = computed(() => {
  return storages.value.map(item => ({
    title: item.name,
    value: item.type,
  }))
})

// 标题
const dialogTitle = computed(() => {
  return t('dialog.reorganize.manualTitle')
})

// 副标题
const dialogSubtitle = computed(() => {
  if (normalizedItems.value.length) {
    if (normalizedItems.value.length > 1) {
      return t('dialog.reorganize.multipleItemsTitle', { count: normalizedItems.value.length })
    }

    return t('dialog.reorganize.singleItemTitle', { path: normalizedItems.value[0].path })
  } else if (props.logids) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.logids.length })
  }
})
// 禁用指定集数
const disableEpisodeDetail = computed(() => {
  if (normalizedItems.value.length) {
    if (transferForm.episode_format) return false
    return !(normalizedItems.value.length === 1 && normalizedItems.value[0].type !== 'dir')
  }
})

// 表单
const transferForm = reactive<TransferForm>({
  fileitem: {} as FileItem,
  logid: 0,
  target_storage: props.target_storage ?? 'local',
  target_path: props.target_path ?? '',
  transfer_type: '',
  min_filesize: 0,
  scrape: false,
  from_history: false,
})

// 所有媒体库目录
const directories = ref<TransferDirectoryConf[]>([])

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 目的目录下拉框
const targetDirectories = computed(() => {
  const libraryDirectories = directories.value.map(item => item.library_path)
  return [...new Set(libraryDirectories)]
})

// 监听目的路径变化，配置默认值
watch(
  () => transferForm.target_path,
  async newPath => {
    if (newPath) {
      const directory = directories.value.find(item => item.library_path === newPath)
      if (directory) {
        transferForm.target_storage = directory.library_storage ?? 'local'
        transferForm.transfer_type = transferForm.transfer_type || directory.transfer_type
        transferForm.scrape = directory.scraping ?? false
        transferForm.library_category_folder = directory.library_category_folder ?? false
        transferForm.library_type_folder = directory.library_type_folder ?? false
      } else {
        transferForm.transfer_type = transferForm.transfer_type || 'copy'
        transferForm.scrape = false
        transferForm.library_category_folder = false
        transferForm.library_type_folder = false
      }
    } else {
      // 路径为空时, 恢复到`自动`条件
      transferForm.transfer_type = ''
      transferForm.library_type_folder = undefined
      transferForm.library_category_folder = undefined
    }
  },
)

// 过滤后的预览数据
const filteredPreviewItems = computed(() => {
  return previewData.value?.items ?? []
})

// 分页后的预览数据（含文件名解析）
const pagedPreviewRows = computed(() => {
  const start = (previewPage.value - 1) * previewPageSize.value
  return filteredPreviewItems.value.slice(start, start + previewPageSize.value).map(item => {
    const sourceName = getFileName(item.source)
    const targetName = getFileName(item.target)
    return {
      ...item,
      sourceName,
      targetName,
      sameName: sourceName === targetName,
    }
  })
})

// 预览统计
const previewSummary = computed(() => {
  return (
    previewData.value?.summary ?? {
      total: 0,
      success: 0,
      failed: 0,
    }
  )
})

// 分页总数
const previewTotalPages = computed(() => {
  return Math.ceil(filteredPreviewItems.value.length / previewPageSize.value)
})

// 标准化路径
function normalizePath(path?: string) {
  return (path || '').replace(/\\/g, '/')
}

// 获取文件名
function getFileName(path?: string) {
  const normalizedPath = normalizePath(path).replace(/\/+$/, '')
  if (!normalizedPath) return '-'
  return normalizedPath.split('/').pop() || normalizedPath
}

// 获取唯一非空值
function getUniqueValues(values: (string | undefined)[]) {
  return [...new Set(values.map(item => item?.trim()).filter(Boolean) as string[])]
}

// 统一解析接口返回的数字字段，兼容 string/number
function toPreviewNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// 从路径或文件名中回退提取季号
function extractSeasonFromText(text?: string) {
  if (!text) return undefined

  const patterns = [/S(\d{1,2})E\d{1,4}/i, /Season[\s._-]*(\d{1,2})/i, /第\s*(\d{1,2})\s*季/i]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const season = toPreviewNumber(match[1])
      if (season !== undefined) return season
    }
  }

  return undefined
}

// 获取预览项季号，优先使用响应字段，缺失时从目标/源路径回退提取
function getPreviewSeasonNumber(item: ManualTransferPreviewItem) {
  const season = toPreviewNumber(item.season)
  if (season !== undefined) return season

  return (
    extractSeasonFromText(item.target) ??
    extractSeasonFromText(item.target_dir) ??
    extractSeasonFromText(item.source) ??
    (toPreviewNumber(item.episode) !== undefined && !previewIsMovie.value ? 1 : undefined)
  )
}

// 顶部媒体信息
const previewMediaInfo = computed(() => {
  const titles = getUniqueValues(filteredPreviewItems.value.map(item => item.title))
  const types = getUniqueValues(filteredPreviewItems.value.map(item => item.type))

  const titleText = titles.length <= 1 ? titles[0] || '-' : `${titles[0]} +${titles.length - 1}`
  const typeText = types.length <= 1 ? types[0] || t('common.unknown') : types.join(' / ')

  return {
    title: titleText,
    type: typeText,
  }
})

// 是否为电影
const previewIsMovie = computed(() => {
  const type = previewMediaInfo.value.type.toLowerCase()
  return type === '电影' || type === 'movie'
})

// 顶部季信息
const previewSeasonText = computed(() => {
  const seasons = [
    ...new Set(
      filteredPreviewItems.value
        .map(item => getPreviewSeasonNumber(item))
        .filter((season): season is number => season !== undefined && season !== null),
    ),
  ]

  if (seasons.length === 0) return '-'

  const seasonLabels = seasons.sort((a, b) => a - b).map(season => `S${String(season).padStart(2, '0')}`)

  if (seasonLabels.length === 1) return seasonLabels[0]
  return `${seasonLabels[0]} +${seasonLabels.length - 1}`
})

// 顶部总集数
const previewEpisodeCountText = computed(() => {
  const episodeKeys = new Set<string>()

  filteredPreviewItems.value.forEach(item => {
    const season = getPreviewSeasonNumber(item) ?? 1
    const episode = toPreviewNumber(item.episode)
    const episodeEnd = toPreviewNumber(item.episode_end) ?? episode

    if (episode === undefined) return

    for (let currentEpisode = episode; currentEpisode <= (episodeEnd ?? episode); currentEpisode++) {
      episodeKeys.add(`${season}-${currentEpisode}`)
    }
  })

  if (episodeKeys.size > 0) return String(episodeKeys.size)
  if (filteredPreviewItems.value.length > 0) return String(filteredPreviewItems.value.length)
  return '-'
})

// 文件列表
const previewFileRows = computed(() => {
  return filteredPreviewItems.value.map(item => {
    const sourceName = getFileName(item.source)
    const targetName = getFileName(item.target)

    return {
      sourceName,
      targetName,
      sameName: sourceName === targetName,
      success: item.success,
      message: item.message || '-',
      source: item.source,
      target: item.target,
    }
  })
})

// 是否需要拓宽窗口
const previewNeedsWideLayout = computed(() => {
  const candidates = [...previewFileRows.value.map(item => `${item.sourceName}${item.targetName}`)]

  return candidates.some(item => item.length > 72)
})

// 弹窗宽度
const dialogMaxWidth = computed(() => {
  if (!display.mdAndUp.value) return '100%'

  if (!previewVisible.value) return 'min(45rem, calc(100vw - 2rem))'

  const preferredWidth = previewNeedsWideLayout.value ? '126rem' : '110rem'
  return `min(${preferredWidth}, calc(100vw - 2rem))`
})

// 预览按钮图标
const previewToggleIcon = computed(() => {
  return previewVisible.value ? 'mdi-eye-off-outline' : 'mdi-eye-outline'
})

// 构造整理请求
function createTransferPayload(options: { item?: FileItem; logid?: number; preview?: boolean }) {
  const payload: ManualTransferPayload = {
    ...transferForm,
    fileitem: options.item ?? ({} as FileItem),
    logid: options.logid ?? 0,
  }

  if (options.preview) payload.preview = true
  return payload
}

// 请求整理接口
async function requestManualTransfer<T = any>(
  payload: ManualTransferPayload,
  background: boolean = false,
): Promise<ApiResponse<T>> {
  return await api.post(`transfer/manual?background=${background}`, payload)
}

// 默认预览数据
function getDefaultPreviewData(): ManualTransferPreviewData {
  return {
    summary: {
      total: 0,
      success: 0,
      failed: 0,
    },
    items: [],
    message: '',
  }
}

function resetPreviewState() {
  previewData.value = undefined
  previewLoaded.value = false
  previewPage.value = 1
}

function previewHasFailures(data?: ManualTransferPreviewData) {
  if (!data) return false

  return (data.summary.failed ?? 0) > 0 || (data.items ?? []).some(item => item.success === false)
}

function getPreviewResultSummaryMessage(data?: ManualTransferPreviewData) {
  const success = data?.summary.success ?? 0
  const failed = data?.summary.failed ?? 0

  return [
    t('dialog.reorganize.previewSuccess', { count: success }),
    t('dialog.reorganize.previewFailed', { count: failed }),
  ].join('，')
}

function createFailedPreviewData(options: { source?: string; type?: string; title?: string; message?: string }) {
  const failedItem: ManualTransferPreviewItem = {
    source: options.source,
    target: '',
    success: false,
    message: options.message || t('dialog.reorganize.previewRequestFailed'),
    type: options.type,
    title: options.title,
  }

  return {
    summary: {
      total: 1,
      success: 0,
      failed: 1,
    },
    items: [failedItem],
    message: failedItem.message,
  } satisfies ManualTransferPreviewData
}

// 合并多次预览结果
function mergePreviewData(target: ManualTransferPreviewData, incoming?: ManualTransferPreviewData) {
  if (!incoming) return

  const mergedItems = [...(target.items ?? [])]
  const existingItemKeys = new Set(mergedItems.map(item => getPreviewItemKey(item)))

  ;(incoming.items ?? []).forEach(item => {
    const itemKey = getPreviewItemKey(item)
    if (existingItemKeys.has(itemKey)) return

    existingItemKeys.add(itemKey)
    mergedItems.push(item)
  })

  target.items = mergedItems
  target.summary.total = mergedItems.length
  target.summary.success = mergedItems.filter(item => item.success !== false).length
  target.summary.failed = mergedItems.filter(item => item.success === false).length

  if (incoming.message) {
    target.message = [target.message, incoming.message].filter(Boolean).join('；')
  }
}

// 预览整理结果
async function previewTransfer() {
  if (!props.logids && !normalizedItems.value.length) return

  previewLoading.value = true
  resetPreviewState()

  const mergedPreviewData = getDefaultPreviewData()

  try {
    const tasks: Promise<void>[] = []

    if (normalizedItems.value.length) {
      tasks.push(
        ...normalizedItems.value.map(async item => {
          try {
            const result = await requestManualTransfer<ManualTransferPreviewData>(
              createTransferPayload({ item, preview: true }),
            )
            if (!result.success) {
              mergePreviewData(
                mergedPreviewData,
                createFailedPreviewData({
                  source: item.path || item.name,
                  type: item.type,
                  title: item.name,
                  message: result.message || t('dialog.reorganize.previewRequestFailed'),
                }),
              )
              return
            }

            mergePreviewData(mergedPreviewData, result.data)
          } catch (err: any) {
            console.warn(`预览请求异常: ${err?.message}`)
            mergePreviewData(
              mergedPreviewData,
              createFailedPreviewData({
                source: item.path || item.name,
                type: item.type,
                title: item.name,
                message: `${item.name || item.path}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
              }),
            )
          }
        }),
      )
    }

    if (props.logids) {
      tasks.push(
        ...props.logids.map(async logid => {
          try {
            const result = await requestManualTransfer<ManualTransferPreviewData>(
              createTransferPayload({ logid, preview: true }),
            )
            if (!result.success) {
              mergePreviewData(
                mergedPreviewData,
                createFailedPreviewData({
                  source: `历史记录 ${logid}`,
                  message: result.message || t('dialog.reorganize.previewRequestFailed'),
                }),
              )
              return
            }

            mergePreviewData(mergedPreviewData, result.data)
          } catch (err: any) {
            console.warn(`预览请求异常: ${err?.message}`)
            mergePreviewData(
              mergedPreviewData,
              createFailedPreviewData({
                source: `历史记录 ${logid}`,
                message: `历史记录 ${logid}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
              }),
            )
          }
        }),
      )
    }

    await Promise.all(tasks)

    previewData.value = mergedPreviewData
    previewLoaded.value = true
    nextTick(() => updatePreviewPageSize())

    if (previewHasFailures(mergedPreviewData)) {
      $toast.warning(getPreviewResultSummaryMessage(mergedPreviewData))
    }
  } catch (error: any) {
    previewVisible.value = false
    resetPreviewState()
    $toast.error(error?.message || t('dialog.reorganize.previewRequestFailed'))
  } finally {
    previewLoading.value = false
  }
}

async function togglePreview() {
  if (previewLoading.value) return

  if (previewVisible.value) {
    previewVisible.value = false
    return
  }

  previewVisible.value = true
  await previewTransfer()
}

// 根据可用高度自动计算每页条数，保持统一行高
function updatePreviewPageSize() {
  const bodyHeight = previewFileBodyRef.value?.clientHeight ?? 0
  if (bodyHeight <= 0) return

  const firstRow = previewFileBodyRef.value?.querySelector('.preview-file-row')
  const rowHeight = firstRow?.getBoundingClientRect().height ?? 46
  const pageSize = Math.max(1, Math.floor(bodyHeight / rowHeight))
  previewPageSize.value = pageSize

  const totalPages = Math.max(1, Math.ceil(filteredPreviewItems.value.length / pageSize))
  if (previewPage.value > totalPages) {
    previewPage.value = totalPages
  }
}

// 启动预览列表高度监听
function setupPreviewFileBodyObserver() {
  previewFileBodyResizeObserver?.disconnect()

  if (!previewFileBodyRef.value || typeof ResizeObserver === 'undefined') return

  previewFileBodyResizeObserver = new ResizeObserver(() => {
    updatePreviewPageSize()
  })
  previewFileBodyResizeObserver.observe(previewFileBodyRef.value)
}

watch([() => previewLoaded.value, () => previewVisible.value], ([loaded, visible]) => {
  if (loaded && visible) {
    nextTick(() => {
      setupPreviewFileBodyObserver()
      updatePreviewPageSize()
    })
  } else {
    previewFileBodyResizeObserver?.disconnect()
  }
})

// 整理文件
async function handleTransfer(item: FileItem, background: boolean = false) {
  try {
    const result: { [key: string]: any } = await requestManualTransfer(createTransferPayload({ item }), background)
    if (!result.success) $toast.error(result.message)
    else if (background) $toast.success(t('dialog.reorganize.successMessage', { name: item.name }))
  } catch (e) {
    console.log(e)
  }
}

// 整理日志
async function handleTransferLog(logid: number, background: boolean = false) {
  try {
    const result: { [key: string]: any } = await requestManualTransfer(createTransferPayload({ logid }), background)
    if (!result.success) $toast.error(result.message)
    else if (background) $toast.success(`历史记录 ${logid} 已加入整理队列！`)
  } catch (e) {
    console.log(e)
  }
}

// 进度SSE消息处理函数
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text
    progressValue.value = progress.value
  }
}

// 使用SSE监听加载进度
function startLoadingProgress(key: string) {
  progressText.value = t('dialog.reorganize.processing')
  progressActive.value = true

  // 如果已经有连接，先停止
  if (progressSSE.value) {
    progressSSE.value.stop()
  }

  const url = `${import.meta.env.VITE_API_BASE_URL}system/progress/${key}`

  // 创建新的SSE连接
  progressSSE.value = useProgressSSE(url, handleProgressMessage, `reorganize-progress-${key}`, progressActive)

  progressSSE.value.start()
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  if (progressSSE.value) {
    progressSSE.value.stop()
    progressSSE.value = null
  }
}

// 整理文件
async function transfer(background: boolean = false) {
  if (!props.logids && !normalizedItems.value.length) return

  // 显示进度条
  progressDialog.value = true

  // 文件整理
  if (normalizedItems.value.length) {
    for (const item of normalizedItems.value) {
      if (!background) {
        // 如果是文件，计算MD5
        const key = item.type === 'dir' ? 'filetransfer' : CryptoJS.MD5(item.path).toString()

        // 开始监听进度
        startLoadingProgress(key)
      }
      await handleTransfer(item, background)
    }
  }

  // 日志整理
  if (props.logids) {
    if (!background) {
      // 为日志整理任务开启进度监听
      startLoadingProgress('filetransfer')
    }
    for (const logid of props.logids) {
      await handleTransferLog(logid, background)
    }
  }
  if (!background) {
    // 停止监听进度
    stopLoadingProgress()
  }

  // 关闭进度条
  progressDialog.value = false
  // 重新加载
  emit('done')
}

onMounted(() => {
  loadDirectories()
  loadStorages()
})

onUnmounted(() => {
  stopLoadingProgress()
  previewFileBodyResizeObserver?.disconnect()
})
</script>

<template>
  <VDialog :scrollable="!previewVisible || !display.mdAndUp.value" :max-width="dialogMaxWidth" :fullscreen="!display.mdAndUp.value">
    <VCard class="reorganize-dialog-card" :class="{ 'reorganize-dialog-card--split': previewVisible && display.mdAndUp.value }">
      <VCardItem class="py-2">
        <template #prepend> <VIcon icon="mdi-folder-move" class="me-2" /> </template>
        <VCardTitle>{{ dialogTitle }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="pa-0 reorganize-dialog-card__body">
        <div class="reorganize-main-row" :class="{ 'reorganize-main-row--preview-visible': previewVisible }">
          <div class="reorganize-form-pane">
            <div class="reorganize-form-pane__content pa-6">
              <VForm @submit.prevent="() => {}">
                <VRow>
                  <VCol cols="12" md="6">
                    <VSelect
                      v-model="transferForm.target_storage"
                      :items="storageOptions"
                      :label="t('dialog.reorganize.targetStorage')"
                      :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                      :hint="t('dialog.reorganize.targetStorageHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-harddisk"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSelect
                      v-model="transferForm.transfer_type"
                      :label="t('dialog.reorganize.transferType')"
                      :items="transferTypeOptions"
                      :hint="t('dialog.reorganize.transferTypeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-swap-horizontal"
                    >
                      <template v-slot:selection="{ item }">
                        {{ transferForm.transfer_type === '' ? t('dialog.reorganize.auto') : item.title }}
                      </template>
                    </VSelect>
                  </VCol>
                  <VCol cols="12">
                    <VCombobox
                      v-model="transferForm.target_path"
                      :items="targetDirectories"
                      :label="t('dialog.reorganize.targetPath')"
                      :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                      :hint="t('dialog.reorganize.targetPathHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-folder-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6">
                    <VSelect
                      v-model="transferForm.type_name"
                      :label="t('dialog.reorganize.mediaType')"
                      :items="[
                        { title: t('dialog.reorganize.auto'), value: '' },
                        { title: t('dialog.reorganize.movie'), value: '电影' },
                        { title: t('dialog.reorganize.tv'), value: '电视剧' },
                      ]"
                      :hint="t('dialog.reorganize.mediaTypeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-movie-open"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-if="mediaSource === 'themoviedb'"
                      v-model="transferForm.tmdbid"
                      :disabled="transferForm.type_name === ''"
                      :label="t('dialog.reorganize.tmdbId')"
                      :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
                      :rules="[numberValidator]"
                      append-inner-icon="mdi-magnify"
                      :hint="t('dialog.reorganize.mediaIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-identifier"
                      @click:append-inner="mediaSelectorDialog = true"
                    />
                    <VTextField
                      v-else
                      v-model="transferForm.doubanid"
                      :disabled="transferForm.type_name === ''"
                      :label="t('dialog.reorganize.doubanId')"
                      :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
                      :rules="[numberValidator]"
                      append-inner-icon="mdi-magnify"
                      :hint="t('dialog.reorganize.mediaIdHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-identifier"
                      @click:append-inner="mediaSelectorDialog = true"
                    />
                  </VCol>
                </VRow>
                <VRow v-show="transferForm.type_name === '电视剧'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="transferForm.episode_group"
                      :label="t('dialog.reorganize.episodeGroup')"
                      :placeholder="t('dialog.reorganize.episodeGroupPlaceholder')"
                      :hint="t('dialog.reorganize.episodeGroupHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-view-list"
                    />
                  </VCol>
                  <VCol cols="12" md="3">
                    <VSelect
                      v-model.number="transferForm.season"
                      :label="t('dialog.reorganize.season')"
                      :items="seasonItems"
                      :hint="t('dialog.reorganize.seasonHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-calendar"
                    />
                  </VCol>
                  <VCol cols="12" md="3">
                    <VTextField
                      v-model="transferForm.episode_detail"
                      :disabled="disableEpisodeDetail"
                      :label="t('dialog.reorganize.episodeDetail')"
                      :placeholder="t('dialog.reorganize.episodeDetailPlaceholder')"
                      :hint="t('dialog.reorganize.episodeDetailHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-playlist-play"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="transferForm.episode_format"
                      :label="t('dialog.reorganize.episodeFormat')"
                      :placeholder="t('dialog.reorganize.episodeFormatPlaceholder')"
                      :hint="t('dialog.reorganize.episodeFormatHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-format-text"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="transferForm.episode_offset"
                      :label="t('dialog.reorganize.episodeOffset')"
                      :placeholder="t('dialog.reorganize.episodeOffsetPlaceholder')"
                      :hint="t('dialog.reorganize.episodeOffsetHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-numeric"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="transferForm.episode_part"
                      :label="t('dialog.reorganize.episodePart')"
                      :placeholder="t('dialog.reorganize.episodePartPlaceholder')"
                      :hint="t('dialog.reorganize.episodePartHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-file-multiple"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model.number="transferForm.min_filesize"
                      :label="t('dialog.reorganize.minFileSize')"
                      :rules="[numberValidator]"
                      placeholder="0"
                      :hint="t('dialog.reorganize.minFileSizeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-file-document-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6" v-if="transferForm.target_path">
                    <VSwitch
                      v-model="transferForm.library_type_folder"
                      :label="t('dialog.reorganize.typeFolderOption')"
                      :hint="t('dialog.reorganize.typeFolderHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="6" v-if="transferForm.target_path">
                    <VSwitch
                      v-model="transferForm.library_category_folder"
                      :label="t('dialog.reorganize.categoryFolderOption')"
                      :hint="t('dialog.reorganize.categoryFolderHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="transferForm.scrape"
                      :label="t('dialog.reorganize.scrapeOption')"
                      :hint="t('dialog.reorganize.scrapeHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="6" v-if="props.logids">
                    <VSwitch
                      v-model="transferForm.from_history"
                      :label="t('dialog.reorganize.fromHistoryOption')"
                      :hint="t('dialog.reorganize.fromHistoryHint')"
                      persistent-hint
                    />
                  </VCol>
                </VRow>
              </VForm>
              <VCardActions class="reorganize-form-pane__actions pt-3 px-0 pb-0">
                <VBtn
                  color="info"
                  :variant="previewVisible ? 'tonal' : 'text'"
                  @click="togglePreview"
                  :prepend-icon="previewToggleIcon"
                  class="reorganize-action-btn reorganize-action-btn--preview"
                  :class="{ 'reorganize-action-btn--active': previewVisible }"
                  :loading="previewLoading"
                >
                  {{ t('dialog.reorganize.previewResult') }}
                </VBtn>
                <VBtn
                  color="success"
                  @click="transfer(true)"
                  prepend-icon="mdi-plus"
                  class="reorganize-action-btn reorganize-action-btn--queue"
                >
                  {{ t('dialog.reorganize.addToQueue') }}
                </VBtn>
                <VBtn
                  @click="transfer(false)"
                  prepend-icon="mdi-arrow-right-bold"
                  class="reorganize-action-btn reorganize-action-btn--primary"
                >
                  {{ t('dialog.reorganize.reorganizeNow') }}
                </VBtn>
              </VCardActions>
            </div>
          </div>
          <div v-show="previewVisible" class="reorganize-preview-pane">
            <div class="reorganize-preview-pane__header">
              <div class="reorganize-preview-pane__title-block">
                <div class="reorganize-preview-pane__title-row">
                  <div class="text-h6">{{ t('dialog.reorganize.previewTitle') }}</div>
                  <div v-if="previewLoaded" class="preview-title-stats">
                    <VChip color="primary" variant="tonal" size="small">
                      {{ t('dialog.reorganize.previewTotal', { count: previewSummary.total }) }}
                    </VChip>
                    <VChip color="success" variant="tonal" size="small">
                      {{ t('dialog.reorganize.previewSuccess', { count: previewSummary.success }) }}
                    </VChip>
                    <VChip color="error" variant="tonal" size="small">
                      {{ t('dialog.reorganize.previewFailed', { count: previewSummary.failed }) }}
                    </VChip>
                  </div>
                </div>
                <div class="text-body-2 text-medium-emphasis mt-2">
                  {{ t('dialog.reorganize.previewSubtitle') }}
                </div>
              </div>
            </div>
            <div class="reorganize-preview-pane__body">
              <div v-if="previewLoading" class="reorganize-preview-pane__loading">
                <VProgressCircular indeterminate color="info" />
                <div class="text-body-2 text-medium-emphasis mt-3">{{ t('dialog.reorganize.previewLoading') }}</div>
              </div>
              <template v-else-if="previewLoaded">
                <div class="reorganize-preview-pane__scroll">
                  <div class="reorganize-preview-pane__summary">
                    <div v-if="previewData?.message" class="preview-note">
                      {{ previewData.message }}
                    </div>
                    <div class="preview-summary-grid">
                      <div class="preview-overview-card">
                        <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewMediaName') }}</span>
                        <span class="preview-overview-card__value">{{ previewMediaInfo.title }}</span>
                      </div>
                      <div class="preview-overview-card">
                        <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewMediaType') }}</span>
                        <span class="preview-overview-card__value">{{ previewMediaInfo.type }}</span>
                      </div>
                      <div v-if="!previewIsMovie" class="preview-overview-card">
                        <span class="preview-overview-card__label">{{
                          t('dialog.reorganize.previewSeasonLabel')
                        }}</span>
                        <span class="preview-overview-card__value">{{ previewSeasonText }}</span>
                      </div>
                      <div v-if="!previewIsMovie" class="preview-overview-card">
                        <span class="preview-overview-card__label">{{
                          t('dialog.reorganize.previewEpisodeCount')
                        }}</span>
                        <span class="preview-overview-card__value">{{ previewEpisodeCountText }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="reorganize-preview-list">
                    <div v-if="pagedPreviewRows.length" ref="previewFileBodyRef" class="preview-file-body">
                      <div
                        v-for="(item, index) in pagedPreviewRows"
                        :key="`${item.source}-${item.target}-${index}`"
                        class="preview-file-row"
                        :class="{ 'preview-file-row--failed': item.success === false }"
                      >
                        <div class="preview-file-row__card preview-file-row__card--source">
                          <span class="preview-file-row__label">{{ t('dialog.reorganize.previewBeforeColumn') }}</span>
                          <span class="preview-file-row__name">{{ item.sourceName }}</span>
                          <span class="preview-file-row__path">{{ item.source || '-' }}</span>
                        </div>
                        <div class="preview-file-row__arrow">
                          <VIcon icon="mdi-arrow-right" size="18" />
                        </div>
                        <div class="preview-file-row__card preview-file-row__card--target">
                          <span class="preview-file-row__label">{{ t('dialog.reorganize.previewAfterColumn') }}</span>
                          <span class="preview-file-row__name">{{ item.targetName }}</span>
                          <span class="preview-file-row__path">{{ item.target || '-' }}</span>
                          <span v-if="item.success === false && item.message" class="preview-file-row__message">
                            {{ item.message }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div v-else class="reorganize-preview-list__empty">
                      {{ t('dialog.reorganize.noPreviewData') }}
                    </div>
                  </div>
                  <div v-if="previewTotalPages > 1" class="reorganize-preview-pane__pagination">
                    <VBtn
                      size="x-small"
                      icon="mdi-chevron-left"
                      variant="text"
                      :disabled="previewPage <= 1"
                      @click="previewPage--"
                    />
                    <span class="text-caption">{{ previewPage }} / {{ previewTotalPages }}</span>
                    <VBtn
                      size="x-small"
                      icon="mdi-chevron-right"
                      variant="text"
                      :disabled="previewPage >= previewTotalPages"
                      @click="previewPage++"
                    />
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>
    <!-- 手动整理进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
    <!-- TMDB ID搜索框 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-if="mediaSource === 'themoviedb'"
        v-model="transferForm.tmdbid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
      <MediaIdSelector
        v-else
        v-model="transferForm.doubanid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
    </VDialog>
  </VDialog>
</template>

<style lang="scss" scoped>
.reorganize-dialog-card {
  max-block-size: min(92vh, 64rem);
}

.reorganize-dialog-card__body {
  min-block-size: 0;
}

.reorganize-dialog-card--split {
  display: flex;
  flex-direction: column;
  block-size: min(92vh, 64rem);
}

.reorganize-dialog-card--split .reorganize-dialog-card__body {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1 1 auto;
}

.reorganize-dialog-card--split .reorganize-main-row {
  flex: 1 1 auto;
  block-size: 100%;
}

.reorganize-main-row {
  display: grid;
  overflow: hidden;
  align-items: stretch;
  grid-template-columns: minmax(0, 1fr);
  min-block-size: 0;
  inline-size: 100%;
  transition: grid-template-columns 0.25s ease;
}

.reorganize-main-row--preview-visible {
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
}

.reorganize-form-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-block-size: 0;
  max-inline-size: none;
  min-inline-size: 0;
}

.reorganize-main-row--preview-visible .reorganize-form-pane {
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.reorganize-form-pane__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
}

.reorganize-dialog-card--split .reorganize-form-pane,
.reorganize-dialog-card--split .reorganize-preview-pane {
  block-size: 100%;
}

.reorganize-dialog-card--split .reorganize-form-pane__content {
  overflow: auto;
}

.reorganize-form-pane__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-block-start: auto;
}

.reorganize-action-btn {
  min-inline-size: 0;
}

.reorganize-action-btn--active {
  background: rgba(var(--v-theme-info), 0.12);
}

.reorganize-preview-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.reorganize-preview-pane__header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 1rem;
  padding-block: 1.5rem 1rem;
  padding-inline: 1.5rem;
}

.reorganize-preview-pane__title-block {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.reorganize-preview-pane__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.reorganize-preview-pane__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  min-block-size: 0;
}

.preview-title-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-inline-size: 0;
}

.reorganize-preview-pane__summary {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.875rem;
  padding-block-start: 1.25rem;
  padding-inline: 1.5rem;
}

.preview-note {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 1rem;
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
  line-height: 1.5;
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

.preview-summary-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preview-overview-card {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 1rem;
  gap: 0.375rem;
  min-inline-size: 0;
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

.preview-overview-card__label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: nowrap;
}

.preview-overview-card__value {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9375rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reorganize-preview-pane__scroll {
  display: flex;
  overflow: hidden auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1rem;
  min-block-size: 0;
  padding-block-end: 1rem;
}

.reorganize-preview-pane__pagination {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding-block: 0 1rem;
  padding-inline: 1rem;
}

.reorganize-preview-pane__loading {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: 2rem;
  padding-inline: 1.5rem;
  text-align: center;
}

.reorganize-preview-list {
  display: flex;
  overflow: visible;
  flex: 0 0 auto;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 1rem;
  margin-block-end: 1.5rem;
  margin-inline: 1.5rem;
  min-block-size: 0;
  min-inline-size: 0;
}

.preview-file-body {
  display: flex;
  overflow: visible;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
  min-inline-size: 0;
  padding-block: 1rem;
  padding-inline: 1rem;
}

.preview-file-row {
  display: grid;
  align-items: center;
  gap: 0.875rem;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  min-block-size: 5.25rem;
  min-inline-size: 0;
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

.preview-file-row + .preview-file-row {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.preview-file-row--failed {
  background: rgba(var(--v-theme-error), 0.04);
}

.preview-file-row__card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-inline-size: 0;
}

.preview-file-row__label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.preview-file-row__name {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.95rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-file-row__path {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-file-row__card--target .preview-file-row__name {
  color: rgb(var(--v-theme-primary));
}

.preview-file-row--failed .preview-file-row__card--target .preview-file-row__name {
  color: rgb(var(--v-theme-error));
}

.preview-file-row__message {
  color: rgb(var(--v-theme-error));
  font-size: 0.8125rem;
  line-height: 1.4;
}

.preview-file-row__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  block-size: 2rem;
  color: rgb(var(--v-theme-info));
  inline-size: 2rem;
}

.reorganize-preview-list__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  padding-block: 2rem;
  padding-inline: 1rem;
  text-align: center;
}

@media (width <= 1200px) {
  .reorganize-preview-pane__header {
    flex-direction: column;
    align-items: stretch;
  }

  .preview-summary-grid {
    grid-template-columns: 1fr;
  }

  .preview-file-row {
    grid-template-columns: 1fr;
  }

  .preview-file-row__arrow {
    justify-self: start;
    transform: rotate(90deg);
  }
}

@media (width <= 959px) {
  .reorganize-dialog-card,
  .reorganize-dialog-card--split {
    max-block-size: none;
    block-size: auto;
  }

  .reorganize-dialog-card--split .reorganize-dialog-card__body,
  .reorganize-dialog-card--split .reorganize-form-pane__content {
    overflow: visible;
  }

  .reorganize-main-row,
  .reorganize-main-row--preview-visible {
    grid-template-columns: 1fr;
  }

  .reorganize-main-row--preview-visible .reorganize-form-pane {
    border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-inline-end: none;
  }

  .reorganize-form-pane__actions {
    display: grid;
    justify-content: stretch;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .reorganize-action-btn {
    inline-size: 100%;
    min-block-size: 2.75rem;
  }

  .reorganize-preview-pane__summary {
    padding-inline: 1rem;
  }

  .reorganize-preview-list {
    margin-block-end: 1rem;
    margin-inline: 1rem;
  }
}

@media (width <= 640px) {
  .reorganize-form-pane__actions {
    justify-content: stretch;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .reorganize-action-btn {
    min-inline-size: 0;
  }

  .reorganize-action-btn--primary {
    grid-column: 1 / -1;
  }

  .reorganize-preview-pane__header {
    padding-inline: 1rem;
  }

  .preview-file-body {
    padding-inline: 0.75rem;
  }

  .preview-file-row {
    padding-inline: 0.875rem;
  }
}

@media (width <= 420px) {
  .reorganize-form-pane__actions {
    gap: 0.5rem;
  }

  .reorganize-action-btn {
    font-size: 0.875rem;
  }
}
</style>
