<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateDifference } from '@/@core/utils/formatters'
import { formatSeasonLabel } from '@/@core/utils/season'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import { resetSubscription, searchSubscription } from '@/api/subscription'
import type { Subscribe } from '@/api/types'
import router from '@/router'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { loadPosterTone, type PosterTone } from '@/utils/posterTone'
import { buildMusicDetailRoute, formatMusicAudioSpecs, formatMusicBitrate } from '@/utils/music'
import SubscribeExecutionDialog from '@/components/dialog/SubscribeExecutionDialog.vue'
import SubscribeSourceMark from '@/components/misc/SubscribeSourceMark.vue'
import type { SubscribeSource } from '@/utils/subscribeSource'

const TERMINAL_EXECUTION_VISIBLE_MS: Record<string, number> = {
  completed: 5_000,
  skipped: 10_000,
  cancelled: 10_000,
  failed: 60_000,
}
const BACKGROUND_EXECUTION_SOURCES = new Set(['new', 'fallback'])

const SubscribeEditDialog = defineAsyncComponent(() => import('../dialog/SubscribeEditDialog.vue'))
const SubscribeFilesDialog = defineAsyncComponent(() => import('../dialog/SubscribeFilesDialog.vue'))
const SubscribeShareDialog = defineAsyncComponent(() => import('../dialog/SubscribeShareDialog.vue'))

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  media: Object as PropType<Subscribe>,
  batchMode: {
    type: Boolean,
    default: false,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  sortable: {
    type: Boolean,
    default: false,
  },
  // 订阅来源；列表里只有一个来源时由列表页传 null，卡片不展示
  source: {
    type: Object as PropType<SubscribeSource | null>,
    default: null,
  },
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'select'])

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 图片是否加载完成
const imageLoaded = ref(false)

// 背景图或海报加载失败时使用统一占位图，避免订阅卡片留下空白图片区。
const backdropLoadError = ref(false)
const posterLoadError = ref(false)

// 当前的订阅状态
const subscribeState = ref<string>(props.media?.state ?? 'P')

// 上一次更新时间
const lastUpdateText = computed(() => (props.media?.last_update ? formatDateDifference(props.media.last_update) : ''))

// 用户主动搜索的状态承担短暂反馈，后台自动检查不覆盖卡片长期进度。
const visibleExecutionStatus = ref<Subscribe['execution_status'] | null>(null)
let executionStatusTimer: ReturnType<typeof setTimeout> | undefined
const executionDetailsOpen = ref(false)
const searchSubmitting = ref(false)

// 清理上一条终态的恢复计时器，避免卡片复用后由旧任务覆盖新状态。
function clearExecutionStatusTimer() {
  if (!executionStatusTimer) return
  clearTimeout(executionStatusTimer)
  executionStatusTimer = undefined
}

// 活动状态持续展示；各种结束状态按重要程度短暂显示后恢复卡片原始信息。
function syncVisibleExecutionStatus(execution: Subscribe['execution_status']) {
  clearExecutionStatusTimer()
  if (execution?.source && BACKGROUND_EXECUTION_SOURCES.has(execution.source)) {
    visibleExecutionStatus.value = null
    return
  }
  visibleExecutionStatus.value = execution
  if (!execution) return

  const terminalState = TERMINAL_EXECUTION_VISIBLE_MS[execution.state]
    ? execution.state
    : TERMINAL_EXECUTION_VISIBLE_MS[execution.phase]
      ? execution.phase
      : undefined
  if (!terminalState) return

  const updatedAt = Date.parse(execution.updated_at)
  const elapsed = Number.isFinite(updatedAt) ? Math.max(0, Date.now() - updatedAt) : 0
  const remaining = TERMINAL_EXECUTION_VISIBLE_MS[terminalState] - elapsed
  if (remaining <= 0) {
    visibleExecutionStatus.value = null
    return
  }

  executionStatusTimer = setTimeout(() => {
    visibleExecutionStatus.value = null
    executionStatusTimer = undefined
  }, remaining)
}

// 将后端稳定业务状态映射为紧凑、可本地化的卡片展示。
const executionStateDisplay = computed(() => {
  const execution = visibleExecutionStatus.value
  if (!execution) return null
  const displays: Record<string, { color: string; icon: string }> = {
    queued: { color: 'info', icon: 'mdi-clock-outline' },
    scheduled: { color: 'info', icon: 'mdi-calendar-clock-outline' },
    running: { color: 'info', icon: 'mdi-progress-clock' },
    matching: { color: 'info', icon: 'mdi-filter-search-outline' },
    searching: { color: 'primary', icon: 'mdi-magnify-scan' },
    waiting_subscription: { color: 'warning', icon: 'mdi-timer-sync-outline' },
    waiting_site_budget: { color: 'info', icon: 'mdi-timer-sand' },
    preparing: { color: 'primary', icon: 'mdi-package-variant-closed' },
    submitting: { color: 'primary', icon: 'mdi-download-network-outline' },
    skipped: { color: 'secondary', icon: 'mdi-skip-next-circle-outline' },
    failed: { color: 'error', icon: 'mdi-alert-outline' },
    cancelling: { color: 'warning', icon: 'mdi-cancel' },
    cancelled: { color: 'secondary', icon: 'mdi-cancel' },
    completed: { color: 'success', icon: 'mdi-check-circle-outline' },
  }
  const displayState = TERMINAL_EXECUTION_VISIBLE_MS[execution.state]
    ? execution.state
    : execution.phase || execution.state
  const display = displays[displayState] || displays[execution.state] || displays.running
  return {
    ...display,
    label: t(`subscribe.execution.state.${displayState}`),
  }
})

// 批量选择和排序模式保留整卡原有操作，不让执行详情抢占点击。
const canOpenExecutionDetails = computed(() => !!executionStateDisplay.value && !props.batchMode && !props.sortable)

