<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateDifference } from '@/@core/utils/formatters'
import { formatSeasonLabel } from '@/@core/utils/season'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { Subscribe } from '@/api/types'
import router from '@/router'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { buildMusicDetailRoute, formatMusicAudioSpecs, formatMusicBitrate } from '@/utils/music'

const COMPLETED_EXECUTION_VISIBLE_MS = 5_000

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

// 成功终态只承担短暂反馈，卡片随后恢复订阅自身的长期进度。
const visibleExecutionStatus = ref<Subscribe['execution_status'] | null>(null)
let completedExecutionTimer: ReturnType<typeof setTimeout> | undefined

// 清理上一条成功终态的恢复计时器，避免卡片复用后由旧任务覆盖新状态。
function clearCompletedExecutionTimer() {
  if (!completedExecutionTimer) return
  clearTimeout(completedExecutionTimer)
  completedExecutionTimer = undefined
}

// 活动与异常状态持续展示；成功完成仅在后端更新时间后的短窗口内展示。
function syncVisibleExecutionStatus(execution: Subscribe['execution_status']) {
  clearCompletedExecutionTimer()
  visibleExecutionStatus.value = execution
  if (!execution || (execution.state !== 'completed' && execution.phase !== 'completed')) return

  const updatedAt = Date.parse(execution.updated_at)
  const elapsed = Number.isFinite(updatedAt) ? Math.max(0, Date.now() - updatedAt) : 0
  const remaining = COMPLETED_EXECUTION_VISIBLE_MS - elapsed
  if (remaining <= 0) {
    visibleExecutionStatus.value = null
    return
  }

  completedExecutionTimer = setTimeout(() => {
    visibleExecutionStatus.value = null
    completedExecutionTimer = undefined
  }, remaining)
}

// 将后端稳定业务状态映射为紧凑、可本地化的卡片展示。
const executionStateDisplay = computed(() => {
  const execution = visibleExecutionStatus.value
  if (!execution) return null
  const displays: Record<string, { color: string; icon: string }> = {
    queued: { color: 'info', icon: 'mdi-clock-outline' },
    running: { color: 'info', icon: 'mdi-progress-clock' },
    matching: { color: 'info', icon: 'mdi-filter-search-outline' },
    searching: { color: 'primary', icon: 'mdi-magnify-scan' },
    waiting_site_budget: { color: 'warning', icon: 'mdi-timer-sand' },
    preparing: { color: 'primary', icon: 'mdi-package-variant-closed' },
    submitting: { color: 'primary', icon: 'mdi-download-network-outline' },
    skipped: { color: 'secondary', icon: 'mdi-skip-next-circle-outline' },
    failed: { color: 'error', icon: 'mdi-alert-outline' },
    cancelling: { color: 'warning', icon: 'mdi-cancel' },
    cancelled: { color: 'secondary', icon: 'mdi-cancel' },
    completed: { color: 'success', icon: 'mdi-check-circle-outline' },
  }
  const display = displays[execution.state] || displays[execution.phase] || displays.running
  return {
    ...display,
    label: t(`subscribe.execution.state.${execution.state}`),
    error: execution.error,
  }
})

// 判断后端数字/布尔开关是否启用
function isEnabledFlag(value: any) {
  return value === true || value === 1 || value === '1'
}

// 订阅列表接口通常返回中文媒体类型，插件或缓存数据可能只保留剧集字段
function isTvSubscribe(media?: Subscribe) {
  return media?.type === '电视剧' || media?.type === 'tv' || !!media?.season || !!media?.total_episode
}

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

