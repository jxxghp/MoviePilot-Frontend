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
  MediaInfo,
  StorageConf,
  TransferDirectoryConf,
  TransferForm,
} from '@/api/types'
import { useBackground } from '@/composables/useBackground'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import ProgressDialog from './ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackground()

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

interface EpisodeFormatRecommendData {
  rule_name?: string
  rule_index?: number
  pattern?: string
  episode_format?: string
  sample_file?: string
  min_file_size_mb?: number
  message?: string
}

const episodeFormatRecommendState = reactive<{
  loading: boolean
  ruleName?: string
  rulePattern?: string
  generatedFormat?: string
  sampleFile?: string
  lastMessage?: string
}>({
  loading: false,
  ruleName: undefined,
  rulePattern: undefined,
  generatedFormat: undefined,
  sampleFile: undefined,
  lastMessage: undefined,
})

const episodeFormatRuleConfigured = ref<boolean | undefined>(undefined)

interface TargetDirectoryOption {
  title: string
  value: string
}

const AUTO_TARGET_PATH_VALUE = '__moviepilot_auto_target_path__'

// 媒体类型映射到手动整理接口接受的类型名。
function resolveTransferMediaType(type?: string) {
  const normalizedType = type?.trim().toLowerCase()
  if (!normalizedType) return undefined

  const movieTypes = ['电影', 'movie']
  if (movieTypes.includes(normalizedType)) return '电影'

  const tvTypes = ['电视剧', 'tv', 'series']
  if (tvTypes.includes(normalizedType)) return '电视剧'

  return undefined
}

// 生成文件项稳定键，用于去重和状态同步。
function getFileItemKey(item?: FileItem) {
  return [item?.storage ?? '', item?.type ?? '', item?.path ?? ''].join('|')
}

// 按存储、类型和路径去重文件项。
function dedupeFileItems(fileItems?: FileItem[]) {
  if (!fileItems?.length) return []

  const uniqueItems = new Map<string, FileItem>()
  fileItems.forEach(item => {
    uniqueItems.set(getFileItemKey(item), item)
  })

  return Array.from(uniqueItems.values())
}

// 生成预览项稳定键，避免合并多次预览结果时重复展示。
function getPreviewItemKey(item: ManualTransferPreviewItem) {
  return [item.source ?? '', item.target ?? '', item.success === false ? 'failed' : 'success'].join('|')
}

const normalizedItems = computed(() => dedupeFileItems(props.items))

// 分页
const previewPage = ref(1)
const previewPageSize = ref(20)

// 所有存储
const storages = ref<StorageConf[]>([])

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 剧集组加载状态
const episodeGroupLoading = ref(false)

// 剧集组查询防抖句柄
let episodeGroupQueryTimer: ReturnType<typeof setTimeout> | undefined

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 存储字典
const storageOptions = computed(() => {
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: null,
    },
    ...storages.value.map(item => ({
      title: item.name,
      value: item.type,
    })),
  ]
})

// 整理方式选项，包含可提交 null 的自动项。
const manualTransferTypeOptions = computed(() => {
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: null,
    },
    ...transferTypeOptions,
  ]
})

// 剧集组选项属性
function episodeGroupItemProps(item: { title: string; subtitle?: string }) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

interface EpisodeGroupOption {
  title: string
  subtitle: string
  value: string | null
}

// 剧集组选项，保留 null 作为不指定剧集组。
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => {
  const options: EpisodeGroupOption[] = (
    episodeGroups.value as { id: string; name: string; group_count: number; episode_count: number }[]
  ).map(item => {
    return {
      title: item.name,
      subtitle: `${t('dialog.reorganize.seasonCount', { count: item.group_count })} • ${t(
        'dialog.reorganize.episodeCount',
        { count: item.episode_count },
      )}`,
      value: item.id,
    }
  })

  options.unshift({
    title: t('dialog.reorganize.defaultEpisodeGroup'),
    subtitle: t('dialog.reorganize.defaultEpisodeGroupHint'),
    value: null,
  })

  return options
})