/** 从鼠标、触屏或键盘打开执行详情，阻止同时触发订阅编辑。 */
function openExecutionDetails(event: Event) {
  if (!canOpenExecutionDetails.value) return
  event.stopPropagation()
  executionDetailsOpen.value = true
}

// 判断后端数字/布尔开关是否启用
function isEnabledFlag(value: any) {
  return value === true || value === 1 || value === '1'
}

// 订阅列表接口通常返回中文媒体类型，插件或缓存数据可能只保留剧集字段
function isTvSubscribe(media?: Subscribe) {
  return media?.type === '电视剧' || media?.type === 'tv' || !!media?.season || !!media?.total_episode
}

// 专辑订阅使用独立曲目进度；没有总曲目数的旧数据继续展示实体元数据。
const isMusicAlbumSubscribe = computed(() => {
  const total = props.media?.total_tracks || 0
  return props.media?.type === '音乐' && props.media?.music_type === 'album' && total > 0
})

// 电视剧和专辑共用卡片进度展示，但两者的完成事实分别由后端派生。
const hasSubscribeProgress = computed(() => {
  const totalEpisode = props.media?.total_episode || 0
  return totalEpisode > 0 || isMusicAlbumSubscribe.value
})

// 已下载集数：total_episode - lack_episode
const downloadedEpisode = computed(() => {
  const total = props.media?.total_episode || 0
  if (!total) return 0
  return Math.min(Math.max(total - (props.media?.lack_episode || 0), 0), total)
})

// 是否开启洗版，供电影和电视剧共用洗版标识与配色。
const hasBestVersion = computed(() => isEnabledFlag(props.media?.best_version))

// 是否为电视剧洗版订阅，仅影响分集进度条与 tooltip 的展示分支。
const isBestVersion = computed(() => hasBestVersion.value && isTvSubscribe(props.media))

const rightBottomStateDisplay = computed(() => {
  if (executionStateDisplay.value) {
    return executionStateDisplay.value
  }
  if (subscribeState.value === 'S') {
    return { icon: 'mdi-pause-circle', label: t('subscribe.cardStatePaused') }
  }
  if (subscribeState.value === 'P') {
    return { icon: 'mdi-clock', label: t('subscribe.cardStatePending') }
  }
  return null
})

// 移动端紧凑卡片的状态展示，颜色统一映射到 Vuetify 全局主题 token。
const compactStateDisplay = computed(() => {
  if (executionStateDisplay.value) {
    return executionStateDisplay.value
  }
  if (subscribeState.value === 'S') {
    return { color: 'secondary', icon: 'mdi-pause-circle-outline', label: t('subscribe.cardStatePaused') }
  }
  if (subscribeState.value === 'P') {
    return { color: 'info', icon: 'mdi-timer-sand', label: t('subscribe.cardStatePending') }
  }
  if (hasBestVersion.value) {
    return { color: 'success', icon: 'mdi-shimmer', label: t('subscribe.subscribing') }
  }
  return { color: 'primary', icon: 'mdi-rss', label: t('subscribe.subscribing') }
})

// 洗版徽标：共用 mdi-shimmer 图标，分集 / 全集 由 full 标记区分背景
const bestVersionBadge = computed(() => {
  if (!hasBestVersion.value) return null
  return {
    icon: 'mdi-shimmer',
    full: isEnabledFlag(props.media?.best_version_full),
  }
})

// 已洗版集数：取后端派生字段 completed_episode
const completedEpisode = computed(() => {
  const total = props.media?.total_episode || 0
  return Math.min(Math.max(props.media?.completed_episode ?? 0, 0), total)
})

// 已累计下载曲目数：由后端按独立音轨事实去重后返回，前端只负责显示边界内的值。
const completedTracks = computed(() => {
  const total = props.media?.total_tracks || 0
  return Math.min(Math.max(props.media?.completed_tracks ?? 0, 0), total)
})

const subscribeProgressTotal = computed(() => {
  if (isMusicAlbumSubscribe.value) return props.media?.total_tracks || 0
  return props.media?.total_episode || 0
})

const subscribeProgressDownloaded = computed(() => {
  if (isMusicAlbumSubscribe.value) return completedTracks.value
  return isBestVersion.value ? completedEpisode.value : downloadedEpisode.value
})

// 卡片主文案：已下载集数 / 总集数
const subscribeProgressText = computed(() => {
  const total = subscribeProgressTotal.value
  if (!total) return ''
  const downloaded = isMusicAlbumSubscribe.value ? completedTracks.value : downloadedEpisode.value
  return `${downloaded} / ${total}`
})

// 音乐订阅始终展示实体类型；旧数据缺少 music_type 时按既有单曲语义兼容。
const musicSubscribeMeta = computed(() => {
  if (props.media?.type !== '音乐') return null
  const currentSpecs = formatMusicAudioSpecs({
    audio_format: props.media.current_audio_format,
    bit_depth: props.media.current_bit_depth,
    sample_rate: props.media.current_sample_rate,
    bitrate: props.media.current_bitrate,
  })
  const selectedQuality = {
    hires: t('music.audioQualityHires'),
    'hires|lossless': t('music.audioQualityLossless'),
    lossy: t('music.audioQualityLossy'),
  }[props.media.audio_quality || '']
  const selectedFormat = props.media.audio_format
    ? props.media.audio_format === 'DSD|FLAC|ALAC|APE|WAV|AIFF|PCM'
      ? t('music.audioFormatLossless')
      : props.media.audio_format.replaceAll('|', '/')
    : ''
  const selectedBitrate = props.media.min_bitrate ? `≥ ${formatMusicBitrate(props.media.min_bitrate)}` : ''
  const qualityText = currentSpecs || [selectedQuality, selectedFormat, selectedBitrate].filter(Boolean).join(' · ')
  if (props.media.music_type === 'album') {
    const trackCount = props.media.total_tracks
    const entityText = trackCount
      ? `${t('music.entityAlbum')} · ${t('music.trackCount', { count: trackCount })}`
      : t('music.entityAlbum')
    return {
      icon: 'mdi-album',
      text: [entityText, qualityText].filter(Boolean).join(' · '),
    }
  }

  return {
    icon: 'mdi-music-note',
    text: [t('music.entityRecording'), qualityText].filter(Boolean).join(' · '),
  }
})

