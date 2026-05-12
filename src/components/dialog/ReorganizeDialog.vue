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

// 是否已加载预览
const previewLoaded = ref(false)

// 预览错误
const previewRequestError = ref('')

// 预览数据
const previewData = ref<ManualTransferPreviewData>()

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
  if (props.items) {
    if (props.items.length > 1) return t('dialog.reorganize.multipleItemsTitle', { count: props.items.length })
    return t('dialog.reorganize.singleItemTitle', { path: props.items[0].path })
  } else if (props.logids) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.logids.length })
  }
})
// 禁用指定集数
const disableEpisodeDetail = computed(() => {
  if (props.items) {
    if (transferForm.episode_format) return false
    return !(props.items.length === 1 && props.items[0].type !== 'dir')
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

// 获取目录路径
function getDirectoryPath(path?: string) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return ''
  if (normalizedPath.endsWith('/')) return normalizedPath

  const parts = normalizedPath.split('/')
  parts.pop()
  const joined = parts.join('/')
  return joined ? `${joined}/` : '/'
}

// 计算公共路径
function getCommonPath(paths: string[]) {
  const validPaths = paths.map(item => normalizePath(item)).filter(Boolean)
  if (validPaths.length === 0) return ''
  if (validPaths.length === 1) return validPaths[0]

  const splitPaths = validPaths.map(path => path.split('/'))
  const commonParts: string[] = []

  for (let index = 0; index < splitPaths[0].length; index++) {
    const part = splitPaths[0][index]
    if (splitPaths.every(pathParts => pathParts[index] === part)) {
      commonParts.push(part)
    } else {
      break
    }
  }

  return commonParts.join('/') || '/'
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

// 顶部原始路径
const previewSourcePath = computed(() => {
  const paths = filteredPreviewItems.value.map(item => getDirectoryPath(item.source))
  return getCommonPath(paths) || '-'
})

// 顶部目的路径
const previewTargetPath = computed(() => {
  const targetDirs = filteredPreviewItems.value.map(item => item.target_dir || getDirectoryPath(item.target))
  return getCommonPath(targetDirs) || '-'
})

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
  const candidates = [
    previewSourcePath.value,
    previewTargetPath.value,
    ...previewFileRows.value.map(item => `${item.sourceName}${item.targetName}`),
  ]

  return candidates.some(item => item.length > 72)
})

// 弹窗宽度
const dialogMaxWidth = computed(() => {
  if (!display.mdAndUp.value) return '100%'
  const preferredWidth = previewLoaded.value && previewNeedsWideLayout.value ? '132rem' : '99rem'
  return `min(${preferredWidth}, calc(100vw - 2rem))`
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

// 合并多次预览结果
function mergePreviewData(target: ManualTransferPreviewData, incoming?: ManualTransferPreviewData) {
  if (!incoming) return

  const incomingItems = incoming.items ?? []
  const incomingSummary = incoming.summary ?? {
    total: incomingItems.length,
    success: incomingItems.filter(item => item.success).length,
    failed: incomingItems.filter(item => item.success === false).length,
  }

  target.summary.total += incomingSummary.total ?? 0
  target.summary.success += incomingSummary.success ?? 0
  target.summary.failed += incomingSummary.failed ?? 0
  target.items.push(...incomingItems)

  if (incoming.message) {
    target.message = [target.message, incoming.message].filter(Boolean).join('；')
  }
}

function appendPreviewFailure(target: ManualTransferPreviewData, options: { source?: string; message?: string }) {
  const message = options.message || t('dialog.reorganize.previewRequestFailed')
  mergePreviewData(target, {
    summary: {
      total: 1,
      success: 0,
      failed: 1,
    },
    items: [
      {
        source: options.source,
        success: false,
        message,
      },
    ],
    message,
  })
}

// 预览整理结果
async function previewTransfer() {
  if (!props.logids && !props.items) return

  previewLoading.value = true
  previewRequestError.value = ''

  const mergedPreviewData = getDefaultPreviewData()

  try {
    const tasks: Promise<void>[] = []

    if (props.items) {
      tasks.push(
        ...props.items.map(async item => {
          try {
            const result = await requestManualTransfer<ManualTransferPreviewData>(
              createTransferPayload({ item, preview: true }),
            )
            if (result.success) {
              mergePreviewData(mergedPreviewData, result.data)
            } else {
              console.warn(`预览失败: ${result.message}`)
              appendPreviewFailure(mergedPreviewData, { source: item.path, message: result.message })
            }
          } catch (err: any) {
            console.warn(`预览请求异常: ${err?.message}`)
            appendPreviewFailure(mergedPreviewData, { source: item.path, message: err?.message })
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
            if (result.success) {
              mergePreviewData(mergedPreviewData, result.data)
            } else {
              console.warn(`预览失败: ${result.message}`)
              appendPreviewFailure(mergedPreviewData, {
                message: `历史记录 ${logid}: ${result.message || t('dialog.reorganize.previewRequestFailed')}`,
              })
            }
          } catch (err: any) {
            console.warn(`预览请求异常: ${err?.message}`)
            appendPreviewFailure(mergedPreviewData, {
              message: `历史记录 ${logid}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
            })
          }
        }),
      )
    }

    await Promise.all(tasks)

    previewData.value = mergedPreviewData
    previewLoaded.value = true
    nextTick(() => updatePreviewPageSize())
  } catch (error: any) {
    previewRequestError.value = error?.message || t('dialog.reorganize.previewRequestFailed')
    $toast.error(t('dialog.reorganize.previewRequestFailed'))
  } finally {
    previewLoading.value = false
  }
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

watch(
  () => previewLoaded.value,
  loaded => {
    if (loaded) {
      nextTick(() => {
        setupPreviewFileBodyObserver()
        updatePreviewPageSize()
      })
    } else {
      previewFileBodyResizeObserver?.disconnect()
    }
  },
)

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
  if (!props.logids && !props.items) return

  // 显示进度条
  progressDialog.value = true

  // 文件整理
  if (props.items) {
    for (const item of props.items) {
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
  <VDialog scrollable :max-width="dialogMaxWidth" :fullscreen="!display.mdAndUp.value">
    <VCard class="reorganize-dialog-card">
      <VCardItem class="py-2">
        <template #prepend> <VIcon icon="mdi-folder-move" class="me-2" /> </template>
        <VCardTitle>{{ dialogTitle }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText class="pa-0">
        <div class="reorganize-main-row">
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
                  color="primary"
                  @click="previewTransfer"
                  prepend-icon="mdi-eye-outline"
                  class="reorganize-action-btn reorganize-action-btn--preview"
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
          <div class="reorganize-preview-pane">
            <div class="reorganize-preview-pane__header">
              <div class="reorganize-preview-pane__header-main">
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
                </div>
                <div v-if="previewLoaded" class="reorganize-preview-pane__overview">
                  <div class="preview-overview-card">
                    <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewMediaName') }}</span>
                    <span class="preview-overview-card__value">{{ previewMediaInfo.title }}</span>
                  </div>
                  <div class="preview-overview-card">
                    <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewMediaType') }}</span>
                    <span class="preview-overview-card__value">{{ previewMediaInfo.type }}</span>
                  </div>
                  <div v-if="!previewIsMovie" class="preview-overview-card">
                    <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewSeasonLabel') }}</span>
                    <span class="preview-overview-card__value">{{ previewSeasonText }}</span>
                  </div>
                  <div v-if="!previewIsMovie" class="preview-overview-card">
                    <span class="preview-overview-card__label">{{ t('dialog.reorganize.previewEpisodeCount') }}</span>
                    <span class="preview-overview-card__value">{{ previewEpisodeCountText }}</span>
                  </div>
                </div>
              </div>
            </div>
            <VAlert v-if="previewRequestError" type="error" variant="tonal" class="mx-4 mb-4">
              {{ previewRequestError }}
            </VAlert>
            <div v-if="previewLoading" class="reorganize-preview-pane__loading">
              <VProgressCircular indeterminate color="primary" />
              <div class="text-body-2 text-medium-emphasis mt-3">{{ t('dialog.reorganize.previewLoading') }}</div>
            </div>
            <template v-else-if="previewLoaded">
              <VAlert v-if="previewData?.message" type="info" variant="tonal" density="comfortable" class="mx-4 mb-4">
                {{ previewData.message }}
              </VAlert>
              <div class="reorganize-preview-pane__scroll">
                <div class="reorganize-preview-list">
                  <div class="preview-file-header">
                    <div class="preview-file-header__cell preview-file-header__cell--target">
                      {{ t('dialog.reorganize.previewAfterColumn') }}
                    </div>
                    <div class="preview-file-header__cell preview-file-header__cell--source">
                      {{ t('dialog.reorganize.previewBeforeColumn') }}
                    </div>
                  </div>
                  <div v-if="pagedPreviewRows.length" ref="previewFileBodyRef" class="preview-file-body">
                    <div class="preview-file-panel preview-file-panel--target">
                      <div class="preview-file-panel__scroll">
                        <div class="preview-file-panel__content">
                          <div
                            v-for="(item, index) in pagedPreviewRows"
                            :key="`target-${item.source}-${index}`"
                            class="preview-file-row"
                          >
                            <span class="preview-file-text">{{ item.targetName }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="preview-file-panel preview-file-panel--source">
                      <div class="preview-file-panel__scroll">
                        <div class="preview-file-panel__content">
                          <div
                            v-for="(item, index) in pagedPreviewRows"
                            :key="`source-${item.source}-${index}`"
                            class="preview-file-row"
                          >
                            <span class="preview-file-text">{{ item.sourceName }}</span>
                          </div>
                        </div>
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
            <div v-else class="reorganize-preview-pane__empty">
              <div class="text-subtitle-1">{{ t('dialog.reorganize.previewEmptyTitle') }}</div>
              <div class="text-body-2 text-medium-emphasis mt-2">
                {{ t('dialog.reorganize.previewEmptyDescription') }}
              </div>
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
.reorganize-main-row {
  display: grid;
  overflow: hidden;
  align-items: stretch;
  grid-template-columns: 45% 55%;
  inline-size: 100%;

  @media (width <= 959px) {
    grid-template-columns: 1fr;
  }
}

.reorganize-form-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  max-inline-size: none;
  min-inline-size: 0;
}

.reorganize-form-pane__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 100%;
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

.reorganize-preview-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
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

.reorganize-preview-pane__header-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.875rem;
  min-inline-size: 0;
}

.reorganize-preview-pane__title-block {
  min-inline-size: 0;
}

.reorganize-preview-pane__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
}

.reorganize-preview-pane__overview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  min-inline-size: 0;
}

.preview-title-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-inline-size: 0;
}

.preview-overview-card {
  display: flex;
  flex: 1 1 12rem;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.75rem;
  background: rgba(var(--v-theme-surface));
  gap: 0.25rem;
  min-inline-size: 0;
  padding-block: 0.75rem;
  padding-inline: 0.875rem;
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
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reorganize-preview-pane__scroll {
  display: flex;
  overflow: hidden auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
  padding-block-start: 0.75rem;
}

.reorganize-preview-pane__pagination {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 0.25rem;
  padding-block: 0.5rem;
}

.reorganize-preview-pane__loading,
.reorganize-preview-pane__empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: 2rem;
  padding-inline: 1.5rem;
  text-align: center;
}

.reorganize-preview-table {
  padding-block: 0 1rem;
  padding-inline: 1rem;
}

.reorganize-preview-list {
  display: flex;
  overflow: hidden;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
  padding-block: 0 1rem;
  padding-inline: 1rem;
}

.preview-file-header {
  display: grid;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.5rem 0.5rem 0 0;
  background: rgba(var(--v-theme-surface));
  border-block-end: none;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 500;
  grid-template-columns: 50% 50%;
}

.preview-file-header__cell {
  padding-block: 0.75rem;
  padding-inline: 0.75rem;
}

.preview-file-header__cell--target {
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.preview-file-body {
  display: grid;
  overflow: hidden;
  flex: 1 1 auto;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0 0 0.5rem 0.5rem;
  grid-template-columns: 50% 50%;
  min-block-size: 0;
  min-inline-size: 0;
}

.preview-file-panel {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.preview-file-panel--target {
  border-inline-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.preview-file-panel__scroll {
  overflow: auto hidden;
  flex: 1 1 auto;
  min-block-size: 0;
  min-inline-size: 0;
  scrollbar-color: rgba(var(--v-border-color), var(--v-border-opacity)) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    block-size: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 2px;
    background: rgba(var(--v-border-color), var(--v-border-opacity));
  }
}

.preview-file-panel__content {
  display: flex;
  flex-direction: column;
  min-block-size: 100%;
  min-inline-size: max-content;
}

.preview-file-row {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  min-block-size: 2.75rem;
  min-inline-size: max-content;
  padding-block: 0.625rem;
  padding-inline: 0.75rem;
}

.preview-file-row + .preview-file-row {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.preview-file-text {
  white-space: nowrap;
}

.reorganize-preview-list__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  padding-block: 1rem;
  padding-inline: 0.5rem;
  white-space: nowrap;
}

@media (width <= 1200px) {
  .reorganize-preview-pane__header {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (width <= 959px) {
  .reorganize-form-pane__actions {
    display: grid;
    justify-content: stretch;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .reorganize-action-btn {
    inline-size: 100%;
    min-block-size: 2.75rem;
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