// 查询指定 TMDB 剧集的所有剧集组。
async function getEpisodeGroups(tmdbid?: number | string) {
  const normalizedTmdbId = Number(tmdbid)
  if (!Number.isInteger(normalizedTmdbId) || normalizedTmdbId <= 0) {
    episodeGroups.value = []
    return
  }

  episodeGroupLoading.value = true
  try {
    episodeGroups.value = await api.get(`media/groups/${normalizedTmdbId}`)
  } catch (error) {
    console.error(error)
    episodeGroups.value = []
  } finally {
    episodeGroupLoading.value = false
  }
}

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

const initialTargetPath = normalizeTargetPath(props.target_path)

// 表单
const transferForm = reactive<TransferForm>({
  fileitem: {} as FileItem,
  logid: 0,
  target_storage: initialTargetPath ? (props.target_storage ?? 'local') : null,
  target_path: initialTargetPath,
  transfer_type: null,
  min_filesize: 0,
  scrape: initialTargetPath ? false : null,
  from_history: false,
  library_type_folder: null,
  library_category_folder: null,
  episode_group: null,
})

// 处理媒体搜索结果选择，同步搜索结果中已识别的媒体类型。
function handleMediaSelected(item: Pick<MediaInfo, 'type'>) {
  const typeName = resolveTransferMediaType(item.type)
  if (!typeName) return

  transferForm.type_name = typeName
}

// 所有媒体库目录
const directories = ref<TransferDirectoryConf[]>([])

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 目的目录下拉框，第一项用于把目标路径显式重置为后端自动匹配。
const targetDirectoryOptions = computed<TargetDirectoryOption[]>(() => {
  const libraryDirectories = directories.value.map(item => item.library_path).filter(Boolean) as string[]
  return [
    {
      title: t('dialog.reorganize.auto'),
      value: AUTO_TARGET_PATH_VALUE,
    },
    ...[...new Set(libraryDirectories)].map(path => ({
      title: path,
      value: path,
    })),
  ]
})

// 目标路径选择值，用哨兵值把界面上的“自动”和接口里的 null 解耦。
const targetPathSelection = computed({
  get() {
    return transferForm.target_path ?? AUTO_TARGET_PATH_VALUE
  },
  set(value: string | null) {
    const targetPath = normalizeTargetPath(value)
    if (!targetPath || targetPath === AUTO_TARGET_PATH_VALUE) {
      resetAutomaticTargetConfig()
      return
    }

    transferForm.target_path = targetPath
  },
})

// 重置为完全自动匹配状态，提交时不携带目标路径及其派生配置。
function resetAutomaticTargetConfig() {
  transferForm.target_storage = null
  transferForm.target_path = null
  transferForm.transfer_type = null
  transferForm.scrape = null
  transferForm.library_type_folder = null
  transferForm.library_category_folder = null
}

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
        transferForm.target_storage = transferForm.target_storage || 'local'
        transferForm.transfer_type = transferForm.transfer_type || 'copy'
        transferForm.scrape = false
        transferForm.library_category_folder = false
        transferForm.library_type_folder = false
      }
    } else {
      // 路径为空时, 恢复到`自动`条件
      transferForm.transfer_type = null
      transferForm.library_type_folder = null
      transferForm.library_category_folder = null
    }
  },
)

// 监听 TMDB 编号变化，自动加载可用剧集组并清空旧选择。
watch(
  () => transferForm.tmdbid,
  tmdbid => {
    transferForm.episode_group = null
    episodeGroups.value = []
    if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)
    if (transferForm.type_name !== '电视剧' || mediaSource.value !== 'themoviedb') return
    episodeGroupQueryTimer = setTimeout(() => getEpisodeGroups(tmdbid), 400)
  },
)