const compactStateText = computed(
  () => executionStateDisplay.value?.label || subscribeProgressText.value || musicSubscribeMeta.value?.text || '',
)

// 订阅卡片 hover 文案：
// - 普通订阅：「已下载 X · 共 Y 集」
// - 洗版订阅：「已下载 X · 已洗版 N · 共 Y 集」
const subscribeProgressTooltip = computed(() => {
  const total = subscribeProgressTotal.value
  if (!total) return ''

  if (isMusicAlbumSubscribe.value) {
    return t('subscribe.musicSubscribeProgressTooltip', {
      downloaded: completedTracks.value,
      total,
    })
  }

  if (isBestVersion.value) {
    return t('subscribe.bestVersionEpisodeProgressTooltip', {
      completed: completedEpisode.value,
      downloaded: downloadedEpisode.value,
      total,
    })
  }

  return t('subscribe.subscribeProgressTooltip', { downloaded: downloadedEpisode.value, total })
})

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 背景图加载失败后直接切换占位图，避免同一失效地址在 poster fallback 中重复请求。
function backdropErrorHandler() {
  backdropLoadError.value = true
  imageLoaded.value = true
}

// 海报加载失败后使用占位图，保留卡片布局和可点击区域。
function posterErrorHandler() {
  posterLoadError.value = true
}

// 进度条 model 段百分比：洗版订阅表示"已洗版"占比（亮段），普通订阅表示"已下载"占比
function getPercentage() {
  const total = subscribeProgressTotal.value
  if (!total) return 0
  return Math.round((subscribeProgressDownloaded.value / total) * 100)
}

// 洗版进度条的 buffer 段百分比：表示"已下载"占比，仅在洗版场景被模板调用
function getBufferPercentage() {
  const total = props.media?.total_episode || 0
  if (!isBestVersion.value || !total) return 0
  return Math.round((downloadedEpisode.value / total) * 100)
}

// 删除订阅
async function removeSubscribe() {
  try {
    await api.delete(`subscribe/${props.media?.id}`, { feedback: 'silent' })
    // 通知父组件刷新
    emit('remove')
  } catch (e) {
    $toast.error(t('subscribe.requestFailed'))
    console.log(e)
  }
}

// 复用单订阅搜索入口；提交期间防止重复点击，成功后关闭详情并刷新状态。
async function searchSubscribe() {
  if (!props.media?.id || searchSubmitting.value) return
  searchSubmitting.value = true
  try {
    const submission = await searchSubscription(props.media.id)
    const messageKey =
      submission?.queued_count === 0 && submission?.ongoing_count
        ? 'subscribe.execution.searchAlreadyRunning'
        : 'subscribe.execution.searchScheduled'
    if (messageKey === 'subscribe.execution.searchAlreadyRunning') {
      $toast.info(t(messageKey, { name: props.media?.name }))
    } else {
      $toast.success(t(messageKey, { name: props.media?.name }))
    }
    executionDetailsOpen.value = false
    emit('save')
  } catch (e) {
    $toast.error(t('subscribe.requestFailed'))
    console.log(e)
  } finally {
    searchSubmitting.value = false
  }
}

// 切换订阅状态
async function toggleSubscribeStatus(state: 'R' | 'S') {
  const action = state === 'S' ? t('common.pause') : t('common.enable')
  try {
    // 根据传入的 state 判断对应的操作文字
    // 弹出确认框
    const isConfirmed = await createConfirm({
      title: t('common.confirmAction', { action }),
      content: t('subscribe.confirmToggle', { action, name: props.media?.name }),
    })
    if (!isConfirmed) return
    // 调用 API 更新订阅状态
    await api.put(`subscribe/status/${props.media?.id}?state=${state}`, undefined, { feedback: 'silent' })
    $toast.success(t('subscribe.toggleSuccess', { name: props.media?.name, action }))
    subscribeState.value = state
    emit('save')
  } catch (e) {
    const message = getApiBusinessErrorMessage(e)
    $toast.error(message ? t('subscribe.toggleFailed', { action, message }) : t('subscribe.requestFailed'))
    console.log(e)
  }
}

// 重置订阅
async function resetSubscribe() {
  // 确认
  try {
    const isConfirmed = await createConfirm({
      title: t('common.confirm'),
      content: t('subscribe.resetConfirm', { name: props.media?.name }),
    })
    if (!isConfirmed) return
    // 重置
    if (!props.media?.id) return
    await resetSubscription(props.media.id)
    $toast.success(t('subscribe.resetSuccess', { name: props.media?.name }))
    subscribeState.value = 'R'
    emit('save')
  } catch (e) {
    const message = getApiBusinessErrorMessage(e)
    $toast.error(
      message ? t('subscribe.resetFailed', { name: props.media?.name, message }) : t('subscribe.requestFailed'),
    )
    console.log(e)
  }
}

//  分享订阅
async function shareSubscribe() {
  if (!props.media) return

  openSharedDialog(SubscribeShareDialog, { sub: props.media }, {}, { closeOn: ['close'] })
}

// 编辑订阅响应
async function editSubscribeDialog() {
  openSharedDialog(
    SubscribeEditDialog,
    { subid: props.media?.id },
    {
      remove: onSubscribeEditRemove,
      save: onSubscribeEditSave,
    },
    { closeOn: ['close', 'save', 'remove'] },
  )
}

// 获取订阅的统一媒体身份
function getMediaId() {
  if (!props.media?.media_source || !props.media.media_id) return undefined
  return { mediaSource: props.media.media_source, mediaId: String(props.media.media_id) }
}

