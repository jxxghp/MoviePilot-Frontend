<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import { formatDateDifference } from '@/@core/utils/formatters'
import { formatSeasonLabel } from '@/@core/utils/season'
import api from '@/api'
import type { Subscribe } from '@/api/types'
import router from '@/router'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'

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

// 当前的订阅状态
const subscribeState = ref<string>(props.media?.state ?? 'P')

// 上一次更新时间
const lastUpdateText = computed(() => (props.media?.last_update ? formatDateDifference(props.media.last_update) : ''))

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

// 是否为洗版订阅（影响进度条与 tooltip 的展示分支）
const isBestVersion = computed(() => isEnabledFlag(props.media?.best_version) && isTvSubscribe(props.media))

const rightBottomStateDisplay = computed(() => {
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
  if (subscribeState.value === 'S') {
    return { color: 'secondary', icon: 'mdi-pause-circle-outline', label: t('subscribe.cardStatePaused') }
  }
  if (subscribeState.value === 'P') {
    return { color: 'info', icon: 'mdi-timer-sand', label: t('subscribe.cardStatePending') }
  }
  return { color: 'primary', icon: 'mdi-rss', label: t('subscribe.subscribing') }
})

// 洗版徽标：共用 mdi-shimmer 图标，分集 / 全集 由 full 标记区分背景
const bestVersionBadge = computed(() => {
  if (!isEnabledFlag(props.media?.best_version)) return null
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
    const result: { [key: string]: any } = await api.delete(`subscribe/${props.media?.id}`)

    if (result.success) {
      // 通知父组件刷新
      emit('remove')
    }
  } catch (e) {
    console.log(e)
  }
}

// 搜索订阅
async function searchSubscribe() {
  try {
    const result: { [key: string]: any } = await api.get(`subscribe/search/${props.media?.id}`)

    // 提示
    if (result.success) $toast.success(`${props.media?.name} 提交搜索请求成功！`)
  } catch (e) {
    console.log(e)
  }
}

// 切换订阅状态
async function toggleSubscribeStatus(state: 'R' | 'S') {
  try {
    // 根据传入的 state 判断对应的操作文字
    const action = state === 'S' ? t('common.pause') : t('common.enable')
    // 弹出确认框
    const isConfirmed = await createConfirm({
      title: t('common.confirmAction', { action }),
      content: t('subscribe.confirmToggle', { action, name: props.media?.name }),
    })
    if (!isConfirmed) return
    // 调用 API 更新订阅状态
    const result: { [key: string]: any } = await api.put(`subscribe/status/${props.media?.id}?state=${state}`)
    // 提示
    if (result.success) {
      $toast.success(t('subscribe.toggleSuccess', { name: props.media?.name, action }))
      subscribeState.value = state
      emit('save')
    } else {
      $toast.error(t('subscribe.toggleFailed', { action, message: result.message }))
    }
  } catch (e) {
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
    const result: { [key: string]: any } = await api.get(`subscribe/reset/${props.media?.id}`)
    // 提示
    if (result.success) {
      $toast.success(t('subscribe.resetSuccess', { name: props.media?.name }))
      subscribeState.value = 'R'
      emit('save')
    } else $toast.error(t('subscribe.resetFailed', { name: props.media?.name, message: result.message }))
  } catch (e) {
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

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdbid) return `tmdb:${props.media?.tmdbid}`
  else if (props.media?.doubanid) return `douban:${props.media?.doubanid}`
  else if (props.media?.bangumiid) return `bangumi:${props.media?.bangumiid}`
  else return props.media?.mediaid
}