// 切换媒体类型或识别源时，非 TMDB 电视剧不保留剧集组选择。
watch([() => transferForm.type_name, () => mediaSource.value], ([typeName, source]) => {
  if (typeName === '电视剧' && source === 'themoviedb' && transferForm.tmdbid) {
    getEpisodeGroups(transferForm.tmdbid)
    return
  }
  transferForm.episode_group = null
  episodeGroups.value = []
})

watch(
  () => transferForm.episode_group,
  episodeGroup => {
    const normalizedEpisodeGroup = normalizeEpisodeGroup(episodeGroup)
    if (episodeGroup !== normalizedEpisodeGroup) {
      transferForm.episode_group = normalizedEpisodeGroup
    }
  },
)

// 过滤并排序后的预览数据
const filteredPreviewItems = computed(() => {
  const items = [...(previewData.value?.items ?? [])]

  return items.sort((a, b) => {
    // 1. 获取季号（如果有的话优先按季号排）
    const seasonA = getPreviewSeasonNumber(a)
    const seasonB = getPreviewSeasonNumber(b)
    if (seasonA !== seasonB) {
      if (seasonA === undefined) return 1
      if (seasonB === undefined) return -1
      return seasonA - seasonB
    }

    // 2. 获取集数
    const epA = toPreviewNumber(a.episode)
    const epB = toPreviewNumber(b.episode)

    // 如果都有集数，按集数排序
    if (epA !== undefined && epB !== undefined) {
      if (epA !== epB) return epA - epB
      // 集数相同（可能是同集的视频、字幕等），退化到按文件名排序，保证相关文件挨在一起
    }

    // 3. 有集数的排前面，没集数的（通常是其他文件）排后面
    if (epA !== undefined && epB === undefined) return -1
    if (epA === undefined && epB !== undefined) return 1

    // 4. 如果都没集数，或者集数完全相同，则按照目标路径（或源路径）的字母顺序排
    const nameA = a.target || a.source || ''
    const nameB = b.target || b.source || ''
    return nameA.localeCompare(nameB, undefined, { numeric: true })
  })
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

// 归一化可选目的路径，保证未指定时向接口传递 null 而不是空字符串。
function normalizeTargetPath(path?: string | null) {
  const normalizedPath = path?.trim()
  return normalizedPath || null
}

// 归一化可选文本参数，保证自动项提交 null 而不是空字符串。
function normalizeOptionalText(value?: string | null) {
  const normalizedValue = value?.trim()
  return normalizedValue || null
}

// 归一化剧集组值，兼容历史对象态值。
function normalizeEpisodeGroup(episodeGroup?: string | { value?: string | null } | null) {
  if (!episodeGroup) return null
  if (typeof episodeGroup === 'string') {
    const normalizedEpisodeGroup = episodeGroup.trim()
    return normalizedEpisodeGroup || null
  }
  if (typeof episodeGroup === 'object' && typeof episodeGroup.value === 'string') {
    const normalizedEpisodeGroup = episodeGroup.value.trim()
    return normalizedEpisodeGroup || null
  }
  return null
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

// 标准化预览项中的识别词命中详情
function getPreviewApplyWords(item: ManualTransferPreviewItem) {
  return [
    ...new Set((item.apply_words ?? []).map(word => word?.trim()).filter((word): word is string => Boolean(word))),
  ]
}

// 手动整理识别词应用详情
const previewCustomWordDetails = computed(() => {
  const groupedDetails = new Map<string, { sourceNames: string[]; orgString?: string; applyWords: string[] }>()

  filteredPreviewItems.value.forEach(item => {
    const applyWords = getPreviewApplyWords(item)
    if (!applyWords.length) return

    const sourceName = getFileName(item.source)
    const orgString = item.org_string?.trim() || undefined
    const detailKey = JSON.stringify(applyWords)
    const existingDetail = groupedDetails.get(detailKey)

    if (existingDetail) {
      if (!existingDetail.sourceNames.includes(sourceName)) existingDetail.sourceNames.push(sourceName)
      return
    }

    groupedDetails.set(detailKey, {
      sourceNames: [sourceName],
      orgString,
      applyWords,
    })
  })

  return [...groupedDetails.values()].map(detail => ({
    sourceName:
      detail.sourceNames.length > 1
        ? t('dialog.reorganize.customWordsSameRules', { count: detail.sourceNames.length })
        : detail.sourceNames[0],
    orgString: detail.sourceNames.length > 1 ? undefined : detail.orgString,
    applyWords: detail.applyWords,
  }))
})

const previewEpisodeFormatRuleDetails = computed(() => {
  const episodeFormat = transferForm.episode_format?.trim()
  if (!episodeFormat) return []

  const rulePattern = episodeFormatRecommendState.rulePattern?.trim()
  const isGeneratedEpisodeFormat =
    Boolean(episodeFormatRecommendState.generatedFormat) &&
    episodeFormatRecommendState.generatedFormat === episodeFormat

  if (!isGeneratedEpisodeFormat || !episodeFormatRecommendState.ruleName) {
    return [
      {
        sourceName: t('dialog.reorganize.episodeFormatManualInput'),
        orgString: t('dialog.reorganize.episodeFormatFinal', {
          format: episodeFormat,
        }),
        applyWords: [],
      },
    ]
  }

  return [
    {
      sourceName: t('dialog.reorganize.episodeFormatRecommendRule', {
        rule: episodeFormatRecommendState.ruleName,
      }),
      orgString: t('dialog.reorganize.episodeFormatFinal', {
        format: episodeFormat,
      }),
      applyWords: rulePattern
        ? [
            t('dialog.reorganize.episodeFormatRulePattern', {
              pattern: rulePattern,
            }),
          ]
        : [],
    },
  ]
})

const previewRecognitionDetails = computed(() => [
  ...previewCustomWordDetails.value,
  ...previewEpisodeFormatRuleDetails.value,
])

const previewRecognitionDetailTitle = computed(() => {
  return previewCustomWordDetails.value.length
    ? t('dialog.reorganize.customWordsApplied')
    : t('dialog.reorganize.episodeFormatRuleDetails')
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

// 获取文件父目录键，用于判断多文件是否来自同一目录。
function getFileParentKey(item?: FileItem) {
  if (!item?.path) return ''
  const storage = item.storage ?? 'local'
  const pathParts = item.path.split('/')
  pathParts.pop()
  const parentPath = pathParts.join('/') || '/'
  return `${storage}|${parentPath}`
}

const episodeFormatRecommendSelectedFileItems = computed(() => {
  return shouldUseBatchFileItems(normalizedItems.value) ? normalizedItems.value : []
})

const episodeFormatRecommendHasValidSelectedFiles = computed(() => {
  if (episodeFormatRecommendSelectedFileItems.value.length <= 1) return false

  const directoryKeys = new Set(episodeFormatRecommendSelectedFileItems.value.map(item => getFileParentKey(item)))
  return directoryKeys.size === 1
})

const episodeFormatRecommendSourceItem = computed<FileItem | undefined>(() => {
  if (normalizedItems.value.length !== 1) return undefined
  return normalizedItems.value[0]
})

const canRecommendEpisodeFormat = computed(() => {
  return (
    (Boolean(episodeFormatRecommendSourceItem.value?.path) || episodeFormatRecommendHasValidSelectedFiles.value) &&
    !progressDialog.value &&
    !episodeFormatRecommendState.loading
  )
})

const episodeFormatRecommendSelectionKey = computed(() => {
  const sourceItem = episodeFormatRecommendSourceItem.value
  if (sourceItem) return getFileItemKey(sourceItem)
  return episodeFormatRecommendSelectedFileItems.value.map(item => getFileItemKey(item)).join('||')
})

const episodeFormatRecommendTooltip = computed(() => {
  if (episodeFormatRecommendState.loading) return t('dialog.reorganize.episodeFormatRecommendLoading')
  if (normalizedItems.value.length > 1 && !episodeFormatRecommendHasValidSelectedFiles.value) {
    return t('dialog.reorganize.episodeFormatRecommendInvalidSelection')
  }
  if (!episodeFormatRecommendSourceItem.value?.path && !episodeFormatRecommendHasValidSelectedFiles.value) {
    return t('dialog.reorganize.episodeFormatRecommendSelectFile')
  }
  if (episodeFormatRuleConfigured.value === false) return t('dialog.reorganize.episodeFormatRecommendNeedWords')
  return t('dialog.reorganize.episodeFormatRecommendAction')
})

watch(
  episodeFormatRecommendSelectionKey,
  () => {
    transferForm.fileitem = episodeFormatRecommendSourceItem.value ?? ({} as FileItem)
    episodeFormatRecommendState.ruleName = undefined
    episodeFormatRecommendState.rulePattern = undefined
    episodeFormatRecommendState.generatedFormat = undefined
    episodeFormatRecommendState.sampleFile = undefined
    episodeFormatRecommendState.lastMessage = undefined
  },
  { immediate: true },
)

// 判断文件集合是否可以按批量文件请求提交。
function shouldUseBatchFileItems(items: FileItem[]) {
  return items.length > 0 && items.every(item => item.type === 'file')
}

// 生成批量文件在提示和错误信息中的显示名称。
function getBatchItemsLabel(items: FileItem[]) {
  if (items.length === 1) return items[0].path || items[0].name
  return t('dialog.reorganize.multipleItemsTitle', { count: items.length })
}

// 构造整理请求
function createTransferPayload(options: { item?: FileItem; items?: FileItem[]; logid?: number; preview?: boolean }) {
  const sourceItem = options.item ?? (options.items?.length ? options.items[0] : ({} as FileItem))
  const payload: ManualTransferPayload = {
    ...transferForm,
    fileitem: sourceItem,
    logid: options.logid ?? 0,
    target_storage: normalizeOptionalText(transferForm.target_storage),
    target_path: normalizeTargetPath(transferForm.target_path),
    transfer_type: normalizeOptionalText(transferForm.transfer_type),
    episode_group: normalizeEpisodeGroup(transferForm.episode_group),
  }

  if (options.items?.length) {
    payload.fileitems = options.items
    if (!options.item) {
      // 文件集合请求以 fileitems 为准，避免残留 fileitem 状态把请求误导成目录语义。
      delete payload.fileitem
    }
  }
  if (options.preview) payload.preview = true
  return payload
}

// 请求整理接口
async function requestManualTransfer<T = any>(
  payload: ManualTransferPayload,
  background: boolean = false,
): Promise<ApiResponse<T>> {
  return await api.post<ApiResponse<T>, ApiResponse<T>>(`transfer/manual?background=${background}`, payload)
}

// 加载剧集格式规则配置状态，用于决定是否允许自动推荐。
async function loadEpisodeFormatRuleConfiguration() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/EpisodeFormatRuleTable')
    episodeFormatRuleConfigured.value = Boolean(result.data?.value?.length)
  } catch (error) {
    console.log(error)
    episodeFormatRuleConfigured.value = undefined
  }
}

// 根据当前文件或同目录多文件请求推荐剧集格式。
async function handleRecommendEpisodeFormat() {
  const sourceItem = episodeFormatRecommendSourceItem.value
  const selectedFileItems = episodeFormatRecommendSelectedFileItems.value
  const hasValidSelectedFiles = episodeFormatRecommendHasValidSelectedFiles.value
  if (!sourceItem?.path && !hasValidSelectedFiles) {
    $toast.warning(
      normalizedItems.value.length > 1
        ? t('dialog.reorganize.episodeFormatRecommendInvalidSelection')
        : t('dialog.reorganize.episodeFormatRecommendSelectFile'),
    )
    return
  }

  if (episodeFormatRuleConfigured.value === false) {
    $toast.warning(t('dialog.reorganize.episodeFormatRecommendNeedWords'))
    return
  }

  episodeFormatRecommendState.loading = true

  try {
    const hasExistingEpisodeFormat = Boolean(transferForm.episode_format?.trim())
    const result = await api.post<ApiResponse<EpisodeFormatRecommendData>, ApiResponse<EpisodeFormatRecommendData>>(
      'transfer/episode-format/recommend',
      hasValidSelectedFiles
        ? {
            fileitems: selectedFileItems,
          }
        : {
            fileitem: sourceItem,
          },
    )

    if (!result.success) {
      $toast.error(result.message || t('dialog.reorganize.episodeFormatRecommendFailed'))
      return
    }

    const data = result.data ?? {}
    if (!data.episode_format) {
      $toast.error(t('dialog.reorganize.episodeFormatRecommendFailed'))
      return
    }

    transferForm.episode_format = data.episode_format
    episodeFormatRecommendState.ruleName = data.rule_name
    episodeFormatRecommendState.rulePattern = data.pattern
    episodeFormatRecommendState.generatedFormat = data.episode_format
    episodeFormatRecommendState.sampleFile = data.sample_file
    episodeFormatRecommendState.lastMessage = data.message

    $toast.success(
      hasExistingEpisodeFormat
        ? t('dialog.reorganize.episodeFormatRecommendOverwriteSuccess')
        : t('dialog.reorganize.episodeFormatRecommendSuccess'),
    )
  } catch (error: any) {
    console.log(error)
    $toast.error(error?.message || t('dialog.reorganize.episodeFormatRecommendFailed'))
  } finally {
    episodeFormatRecommendState.loading = false
  }
}

// 创建空预览数据，作为多次预览结果的合并目标。
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

// 重置预览数据和分页状态。
function resetPreviewState() {
  previewData.value = undefined
  previewLoaded.value = false
  previewPage.value = 1
}

// 判断预览结果中是否存在失败项。
function previewHasFailures(data?: ManualTransferPreviewData) {
  if (!data) return false

  return (data.summary.failed ?? 0) > 0 || (data.items ?? []).some(item => item.success === false)
}

// 生成预览结果成功和失败数量摘要。
function getPreviewResultSummaryMessage(data?: ManualTransferPreviewData) {
  const success = data?.summary.success ?? 0
  const failed = data?.summary.failed ?? 0

  return [
    t('dialog.reorganize.previewSuccess', { count: success }),
    t('dialog.reorganize.previewFailed', { count: failed }),
  ].join('，')
}

// 构造单条失败预览数据，便于把异常请求合并到预览列表。
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

// 从标准响应中提取可展示的整理预览数据，优先保留顶层本地化消息。
function resolvePreviewResponseData(result: ApiResponse<ManualTransferPreviewData>) {
  if (!result.data) return result.data

  const message = result.message_i18n || result.message || result.data.message
  if (!message || message === result.data.message) return result.data

  return {
    ...result.data,
    message,
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
      if (shouldUseBatchFileItems(normalizedItems.value)) {
        try {
          const result = await requestManualTransfer<ManualTransferPreviewData>(
            createTransferPayload({ items: normalizedItems.value, preview: true }),
          )
          if (!result.success) {
            mergePreviewData(
              mergedPreviewData,
              createFailedPreviewData({
                source: getBatchItemsLabel(normalizedItems.value),
                message: result.message || t('dialog.reorganize.previewRequestFailed'),
              }),
            )
          } else {
            mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result))
          }
        } catch (err: any) {
          console.warn(`预览请求异常: ${err?.message}`)
          mergePreviewData(
            mergedPreviewData,
            createFailedPreviewData({
              source: getBatchItemsLabel(normalizedItems.value),
              message: `${getBatchItemsLabel(normalizedItems.value)}: ${err?.message || t('dialog.reorganize.previewRequestFailed')}`,
            }),
          )
        }
      } else {
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

              mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result))
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

            mergePreviewData(mergedPreviewData, resolvePreviewResponseData(result))
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

// 切换预览面板，首次展开时拉取最新预览结果。
async function togglePreview() {
  if (previewLoading.value) return

  if (previewVisible.value) {
    previewVisible.value = false
    return
  }

  previewVisible.value = true
  await previewTransfer()
}

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

// 批量整理文件并按后台模式决定是否提示入队成功。
async function handleTransferBatch(items: FileItem[], background: boolean = false) {
  try {
    const result: { [key: string]: any } = await requestManualTransfer(createTransferPayload({ items }), background)
    if (!result.success) $toast.error(result.message)
    else if (background) $toast.success(t('dialog.reorganize.successMessage', { name: getBatchItemsLabel(items) }))
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
    progressText.value = progress.text_i18n || progress.text
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
    if (shouldUseBatchFileItems(normalizedItems.value)) {
      if (!background) {
        startLoadingProgress('filetransfer')
      }
      await handleTransferBatch(normalizedItems.value, background)
    } else {
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

onMounted(async () => {
  await loadDirectories()
  loadStorages()
  loadEpisodeFormatRuleConfiguration()
})

onUnmounted(() => {
  stopLoadingProgress()
  if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)
})
</script>

<template>
  <VDialog
    :scrollable="!previewVisible || !display.mdAndUp.value"
    :max-width="dialogMaxWidth"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard
      class="reorganize-dialog-card"
      :class="{ 'reorganize-dialog-card--split': previewVisible && display.mdAndUp.value }"
    >
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
                      :items="manualTransferTypeOptions"
                      :hint="t('dialog.reorganize.transferTypeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-swap-horizontal"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VCombobox
                      v-model="targetPathSelection"
                      :items="targetDirectoryOptions"
                      item-title="title"
                      item-value="value"
                      :return-object="false"
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
                  <VCol v-if="mediaSource === 'themoviedb'" cols="12" md="6">
                    <VSelect
                      v-model="transferForm.episode_group"
                      :items="episodeGroupOptions"
                      item-title="title"
                      item-value="value"
                      :item-props="episodeGroupItemProps"
                      :loading="episodeGroupLoading"
                      :disabled="!transferForm.tmdbid"
                      clearable
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
                    >
                      <template #append-inner>
                        <VTooltip location="top">
                          <template #activator="{ props: tooltipProps }">
                            <IconBtn
                              v-bind="tooltipProps"
                              type="button"
                              color="primary"
                              variant="text"
                              size="small"
                              class="ms-1"
                              icon="mdi-auto-fix"
                              :loading="episodeFormatRecommendState.loading"
                              :disabled="!canRecommendEpisodeFormat"
                              @click.stop="handleRecommendEpisodeFormat"
                            />
                          </template>
                          <span>
                            {{ episodeFormatRecommendTooltip }}
                          </span>
                        </VTooltip>
                      </template>
                    </VTextField>
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
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="transferForm.library_type_folder"
                      :label="t('dialog.reorganize.typeFolderOption')"
                      :hint="t('dialog.reorganize.typeFolderHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="6">
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
            </div>
            <VCardActions class="app-dialog-actions reorganize-form-pane__actions">
              <VBtn
                color="info"
                variant="tonal"
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
                variant="tonal"
                @click="transfer(true)"
                prepend-icon="mdi-plus"
                class="reorganize-action-btn reorganize-action-btn--queue"
              >
                {{ t('dialog.reorganize.addToQueue') }}
              </VBtn>
              <VSpacer />
              <VBtn
                color="primary"
                variant="flat"
                @click="transfer(false)"
                prepend-icon="mdi-arrow-right-bold"
                class="reorganize-action-btn reorganize-action-btn--primary"
              >
                {{ t('dialog.reorganize.reorganizeNow') }}
              </VBtn>
            </VCardActions>
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
                    <div v-if="previewRecognitionDetails.length" class="preview-custom-words">
                      <div class="preview-custom-words__title">
                        <VIcon icon="mdi-tag-text-outline" size="16" />
                        <span>{{ previewRecognitionDetailTitle }}</span>
                      </div>
                      <div class="preview-custom-words__items">
                        <div
                          v-for="(detail, index) in previewRecognitionDetails"
                          :key="`${detail.sourceName}-${index}`"
                          class="preview-custom-words__item"
                        >
                          <div class="preview-custom-words__source">{{ detail.sourceName }}</div>
                          <div v-if="detail.orgString" class="preview-custom-words__original">
                            {{ detail.orgString }}
                          </div>
                          <div v-if="detail.applyWords.length" class="preview-custom-words__chips">
                            <VChip
                              v-for="(word, wordIndex) in detail.applyWords"
                              :key="`${word}-${wordIndex}`"
                              variant="outlined"
                              color="info"
                              size="small"
                              class="preview-custom-words__chip"
                            >
                              {{ word }}
                            </VChip>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="reorganize-preview-list">
                    <div v-if="pagedPreviewRows.length" class="preview-file-body">
                      <div
                        v-for="(item, index) in pagedPreviewRows"
                        :key="`${item.source}-${item.target}-${index}`"
                        class="preview-file-row app-surface-shape"
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
        @select="handleMediaSelected"
        :type="mediaSource"
      />
      <MediaIdSelector
        v-else
        v-model="transferForm.doubanid"
        @close="mediaSelectorDialog = false"
        @select="handleMediaSelected"
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
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
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
  inline-size: 100%;
  min-block-size: 0;
  transition: grid-template-columns 0.25s ease;
}

.reorganize-main-row--preview-visible {
  grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
}

.reorganize-form-pane {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  max-inline-size: none;
  min-block-size: 0;
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
  margin-block-start: auto;
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
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
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
  border-radius: 0.5rem;
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

.preview-custom-words {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.5rem;
  gap: 0.75rem;
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

.preview-custom-words__title {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-info));
  font-size: 0.875rem;
  font-weight: 600;
  gap: 0.375rem;
}

.preview-custom-words__items {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-inline-size: 0;
}

.preview-custom-words__item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-inline-size: 0;
}

.preview-custom-words__source {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.preview-custom-words__original {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.preview-custom-words__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-inline-size: 0;
}

.preview-custom-words__chip {
  block-size: auto !important;
  max-inline-size: 100%;
  min-block-size: 1.5rem;
  padding-block: 0.25rem;
  white-space: normal;
  word-break: break-all;
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
  margin-block-end: 1.5rem;
  min-block-size: 0;
  min-inline-size: 0;
  padding-inline: 1.5rem;
}

.preview-file-body {
  display: flex;
  overflow: visible;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
  min-inline-size: 0;
}

.preview-file-row {
  display: grid;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.5rem;
  gap: 0.875rem;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  min-block-size: 5.25rem;
  min-inline-size: 0;
  padding-block: 0.875rem;
  padding-inline: 1rem;
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
  overflow: visible;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-all;
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
    block-size: auto;
    max-block-size: none;
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

  .reorganize-action-btn {
    min-block-size: 2.75rem;
    padding-inline: 1rem;
  }

  .reorganize-preview-pane__summary {
    padding-inline: 1rem;
  }

  .reorganize-preview-list {
    margin-block-end: 1rem;
    padding-inline: 1rem;
  }
}

@media (width <= 640px) {
  .reorganize-form-pane__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