// 查看媒体详情
async function viewMediaDetail() {
  if (props.media?.type === '音乐') {
    router.push(buildMusicDetailRoute(props.media))
    return
  }
  const identity = getMediaId()
  if (!identity) return
  router.push({
    path: '/media',
    query: {
      media_source: identity.mediaSource,
      media_id: identity.mediaId,
      title: props.media?.name,
      year: props.media?.year,
      type: props.media?.type,
    },
  })
}

// 查看文件详情
async function viewSubscribeFiles() {
  openSharedDialog(SubscribeFilesDialog, { subid: props.media?.id }, {}, { closeOn: ['close'] })
}

// 弹出菜单
const dropdownItems = computed(() => [
  {
    title: t('common.edit'),
    value: 1,
    props: {
      prependIcon: 'mdi-file-edit-outline',
      click: editSubscribeDialog,
    },
  },
  {
    title: t('common.search'),
    value: 2,
    props: {
      prependIcon: 'mdi-magnify',
      click: searchSubscribe,
    },
  },
  {
    title: subscribeState.value === 'S' ? t('common.enable') : t('common.pause'),
    value: 5,
    props: {
      prependIcon: subscribeState.value === 'S' ? 'mdi-play' : 'mdi-pause',
      click: () => toggleSubscribeStatus(subscribeState.value === 'S' ? 'R' : 'S'),
      color: subscribeState.value === 'S' ? 'success' : 'info',
    },
  },
  {
    title: t('common.reset'),
    value: 6,
    props: {
      prependIcon: 'mdi-restore-alert',
      click: resetSubscribe,
      color: 'warning',
    },
  },
  {
    title: t('common.share'),
    value: 7,
    props: {
      prependIcon: 'mdi-share',
      click: shareSubscribe,
      color: 'success',
    },
    show: props.media?.type === '电视剧',
  },
  {
    title: t('subscribe.mediaDetail'),
    value: 3,
    props: {
      prependIcon: 'mdi-information-outline',
      click: viewMediaDetail,
    },
  },
  {
    title: t('subscribe.fileStatistics'),
    value: 4,
    props: {
      prependIcon: 'mdi-file-document-outline',
      click: viewSubscribeFiles,
    },
    show: props.media?.type !== '音乐',
  },
  {
    title: t('common.unsubscribe'),
    value: 8,
    props: {
      prependIcon: 'mdi-trash-can-outline',
      color: 'error',
      click: removeSubscribe,
    },
  },
])

// 监听插件窗口状态变化
watch(
  () => props.media?.page_open,
  (newOpenState, _) => {
    if (newOpenState) editSubscribeDialog()
  },
  { immediate: true },
)

// 监听订阅状态
watch(
  () => props.media?.state,
  newState => {
    subscribeState.value = newState ?? 'P'
  },
)

watch(
  () => props.media?.execution_status,
  execution => syncVisibleExecutionStatus(execution),
  { immediate: true },
)

// 卡片复用或换任务时关闭旧详情；同一任务的阶段更新仍实时呈现。
watch(
  [() => props.media?.id, () => props.media?.execution_status?.task_id, () => props.media?.execution_status?.batch_id],
  () => {
    executionDetailsOpen.value = false
  },
)

onBeforeUnmount(() => clearExecutionStatusTimer())

// 切换订阅记录时重新尝试加载图片，避免复用卡片组件后沿用旧的失败状态。
// 必须逐项比较：列表刷新会传入内容相同的新对象，此时图片地址不变、不会再触发 load，
// 若误重置 imageLoaded，竖版海报会一直隐藏。
watch([() => props.media?.id, () => props.media?.backdrop, () => props.media?.poster], () => {
  imageLoaded.value = false
  backdropLoadError.value = false
  posterLoadError.value = false
})

// 媒体占位图标：电影/电视剧/音乐各自使用对应图标，缺失封面时统一渲染图标 + 底色占位
const placeholderIcon = computed(() => {
  switch (props.media?.type) {
    case '音乐':
      return 'mdi-album'
    case '电视剧':
      return 'mdi-television-classic'
    case '电影':
    default:
      return 'mdi-movie-open-outline'
  }
})