// 查看媒体详情
async function viewMediaDetail() {
  router.push({
    path: '/media',
    query: {
      mediaid: getMediaId(),
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

// 计算backdrop图片地址
const backdropUrl = computed(() => {
  const url = props.media?.backdrop || props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算海报图片地址
const posterUrl = computed(() => {
  const url = props.media?.poster
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
})

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
                'cursor-move': props.sortable,
              }"
              min-height="150"
              @click="handleCardClick"
              :ripple="display.smAndUp.value && !props.batchMode && !props.sortable"
            >
              <div
                v-if="bestVersionBadge && imageLoaded"
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
                <VImg :src="backdropUrl || posterUrl" aspect-ratio="3/2" cover @load="imageLoadHandler" position="top">
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
                  <VImg
                    :src="backdropUrl || posterUrl"
                    :aspect-ratio="2"
                    cover
                    position="top"
                    @load="imageLoadHandler"
                  >
                    <template #placeholder>
                      <VSkeletonLoader class="h-full w-full" />
                    </template>
                  </VImg>

                  <div
                    v-if="props.media?.username || lastUpdateText"
                    class="subscribe-card-mobile-image-meta"
                    :class="{ 'subscribe-card-mobile-image-meta--with-badge': bestVersionBadge }"
                  >
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
                </div>

                <div class="subscribe-card-mobile-body">
                  <div class="subscribe-card-mobile-title">
                    {{ props.media?.name }}
                    {{ formatSeasonLabel(props.media?.season, t('media.specials')) }}
                  </div>

                  <div class="subscribe-card-mobile-footer">
                    <div class="subscribe-card-mobile-meta">
                      <div
                        class="subscribe-card-mobile-state"
                        :style="{ color: `rgb(var(--v-theme-${compactStateDisplay.color}))` }"
                        :title="compactStateDisplay.label"
                        :aria-label="compactStateDisplay.label"
                      >
                        <VIcon :icon="compactStateDisplay.icon" size="18" />
                        <span v-if="subscribeProgressText" class="subscribe-card-mobile-progress-text">
                          {{ subscribeProgressText }}
                        </span>
                      </div>

                      <IconBtn
                        v-if="!props.sortable"
                        class="subscribe-card-mobile-menu"
                        size="small"
                        @click.stop
                      >
                        <VIcon icon="mdi-dots-horizontal" size="20" />
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
                        height="4"
                        rounded
                      />
                    </div>
                  </div>
                </div>
              </template>

              <div v-else>
              <VCardText class="flex items-center pt-3 pb-2">
                <div
                  class="h-auto w-12 flex-shrink-0 overflow-hidden rounded-md relative"
                  v-if="imageLoaded"
                  :class="{ 'cursor-move': props.sortable && display.mdAndUp.value }"
                >
                  <VImg :src="posterUrl" aspect-ratio="2/3" cover>
                    <template #placeholder>
                      <div class="w-full h-full">
                        <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                      </div>
                    </template>
                  </VImg>
                </div>
                <div class="flex flex-col justify-center overflow-hidden pl-2 xl:pl-4">
                  <div class="text-sm font-medium text-white sm:pt-1">{{ props.media?.year }}</div>
                  <div class="mr-2 min-w-0 text-lg font-bold text-white text-ellipsis overflow-hidden line-clamp-2 ...">
                    {{ props.media?.name }}
                    {{ formatSeasonLabel(props.media?.season, t('media.specials')) }}
                  </div>
                </div>
              </VCardText>
              <VCardText class="flex min-w-0 justify-space-between align-center flex-wrap px-3">
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
              <VCardText
                v-if="rightBottomStateDisplay"
                class="absolute right-0 bottom-0 d-flex align-center p-2 text-gray-300 text-xs"
              >
                <VIcon :icon="rightBottomStateDisplay.icon" class="me-1" />
                {{ rightBottomStateDisplay.label }}
              </VCardText>
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
  aspect-ratio: 2 / 1;
  flex-shrink: 0;
  inline-size: 100%;
}

.subscribe-card-mobile-media .v-img {
  block-size: 100%;
}

.subscribe-card-mobile-image-meta {
  position: absolute;
  z-index: 2;
  font-size: 0.6875rem;
  font-weight: 500;
  inset: 0;
  pointer-events: none;
}

.subscribe-card-mobile-image-meta__item {
  position: absolute;
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.25rem;
  color: rgba(255, 255, 255, 0.88);
  isolation: isolate;
  line-height: 1.2;
  padding-block: 0.0625rem;
  padding-inline: 0.125rem;
}

.subscribe-card-mobile-image-meta__item::before {
  position: absolute;
  z-index: -1;
  border-radius: 0.4rem;
  background: rgba(0, 0, 0, 0.36);
  content: '';
  filter: blur(3px);
  inset: -0.25rem -0.55rem;
}

.subscribe-card-mobile-image-meta__user {
  max-inline-size: calc(100% - 1rem);
  inset-block-start: 0.5rem;
  inset-inline-start: 0.5rem;
  transition: inset-block-start 0.2s ease;
}

.subscribe-card-mobile-image-meta--with-badge .subscribe-card-mobile-image-meta__user {
  max-inline-size: calc(100% - 4.25rem);
  inset-block-start: 0.5rem;
}

.subscribe-card-mobile-image-meta__user span {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-card-mobile-image-meta__updated {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.76);
  inset-block-end: 0.5rem;
  inset-inline-end: 0.5rem;
}

.subscribe-card-mobile-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.subscribe-card-mobile-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.subscribe-card-mobile-footer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-block-start: auto;
}

.subscribe-card-mobile-meta {
  display: flex;
  min-inline-size: 0;
  min-block-size: 2rem;
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
  font-size: 0.8125rem;
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
  block-size: 2rem;
  min-block-size: 2rem;
  inline-size: 2rem;
  min-inline-size: 2rem;
  flex: 0 0 2rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.subscribe-card-mobile-progress {
  display: flex;
  block-size: 4px;
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
 * 洗版标识：卡片左上角 24x24 圆形徽标
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

  .subscribe-card-paused {
    opacity: 1;
  }

  .subscribe-card-paused .subscribe-card-mobile-media {
    filter: saturate(0.65);
    opacity: 0.58;
  }

  .best-version-badge {
    inset-inline-start: auto;
    inset-inline-end: 0.5rem;
  }

  .subscribe-card-pending-tint::after {
    box-shadow:
      inset 0 0 0 1px rgba(var(--v-theme-info), 0.28),
      inset 0 -4rem 5rem rgba(var(--v-theme-info), 0.08);
  }
}
</style>