// 卡片主文案：已下载集数 / 总集数
const subscribeProgressText = computed(() => {
  const total = props.media?.total_episode || 0
  if (!total) return ''
  return `${downloadedEpisode.value} / ${total}`
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
  const total = props.media?.total_episode || 0
  if (!total) return ''

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
  const total = props.media?.total_episode || 0
  if (!total) return 0
  const value = isBestVersion.value ? completedEpisode.value : downloadedEpisode.value
  return Math.round((value / total) * 100)
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

// 搜索订阅
async function searchSubscribe() {
  try {
    await api.get(`subscribe/search/${props.media?.id}`, { feedback: 'silent' })
    $toast.success(t('subscribe.execution.searchSubmitted', { name: props.media?.name }))
    emit('save')
  } catch (e) {
    $toast.error(t('subscribe.requestFailed'))
    console.log(e)
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
    await api.get(`subscribe/reset/${props.media?.id}`, { feedback: 'silent' })
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

onBeforeUnmount(() => clearCompletedExecutionTimer())

// 切换订阅记录时重新尝试加载图片，避免复用卡片组件后沿用旧的失败状态。
watch(
  () => [props.media?.id, props.media?.backdrop, props.media?.poster],
  () => {
    imageLoaded.value = false
    backdropLoadError.value = false
    posterLoadError.value = false
  },
)

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

// 缺失封面时展示媒体占位背景（图标 + 底色），对齐音乐媒体卡片
const showPlaceholder = computed(() => !backdropUrl.value)

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
                'cursor-move': props.sortable,
              }"
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
                <VImg
                  v-else
                  :src="backdropUrl || posterUrl"
                  aspect-ratio="3/2"
                  cover
                  @load="imageLoadHandler"
                  @error="backdropErrorHandler"
                  position="top"
                >
                  <template #placeholder>
                    <div class="w-full h-full">
                      <VSkeletonLoader class="object-cover aspect-w-3 aspect-h-2" />
                    </div>
                  </template>
                  <template #default>
                    <div class="absolute inset-0 outline-none subscribe-card-background"></div>
                  </template>
                </VImg>
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

                  <div v-if="props.media?.username || lastUpdateText" class="subscribe-card-mobile-image-meta">
                    <div
                      v-if="props.media?.username"
                      class="subscribe-card-mobile-image-meta__item subscribe-card-mobile-image-meta__user"
                      :title="props.media?.username"
                    >
                      <VIcon icon="mdi-account" size="14" />
                      <span>{{ props.media?.username }}</span>
                    </div>
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
                      <VTooltip
                        :text="executionStateDisplay?.error"
                        :disabled="!executionStateDisplay?.error"
                        location="top"
                      >
                        <template #activator="{ props: tooltipProps }">
                          <div
                            v-bind="tooltipProps"
                            class="subscribe-card-mobile-state"
                            :style="{ color: `rgb(var(--v-theme-${compactStateDisplay.color}))` }"
                            :title="executionStateDisplay?.error || compactStateDisplay.label"
                            :aria-label="compactStateDisplay.label"
                          >
                            <VIcon
                              :icon="compactStateDisplay.icon"
                              :data-subscribe-state-icon="compactStateDisplay.icon"
                              size="16"
                            />
                            <span v-if="compactStateText" class="subscribe-card-mobile-progress-text">
                              {{ compactStateText }}
                            </span>
                          </div>
                        </template>
                      </VTooltip>

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

                    <div v-if="props.media?.total_episode" class="subscribe-card-mobile-progress">
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
                <VCardText class="flex flex-1 items-center pt-3 pb-9">
                  <div
                    class="h-auto w-12 flex-shrink-0 overflow-hidden rounded-md relative"
                    v-if="imageLoaded && posterUrl"
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
                  <div class="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
                    <div class="text-sm font-medium text-white sm:pt-1">{{ props.media?.year }}</div>
                    <div
                      class="mr-2 min-w-0 text-lg font-bold text-white text-ellipsis overflow-hidden line-clamp-2 ..."
                    >
                      {{ props.media?.name }}
                      {{ formatSeasonLabel(props.media?.season, t('media.specials')) }}
                    </div>
                  </div>
                </VCardText>
                <VCardText
                  class="absolute inset-x-0 bottom-2 z-10 flex min-w-0 justify-space-between align-center flex-wrap px-3"
                >
                  <div class="flex min-w-0 max-w-full align-center">
                    <VIcon
                      v-if="props.media?.total_episode && props.sortable"
                      icon="mdi-progress-download"
                      size="small"
                      color="white"
                      class="me-1"
                    />
                    <IconBtn
                      v-else-if="props.media?.total_episode"
                      size="small"
                      v-bind="props"
                      icon="mdi-progress-download"
                      color="white"
                    />
                    <!-- 守卫改用 total_episode：电视剧订阅可能不带 season 字段（旧数据或自定义来源），仍应展示集数进度 -->
                    <div v-if="props.media?.total_episode" class="flex-shrink-0 text-subtitle-2 me-2 text-white">
                      {{ subscribeProgressText }}
                      <VTooltip v-if="subscribeProgressTooltip" activator="parent" location="top">
                        {{ subscribeProgressTooltip }}
                      </VTooltip>
                    </div>
                    <div
                      v-else-if="musicSubscribeMeta"
                      class="flex flex-shrink-0 align-center text-subtitle-2 me-2 text-white"
                    >
                      <VIcon :icon="musicSubscribeMeta.icon" size="small" class="me-1" />
                      {{ musicSubscribeMeta.text }}
                    </div>
                    <VIcon
                      v-if="props.media?.username && props.sortable"
                      icon="mdi-account"
                      size="small"
                      color="white"
                      class="flex-shrink-0 me-1"
                    />
                    <IconBtn
                      v-else-if="props.media?.username"
                      icon="mdi-account"
                      size="small"
                      color="white"
                      class="flex-shrink-0"
                    />
                    <!-- 用户名过长时限制在卡片宽度内，并用省略号展示剩余内容 -->
                    <span
                      v-if="props.media?.username"
                      class="min-w-0 truncate text-subtitle-2 text-white"
                      :title="props.media?.username"
                    >
                      {{ props.media?.username }}
                    </span>
                  </div>
                </VCardText>
                <!-- 右下角元数据：暂停 / 待定时替换"x 天前"为状态文案 -->
                <VTooltip
                  v-if="rightBottomStateDisplay"
                  :text="executionStateDisplay?.error"
                  :disabled="!executionStateDisplay?.error"
                  location="top"
                >
                  <template #activator="{ props: tooltipProps }">
                    <VCardText
                      v-bind="tooltipProps"
                      class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300 text-xs"
                      :style="
                        executionStateDisplay
                          ? { color: `rgb(var(--v-theme-${executionStateDisplay.color}))` }
                          : undefined
                      "
                      :title="executionStateDisplay?.error || rightBottomStateDisplay.label"
                    >
                      <VIcon :icon="rightBottomStateDisplay.icon" class="me-1" />
                      {{ rightBottomStateDisplay.label }}
                    </VCardText>
                  </template>
                </VTooltip>
                <VCardText
                  v-else-if="lastUpdateText"
                  class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300 text-xs"
                >
                  <VIcon icon="mdi-download" class="me-1" />
                  {{ lastUpdateText }}
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

.subscribe-card-mobile-image-meta__user {
  flex: 1 1 auto;
}

.subscribe-card-mobile-image-meta__user span {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.subscribe-card-mobile-progress-text {
  flex-shrink: 0;
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