// 计算backdrop图片地址
const backdropUrl = computed(() => {
  if (backdropLoadError.value) return ''
  const url = props.media?.backdrop || props.media?.poster
  if (!url) return ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算海报图片地址
const posterUrl = computed(() => {
  if (posterLoadError.value) return ''
  const url = props.media?.poster || props.media?.backdrop
  if (!url) return ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 桌面卡左侧竖版海报：背景图加载完成且海报地址可用时才显示
const showDesktopPoster = computed(() => imageLoaded.value && !!posterUrl.value)

// 缺失封面时展示媒体占位背景（图标 + 底色），对齐音乐媒体卡片
const showPlaceholder = computed(() => !backdropUrl.value)

// 桌面卡片左侧纯色底取自竖版海报主色；读不到海报像素时保持 null，由样式回退到中性深色。
const posterTone = ref<PosterTone | null>(null)

// 只在桌面布局采样，移动端不使用该底色；切换海报后丢弃过期结果，避免复用卡片时串色。
watch(
  () => (display.smAndUp.value ? posterUrl.value : ''),
  async url => {
    posterTone.value = null
    if (!url) return
    const tone = await loadPosterTone(url)
    if (posterUrl.value === url) posterTone.value = tone
  },
  { immediate: true },
)

// 明度固定压到深色区间，保证卡片上的白字在任何海报色相下都可读。
const desktopToneStyle = computed(() =>
  posterTone.value
    ? { '--subscribe-card-tone': `hsl(${posterTone.value.hue} ${posterTone.value.saturation}% 16%)` }
    : undefined,
)

// 占位背景出现时同步标记图片已加载，让卡片正文与徽标正常渲染
watch(
  showPlaceholder,
  show => {
    if (show) imageLoaded.value = true
  },
  { immediate: true },
)

// 订阅编辑保存
function onSubscribeEditSave() {
  emit('save')
}

// 订阅编辑取消
function onSubscribeEditRemove() {
  emit('remove')
}

// 处理卡片点击事件
function handleCardClick() {
  if (props.sortable) {
    return
  }

  if (props.batchMode) {
    // 批量模式下触发选择事件
    emit('select')
  } else {
    // 非批量模式下打开编辑弹窗
    editSubscribeDialog()
  }
}
</script>

<template>
  <div>
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
        <div v-bind="hover.props" class="subscribe-card-hover-area w-full h-full">
          <div
            class="subscribe-card-shell app-hover-lift-card w-full h-full relative"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering && !props.sortable,
              'subscribe-card-shell--selected': props.batchMode && props.selected,
            }"
          >
            <VCard
              :key="props.media?.id"
              class="subscribe-card flex flex-col h-full overflow-hidden"
              :class="{
                'subscribe-card-paused': subscribeState === 'S',
                'subscribe-card-pending-tint': subscribeState === 'P',
                'subscribe-card-best-version-tint': display.xs.value && hasBestVersion && subscribeState === 'R',
                'subscribe-card-window': display.smAndUp.value,
                'cursor-move': props.sortable,
              }"
              :style="display.smAndUp.value ? desktopToneStyle : undefined"
              min-height="150"
              @click="handleCardClick"
              :ripple="display.smAndUp.value && !props.batchMode && !props.sortable"
            >
              <div
                v-if="bestVersionBadge && imageLoaded && display.smAndUp.value"
                class="best-version-badge"
                :class="{ 'best-version-badge-full': bestVersionBadge.full }"
              >
                <VIcon :icon="bestVersionBadge.icon" color="white" size="16" />
              </div>
              <div v-if="!props.sortable && display.smAndUp.value" class="me-n3 absolute top-1 right-4">
                <IconBtn @click.stop>
                  <VIcon icon="mdi-dots-vertical" color="white" />
                  <VMenu activator="parent" close-on-content-click>
                    <VList>
                      <template v-for="(item, i) in dropdownItems" :key="i">
                        <VListItem v-if="item.show !== false" :base-color="item.props.color" @click="item.props.click">
                          <template #prepend>
                            <VIcon :icon="item.props.prependIcon" />
                          </template>
                          <VListItemTitle v-text="item.title" />
                        </VListItem>
                      </template>
                    </VList>
                  </VMenu>
                </IconBtn>
              </div>
              <template #image v-if="display.smAndUp.value">
                <div
                  v-if="showPlaceholder"
                  class="subscribe-card-placeholder subscribe-card-placeholder--cover d-flex align-center justify-center relative"
                >
                  <VIcon :icon="placeholderIcon" size="64" color="medium-emphasis" />
                  <div class="absolute inset-0 outline-none subscribe-card-background"></div>
                </div>
                <!-- 海报色底板放在图片层而不是卡片背景上，主题对卡片背景的覆盖不会影响它 -->
                <div v-if="!showPlaceholder" class="subscribe-card-window-base"></div>
                <!-- 背景图只占右侧画窗，从左侧海报色暗影中浮现，不与竖版海报重叠 -->
                <VImg
                  v-if="!showPlaceholder"
                  class="subscribe-card-backdrop"
                  :src="backdropUrl || posterUrl"
                  cover
                  @load="imageLoadHandler"
                  @error="backdropErrorHandler"
                  position="center top"
                >
                  <template #placeholder>
                    <div class="w-full h-full">
                      <VSkeletonLoader class="h-full" />
                    </div>
                  </template>
                  <template #default>
                    <div class="subscribe-card-backdrop-shade"></div>
                  </template>
                </VImg>
                <div v-if="!showPlaceholder" class="subscribe-card-window-scrim"></div>
              </template>

              <template v-if="display.xs.value">
                <div class="subscribe-card-mobile-media">
                  <div
                    v-if="showPlaceholder"
                    class="subscribe-card-placeholder d-flex align-center justify-center relative"
                  >
                    <VIcon :icon="placeholderIcon" size="64" color="medium-emphasis" />
                    <div class="absolute inset-0 outline-none subscribe-card-background"></div>
                  </div>
                  <VImg
                    v-else
                    :src="backdropUrl || posterUrl"
                    :aspect-ratio="16 / 9"
                    cover
                    position="top"
                    @load="imageLoadHandler"
                    @error="backdropErrorHandler"
                  >
                    <template #placeholder>
                      <VSkeletonLoader class="h-full w-full" />
                    </template>
                  </VImg>
                  <div class="subscribe-card-mobile-image-scrim subscribe-card-background"></div>

                  <div v-if="props.source || lastUpdateText" class="subscribe-card-mobile-image-meta">
                    <!-- 来源只放头像徽标在左上角，与右上角更新时间对称 -->
                    <SubscribeSourceMark
                      v-if="props.source"
                      :source="props.source"
                      class="subscribe-card-mobile-image-meta__item subscribe-card-mobile-image-meta__source"
                    />
                    <div
                      v-if="lastUpdateText"
                      class="subscribe-card-mobile-image-meta__item subscribe-card-mobile-image-meta__updated"
                    >
                      <VIcon icon="mdi-download" size="14" />
                      <span>{{ lastUpdateText }}</span>
                    </div>
                  </div>

                  <div class="subscribe-card-mobile-title">
                    <div class="subscribe-card-mobile-title-text">
                      <span>{{ props.media?.name }}</span>
                      <span
                        v-if="formatSeasonLabel(props.media?.season, t('media.specials'))"
                        class="subscribe-card-mobile-season"
                      >
                        {{ formatSeasonLabel(props.media?.season, t('media.specials')) }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="subscribe-card-mobile-body">
                  <div class="subscribe-card-mobile-footer">
                    <div class="subscribe-card-mobile-meta">
                      <component
                        :is="canOpenExecutionDetails ? 'button' : 'div'"
                        :type="canOpenExecutionDetails ? 'button' : undefined"
                        class="subscribe-card-mobile-state text-start"
                        :style="{ color: `rgb(var(--v-theme-${compactStateDisplay.color}))` }"
                        :title="compactStateDisplay.label"
                        :aria-label="
                          canOpenExecutionDetails ? t('subscribe.execution.details') : compactStateDisplay.label
                        "
                        @click="openExecutionDetails"
                      >
                        <VIcon
                          :icon="compactStateDisplay.icon"
                          :data-subscribe-state-icon="compactStateDisplay.icon"
                          size="16"
                        />
                        <span v-if="compactStateText" class="subscribe-card-mobile-progress-text">
                          {{ compactStateText }}
                        </span>
                      </component>

                      <IconBtn v-if="!props.sortable" class="subscribe-card-mobile-menu" size="small" @click.stop>
                        <VIcon icon="mdi-dots-horizontal" size="18" />
                        <VMenu activator="parent" close-on-content-click>
                          <VList>
                            <template v-for="(item, i) in dropdownItems" :key="i">
                              <VListItem
                                v-if="item.show !== false"
                                :base-color="item.props.color"
                                @click="item.props.click"
                              >
                                <template #prepend>
                                  <VIcon :icon="item.props.prependIcon" />
                                </template>
                                <VListItemTitle v-text="item.title" />
                              </VListItem>
                            </template>
                          </VList>
                        </VMenu>
                      </IconBtn>
                    </div>

                    <div v-if="hasSubscribeProgress" class="subscribe-card-mobile-progress">
                      <VProgressLinear
                        :model-value="getPercentage()"
                        :bg-color="compactStateDisplay.color"
                        :color="compactStateDisplay.color"
                        bg-opacity="0.18"
                        height="3"
                        rounded
                      />
                    </div>
                  </div>
                </div>
              </template>

              <div v-else>
                <VCardText class="subscribe-card-desktop-text flex flex-1 items-center pt-3 pb-9">
                  <!-- 海报外包一层定位容器：海报本身裁切圆角，来源徽标需要越出海报右下角 -->
                  <div v-if="showDesktopPoster" class="subscribe-card-poster-frame relative w-12 flex-shrink-0">
                    <div
                      class="subscribe-card-poster h-auto w-12 overflow-hidden rounded-md relative"
                      :class="{ 'cursor-move': props.sortable && display.mdAndUp.value }"
                    >
                      <VImg :src="posterUrl" aspect-ratio="2/3" cover @error="posterErrorHandler">
                        <template #placeholder>
                          <div class="w-full h-full">
                            <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                          </div>
                        </template>
                      </VImg>
                    </div>
                    <!-- 来源徽标挂在海报右下角，与左上角的洗版徽标错开 -->
                    <SubscribeSourceMark
                      v-if="props.source"
                      :source="props.source"
                      class="subscribe-card-poster-source"
                    />
                  </div>
                  <div class="subscribe-card-meta flex flex-1 flex-col justify-center min-w-0 pl-2 xl:pl-4">
                    <div class="text-sm font-medium text-white sm:pt-1">{{ props.media?.year }}</div>
                    <div class="mr-2 min-w-0 text-lg font-bold text-white text-ellipsis overflow-hidden line-clamp-2">
                      {{ props.media?.name }}
                      {{ formatSeasonLabel(props.media?.season, t('media.specials')) }}
                    </div>
                  </div>
                </VCardText>
                <!-- 底部单行：左侧进度或音乐规格，右侧执行状态、暂停/待定或更新时间 -->
                <VCardText
                  class="subscribe-card-desktop-text subscribe-card-footer absolute inset-x-0 bottom-1 z-10 flex min-w-0 align-center px-3 py-2"
                >
                  <div class="flex flex-1 min-w-0 align-center">
                    <VIcon
                      v-if="hasSubscribeProgress && props.sortable"
                      icon="mdi-progress-download"
                      size="small"
                      color="white"
                      class="me-1"
                    />
                    <IconBtn
                      v-else-if="hasSubscribeProgress"
                      size="small"
                      v-bind="props"
                      icon="mdi-progress-download"
                      color="white"
                    />
                    <!-- 电视剧按集数、专辑按曲目数展示持续进度；无总数的旧专辑仍走实体元数据。 -->
                    <div v-if="hasSubscribeProgress" class="flex-shrink-0 text-subtitle-2 me-2 text-white">
                      {{ subscribeProgressText }}
                      <VTooltip v-if="subscribeProgressTooltip" activator="parent" location="top">
                        {{ subscribeProgressTooltip }}
                      </VTooltip>
                    </div>
                    <!-- 音乐规格可能很长，与右侧状态同行时截断，完整内容放在 title 中 -->
                    <div
                      v-if="musicSubscribeMeta"
                      class="flex min-w-0 align-center text-subtitle-2 me-2 text-white"
                      :title="musicSubscribeMeta.text"
                    >
                      <VIcon :icon="musicSubscribeMeta.icon" size="small" class="flex-shrink-0 me-1" />
                      <span class="min-w-0 truncate">{{ musicSubscribeMeta.text }}</span>
                    </div>
                  </div>
                  <!-- 右侧元数据：执行中 / 暂停 / 待定时替换"x 天前"为状态文案 -->
                  <component
                    :is="canOpenExecutionDetails ? 'button' : 'div'"
                    v-if="rightBottomStateDisplay"
                    :type="canOpenExecutionDetails ? 'button' : undefined"
                    class="subscribe-card-footer-meta d-flex flex-shrink-0 align-center text-xs"
                    :style="
                      executionStateDisplay
                        ? { color: `rgb(var(--v-theme-${executionStateDisplay.color}))` }
                        : undefined
                    "
                    :title="rightBottomStateDisplay.label"
                    :aria-label="canOpenExecutionDetails ? t('subscribe.execution.details') : undefined"
                    @click="openExecutionDetails"
                  >
                    <VIcon :icon="rightBottomStateDisplay.icon" class="me-1" />
                    {{ rightBottomStateDisplay.label }}
                  </component>
                  <div
                    v-else-if="lastUpdateText"
                    class="subscribe-card-footer-meta d-flex flex-shrink-0 align-center text-xs"
                  >
                    <VIcon icon="mdi-download" class="me-1" />
                    {{ lastUpdateText }}
                  </div>
                </VCardText>
                <div class="w-full absolute bottom-0">
                  <!--
                  分集洗版模式：底色保持深绿、buffer 段显示"已下载未洗版"为浅绿、model 段显示"已洗版完成"为亮绿，
                  形成两段语义；其余订阅维持原有单段进度条
                -->
                  <VProgressLinear
                    v-if="isBestVersion && getBufferPercentage() > 0"
                    :model-value="getPercentage()"
                    :buffer-value="getBufferPercentage()"
                    bg-color="success"
                    bg-opacity="0.25"
                    color="success"
                    buffer-color="success"
                    buffer-opacity="0.55"
                  />
                  <VProgressLinear
                    v-else-if="getPercentage() > 0"
                    :model-value="getPercentage()"
                    bg-color="success"
                    color="success"
                  />
                </div>
              </div>
            </VCard>
          </div>
        </div>
      </template>
    </VHover>
    <SubscribeExecutionDialog
      v-if="executionDetailsOpen && props.media?.execution_status"
      :execution="props.media.execution_status"
      :name="props.media.name"
      can-retry
      :retrying="searchSubmitting"
      @close="executionDetailsOpen = false"
      @retry="searchSubscribe"
    />
  </div>
</template>
<style lang="scss" scoped>
.subscribe-card-hover-area {
  inline-size: 100%;
}

/**
 * 订阅卡片外壳：选中态虚线框复用同一圆角，避免 outline 在圆角卡片外形成直角。
 */
.subscribe-card-shell {
  border-radius: var(--app-surface-radius);
}

.subscribe-card {
  border: var(--app-card-light-border);
}

.subscribe-card-mobile-media {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  inline-size: 100%;
}

.subscribe-card-mobile-media .v-img {
  block-size: 100%;
}

.subscribe-card-mobile-image-scrim {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
}

.subscribe-card-mobile-image-meta {
  position: absolute;
  z-index: 2;
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  inset-block-start: 0.5rem;
  inset-inline: 0.5rem;
  pointer-events: none;
}

.subscribe-card-mobile-image-meta__item {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.25rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
}

/* 手机没有悬停，徽标常驻，同样降饱和压暗而不做透明 */
.subscribe-card-mobile-image-meta__source {
  flex: 0 1 auto;
  filter: saturate(0.5) brightness(0.85);
}

.subscribe-card-mobile-image-meta__updated {
  flex-shrink: 0;
  margin-inline-start: auto;
  color: rgba(255, 255, 255, 0.84);
}

.subscribe-card-mobile-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.25rem 0.625rem 0.375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.subscribe-card-mobile-title {
  position: absolute;
  z-index: 2;
  color: white;
  font-size: 1rem;
  font-weight: 650;
  inset-block-end: 0;
  inset-inline: 0;
  line-height: 1.3;
  padding: 1rem 0.75rem 0.625rem;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95);
}

.subscribe-card-mobile-title-text {
  display: -webkit-box;
  max-block-size: 3.9em;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.subscribe-card-mobile-season {
  margin-inline-start: 0.25rem;
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
}

.subscribe-card-mobile-footer {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  margin-block-start: auto;
}

.subscribe-card-mobile-meta {
  display: flex;
  min-inline-size: 0;
  min-block-size: 1.75rem;
  align-items: center;
  gap: 0.25rem;
  justify-content: space-between;
}

.subscribe-card-mobile-state {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  flex: 1 1 auto;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
  white-space: nowrap;
}

.subscribe-card-mobile-state span {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态与集数共用单行槽位，小屏空间不足时允许省略而不挤压操作按钮。 */
.subscribe-card-mobile-progress-text {
  min-inline-size: 0;
  flex-shrink: 1;
}

.subscribe-card-mobile-menu {
  block-size: 1.75rem;
  min-block-size: 1.75rem;
  inline-size: 1.75rem;
  min-inline-size: 1.75rem;
  flex: 0 0 1.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.subscribe-card-mobile-progress {
  display: flex;
  block-size: 3px;
  inline-size: 100%;
}

.subscribe-card-mobile-progress .v-progress-linear {
  flex: 1 1 auto;
}

.subscribe-card-shell--selected::after {
  position: absolute;
  z-index: 5;
  border: 2px solid rgb(var(--v-theme-primary));
  border-radius: inherit;
  content: '';
  inset: 0;
  pointer-events: none;
}

.subscribe-card-background {
  background-image: linear-gradient(180deg, rgba(31, 41, 55, 47%) 0%, rgb(31, 41, 55) 100%);
}

/**
 * 桌面卡片「右侧画窗」：左侧是取自竖版海报主色的纯色底，放海报和文字；
 * 背景图只占右侧，先被同色调暗影压暗再浮现，海报与背景不叠在一起，各自清晰。
 * 卡片文字始终为白色，所以底色在亮色主题下也保持深色。
 */
.subscribe-card-window {
  --subscribe-card-tone-fallback: #1d2026;
}

/* 底板铺满整张卡片，位于图片层最底部；玻璃等主题会以 !important 覆盖卡片背景，所以不画在卡片本身上。 */
.subscribe-card-window-base {
  position: absolute;
  background-color: var(--subscribe-card-tone, var(--subscribe-card-tone-fallback, #1d2026));
  inset: 0;
}

/* 画窗从卡片约 18% 处开始；透明度只负责最左一小段以消除硬边，主要过渡交给下方的同色调暗影。 */
.subscribe-card-backdrop {
  position: absolute;
  block-size: 100%;
  inset-block: 0;
  inset-inline: 18% 0;
  mask-image: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0%) 0%,
    rgba(0, 0, 0, 10%) 5%,
    rgba(0, 0, 0, 32%) 10%,
    rgba(0, 0, 0, 60%) 15%,
    rgba(0, 0, 0, 84%) 20%,
    rgba(0, 0, 0, 96%) 25%,
    #000 30%
  );
}

/* 同色调暗影按缓动曲线从左向右退开：主体落在过渡带时只是偏暗，不会变成半透明。 */
.subscribe-card-backdrop-shade {
  --shade: var(--subscribe-card-tone, var(--subscribe-card-tone-fallback, #1d2026));

  position: absolute;
  background: linear-gradient(
    90deg,
    var(--shade) 0%,
    color-mix(in srgb, var(--shade) 97%, transparent) 8%,
    color-mix(in srgb, var(--shade) 90%, transparent) 16%,
    color-mix(in srgb, var(--shade) 78%, transparent) 24%,
    color-mix(in srgb, var(--shade) 62%, transparent) 32%,
    color-mix(in srgb, var(--shade) 45%, transparent) 40%,
    color-mix(in srgb, var(--shade) 28%, transparent) 48%,
    color-mix(in srgb, var(--shade) 14%, transparent) 56%,
    color-mix(in srgb, var(--shade) 5%, transparent) 64%,
    transparent 72%
  );
  inset: 0;
}

/* 底部信息行与右上角菜单的压暗层，覆盖整张卡片，保证亮色画面上的文字和图标可读。 */
.subscribe-card-window-scrim {
  position: absolute;
  background:
    radial-gradient(70px 56px at 100% 0%, rgba(0, 0, 0, 50%) 0%, transparent 100%),
    linear-gradient(0deg, rgba(0, 0, 0, 60%) 0%, rgba(0, 0, 0, 35%) 40%, transparent 70%);
  inset: 0;
  pointer-events: none;
}

/* 来源徽标越出海报右下角约 5px，层级高于海报但低于卡片菜单。
   平时降饱和、压暗来降低存在感，但保持不透明，避免透出海报像渲染残缺；
   悬停卡片时只提亮到中间档，跳变幅度与卡片上浮反馈相当，不像被“点亮”成可点击状态。 */
.subscribe-card-poster-source {
  position: absolute;
  z-index: 2;
  filter: saturate(0.5) brightness(0.8);
  inset-block-end: -5px;
  inset-inline-end: -5px;
  transition: filter 0.2s ease;
}

.subscribe-card-hover-area:hover .subscribe-card-poster-source {
  filter: saturate(0.85) brightness(0.95);
}

/* 竖版海报是识别订阅的主体，用投影和细描边把它从底色中托出来。 */
.subscribe-card-poster {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 14%),
    0 6px 14px rgba(0, 0, 0, 45%);
}

/* 标题区和底部信息可能叠在背景画面上，用轻阴影保持白字可读。 */
.subscribe-card-desktop-text {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 50%);
}

.subscribe-card-footer-meta {
  color: rgba(255, 255, 255, 76%);
  padding-inline-start: 0.5rem;
  white-space: nowrap;
}

/* 缺失封面时的媒体占位背景（图标 + 底色），对齐音乐媒体卡片 */
.subscribe-card-placeholder {
  block-size: 100%;
  inline-size: 100%;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* 桌面版占位与图片同高，避免无图时卡片整体塌陷上浮 */
.subscribe-card-placeholder--cover {
  aspect-ratio: 3 / 2;
}

/**
 * 暂停：降低不透明度表达"已停止活动"
 */
.subscribe-card-paused {
  opacity: 0.65;
  transition: opacity 0.2s ease;
}

/**
 * 待定：内发光挂在实际 VCard 上，跟随卡片圆角并被 overflow-hidden 裁剪。
 */
.subscribe-card-pending-tint {
  position: relative;
}

.subscribe-card-pending-tint::after {
  position: absolute;
  z-index: 3;
  border-radius: inherit;
  box-shadow: inset 0 0 48px rgba(var(--v-theme-info), 0.28);
  content: '';
  inset: 0;
  pointer-events: none;
}

/**
 * 洗版标识：桌面端左上角使用 24x24 圆形徽标。
 * 分集：深色半透底 + 模糊
 * 全集：磨砂玻璃半透白底 + 大模糊
 */
.best-version-badge {
  position: absolute;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  backdrop-filter: blur(6px);
  background: rgba(0, 0, 0, 75%);
  block-size: 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 50%);
  inline-size: 24px;
  inset-block-start: 6px;
  inset-inline-start: 8px;
}

.best-version-badge-full {
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 22%);
  box-shadow: 0 2px 8px rgba(255, 255, 255, 15%);
}

@media (width <= 599px) {
  .subscribe-card {
    min-block-size: 0 !important;
  }

  .subscribe-card-background.subscribe-card-mobile-image-scrim {
    background-image:
      linear-gradient(180deg, rgba(8, 12, 18, 0.28) 0%, rgba(8, 12, 18, 0) 44%),
      linear-gradient(0deg, rgba(8, 12, 18, 0.7) 0%, rgba(8, 12, 18, 0) 72%);
  }

  .subscribe-card-paused {
    opacity: 1;
  }

  .subscribe-card-paused .subscribe-card-mobile-media .v-img {
    filter: saturate(0.65);
    opacity: 0.58;
  }

  .subscribe-card-pending-tint::after {
    box-shadow:
      inset 0 0 0 1px rgba(var(--v-theme-info), 0.28),
      inset 0 -4rem 5rem rgba(var(--v-theme-info), 0.08);
  }

  .subscribe-card-best-version-tint {
    position: relative;
  }

  .subscribe-card-best-version-tint::after {
    position: absolute;
    z-index: 3;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 1px rgba(var(--v-theme-success), 0.34),
      inset 0 -4rem 5rem rgba(var(--v-theme-success), 0.12);
    content: '';
    inset: 0;
    pointer-events: none;
  }
}
</style>
