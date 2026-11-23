<script setup lang="ts">
import { copyToClipboard } from '@/@core/utils/navigator'
import api from '@/api'
import type {
  SubscribeDownloadFileInfo,
  SubscribeEpisodeInfo,
  SubscribeLibraryFileInfo,
  SubscrbieInfo,
} from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { nativeChromeActive } from '@/native/layout'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

type SubscribeFileTab = 'download' | 'library'
type EpisodeStatus = 'library' | 'download' | 'missing'

/** 将下载与媒体库记录归并到同一集，供桌面和移动布局共享。 */
interface SubscribeEpisodeGroup {
  episodeNumber: number
  episodeLabel: string
  title: string
  description?: string
  backdrop?: string
  download: SubscribeDownloadFileInfo[]
  library: SubscribeLibraryFileInfo[]
  status: EpisodeStatus
}

/** 头部统计项同时驱动数量文案和完成进度。 */
interface FileStatItem {
  key: string
  label: string
  value: number
  total: number
  icon: string
  color: 'primary' | 'info' | 'success' | 'warning'
}

// i18n
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 提示框
const $toast = useToast()

// 输入参数
const props = defineProps({
  subid: Number,
})

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 当前文件类型页签
const activeTab = ref<SubscribeFileTab>('download')

// 当前选中的集数
const selectedEpisodeNumber = ref<number>()

// 订阅文件信息
const subScribeInfo = ref<SubscrbieInfo>()

// 是否加载中
const loading = ref(false)

const loadError = ref(false)

/**
 * 调用 API 查询订阅文件信息。
 */
async function loadSubscribeFilesInfo() {
  try {
    loading.value = true
    loadError.value = false
    subScribeInfo.value = await api.get(`subscribe/files/${props.subid}`)
  } catch (e) {
    console.log(e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

/**
 * 将图片地址转换为当前全局缓存设置下可展示的地址。
 */
function resolveImageUrl(url?: string) {
  return getDisplayImageUrl(url || '', globalSettings.GLOBAL_IMAGE_CACHE)
}

/**
 * 将 TMDB 缩略背景图切换为原始尺寸后生成可展示地址。
 */
function resolveHeroImageUrl(url?: string) {
  const originalUrl = (url || '').replace(/\/t\/p\/w\d+\//i, '/t/p/original/')
  return resolveImageUrl(originalUrl)
}

/**
 * 根据订阅媒体类型生成集数展示文案。
 */
function formatEpisodeLabel(episodeNumber: number) {
  if (subScribeInfo.value?.subscribe?.type === '电影') return t('dialog.subscribeFiles.movieEpisode')
  return `E${String(episodeNumber).padStart(2, '0')}`
}

/**
 * 根据单集文件命中情况判断当前集状态。
 */
function resolveEpisodeStatus(
  download: SubscribeDownloadFileInfo[],
  library: SubscribeLibraryFileInfo[],
): EpisodeStatus {
  if (library.length) return 'library'
  if (download.length) return 'download'
  return 'missing'
}

/**
 * 入库条目的驱动器标签：服务器名或 local。
 */
function resolveLibraryStorageLabel(file: SubscribeLibraryFileInfo) {
  if (file.server) return file.server
  return file.storage || 'local'
}

/**
 * 判断路径是否为可打开的详情链接。
 */
function isDetailUrl(path?: string) {
  return !!path && /^https?:\/\//i.test(path)
}

/**
 * 入库条目路径展示文案。
 */
function resolveLibraryPathText(file: SubscribeLibraryFileInfo) {
  if (file.file_path) return file.file_path
  return t('dialog.subscribeFiles.noPath')
}

/**
 * 文件列表项稳定 key（媒体服务器条目可能无路径）。
 */
function resolveFileKey(
  tab: SubscribeFileTab,
  file: SubscribeDownloadFileInfo | SubscribeLibraryFileInfo,
  index: number,
  episodeNumber?: number,
) {
  const prefix = episodeNumber == null ? tab : `${episodeNumber}-${tab}`
  if (tab === 'library') {
    const libraryFile = file as SubscribeLibraryFileInfo
    return `${prefix}-${libraryFile.file_path || libraryFile.itemid || libraryFile.server || libraryFile.server_type || index}`
  }
  return `${prefix}-${(file as SubscribeDownloadFileInfo).file_path || index}`
}

/**
 * 返回集状态对应的本地化展示文案。
 */
function getEpisodeStatusText(status: EpisodeStatus) {
  const statusMap: Record<EpisodeStatus, string> = {
    library: t('dialog.subscribeFiles.statusInLibrary'),
    download: t('dialog.subscribeFiles.statusDownloaded'),
    missing: t('dialog.subscribeFiles.statusMissing'),
  }

  return statusMap[status]
}

/**
 * 返回集状态对应的 Vuetify 主题色。
 */
function getEpisodeStatusColor(status: EpisodeStatus) {
  const colorMap: Record<EpisodeStatus, 'success' | 'info' | 'warning'> = {
    library: 'success',
    download: 'info',
    missing: 'warning',
  }

  return colorMap[status]
}

/**
 * 返回订阅状态对应的本地化展示文案。
 */
function getSubscribeStateText(state?: string) {
  const stateMap: Record<string, string> = {
    R: t('dialog.subscribeFiles.subscribeRunning'),
    P: t('dialog.subscribeFiles.subscribePending'),
    S: t('dialog.subscribeFiles.subscribePaused'),
    N: t('dialog.subscribeFiles.subscribeNew'),
  }

  return stateMap[state || ''] || t('common.unknown')
}

/**
 * 返回订阅状态对应的 Vuetify 主题色。
 */
function getSubscribeStateColor(state?: string) {
  if (state === 'R') return 'success'
  if (state === 'S') return 'warning'
  if (state === 'P') return 'info'
  return 'primary'
}

/**
 * 计算数值在总量中的百分比，保证进度条不会溢出。
 */
function calcPercent(value: number, total: number) {
  if (!total) return 0
  return Math.min(Math.max((value / total) * 100, 0), 100)
}

/**
 * 从种子标题或文件路径中提取分辨率标签。
 * 媒体服务器详情 URL 不参与解析。
 */
function resolveResolutionLabel(file?: SubscribeDownloadFileInfo | SubscribeLibraryFileInfo) {
  if (!file) return undefined

  const path = file.file_path || ''
  if (isDetailUrl(path)) {
    if ('torrent_title' in file) {
      const matched = ((file as SubscribeDownloadFileInfo).torrent_title || '').match(/(?:2160|1080|720|480)p|4k|8k/i)
      return matched?.[0]?.toUpperCase()
    }
    return undefined
  }

  const text = 'torrent_title' in file ? `${(file as SubscribeDownloadFileInfo).torrent_title || ''} ${path}` : path
  const matched = text.match(/(?:2160|1080|720|480)p|4k|8k/i)
  return matched?.[0]?.toUpperCase()
}

/**
 * 复制文件路径到剪贴板并提示结果。
 */
async function copyPath(path?: string) {
  if (!path) return

  try {
    const success = await copyToClipboard(path)
    if (success) $toast.success(t('dialog.subscribeFiles.copySuccess'))
    else $toast.error(t('dialog.subscribeFiles.copyFailed'))
  } catch (e) {
    console.log(e)
    $toast.error(t('dialog.subscribeFiles.copyFailed'))
  }
}

/**
 * 切换当前选中的集数。
 */
function selectEpisode(episodeNumber: number) {
  selectedEpisodeNumber.value = episodeNumber
}

// 订阅信息
const subscribe = computed(() => subScribeInfo.value?.subscribe)

// 所有集的展示数据
const episodeGroups = computed<SubscribeEpisodeGroup[]>(() => {
  const episodes = subScribeInfo.value?.episodes ?? {}

  return Object.keys(episodes)
    .map(key => Number(key))
    .sort((left, right) => left - right)
    .map(episodeNumber => {
      const item = episodes[episodeNumber] as SubscribeEpisodeInfo | undefined
      const download = item?.download ?? []
      const library = item?.library ?? []

      return {
        episodeNumber,
        episodeLabel: formatEpisodeLabel(episodeNumber),
        title: item?.title || formatEpisodeLabel(episodeNumber),
        description: item?.description,
        backdrop: item?.backdrop,
        download,
        library,
        status: resolveEpisodeStatus(download, library),
      }
    })
})

// 总集数
const totalCount = computed(() => {
  const subscribeTotal = subscribe.value?.total_episode ?? 0
  if (subscribe.value?.type === '电影') return Math.max(episodeGroups.value.length, 1)

  // 电视剧以起始集到总集数作为目标范围，自定义起始集需要换算为实际集数。
  const startEpisode = subscribe.value?.start_episode || 1
  const targetCount = subscribeTotal >= startEpisode ? subscribeTotal - startEpisode + 1 : 0
  return Math.max(targetCount, episodeGroups.value.length)
})

// 已下载集数
const downloadedCount = computed(() => episodeGroups.value.filter(item => item.download.length).length)

// 已入库集数
const libraryCount = computed(() => episodeGroups.value.filter(item => item.library.length).length)

// 缺失集数
const missingCount = computed(() => Math.max(totalCount.value - libraryCount.value, 0))

// 顶部统计卡片
const statItems = computed<FileStatItem[]>(() => [
  {
    key: 'download',
    label: t('dialog.subscribeFiles.downloadedCount'),
    value: downloadedCount.value,
    total: totalCount.value,
    icon: 'mdi-cloud-download-outline',
    color: 'info',
  },
  {
    key: 'library',
    label: t('dialog.subscribeFiles.libraryCount'),
    value: libraryCount.value,
    total: totalCount.value,
    icon: 'mdi-server-network',
    color: 'success',
  },
])

// 当前选中集
const selectedEpisode = computed(() => {
  return episodeGroups.value.find(item => item.episodeNumber === selectedEpisodeNumber.value) ?? episodeGroups.value[0]
})

// 当前选中集的当前页签文件列表
const selectedFiles = computed(() => {
  if (!selectedEpisode.value) return []
  return activeTab.value === 'download' ? selectedEpisode.value.download : selectedEpisode.value.library
})

// 顶部主背景图
const heroBackdropUrl = computed(() => {
  return resolveHeroImageUrl(selectedEpisode.value?.backdrop || subscribe.value?.backdrop || subscribe.value?.poster)
})

// 顶部海报图
const posterUrl = computed(() => resolveImageUrl(subscribe.value?.poster))

// 顶部背景图内联变量
const heroStyle = computed(() => ({
  '--subscribe-files-backdrop': heroBackdropUrl.value ? `url("${heroBackdropUrl.value}")` : 'none',
}))

// 当前页签标题
const activeSectionTitle = computed(() => {
  return activeTab.value === 'download' ? t('dialog.subscribeFiles.downloadTab') : t('dialog.subscribeFiles.libraryTab')
})

// 移动端逐集文件列表
const mobileEpisodeGroups = computed(() => {
  return episodeGroups.value.map(item => ({
    ...item,
    activeFiles: activeTab.value === 'download' ? item.download : item.library,
  }))
})

watch(
  episodeGroups,
  episodes => {
    if (!episodes.length) {
      selectedEpisodeNumber.value = undefined
      return
    }

    if (!episodes.some(item => item.episodeNumber === selectedEpisodeNumber.value)) {
      selectedEpisodeNumber.value = episodes[0].episodeNumber
    }
  },
  { immediate: true },
)

onBeforeMount(() => {
  loadSubscribeFilesInfo()
})
</script>

<template>
  <VDialog
    class="subscribe-files-dialog-root"
    content-class="subscribe-files-dialog-content"
    scrollable
    :aria-label="t('subscribe.fileStatistics')"
    max-width="76rem"
    :height="display.mdAndUp.value ? 'min(88dvh, 56rem)' : undefined"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="subscribe-files-dialog" :class="{ 'subscribe-files-dialog--native': nativeChromeActive }">
      <VBtn
        data-native-dialog-close
        class="subscribe-files-dialog__close"
        icon="mdi-close"
        variant="text"
        size="small"
        :aria-label="t('common.close')"
        @click="emit('close')"
      />

      <LoadingBanner v-if="loading" />

      <div v-else class="subscribe-files-dialog__body">
        <div v-if="loadError" class="subscribe-files-empty subscribe-files-empty--standalone">
          <VIcon icon="mdi-folder-alert-outline" size="36" />
          <strong>{{ t('error.serverError') }}</strong>
          <VBtn color="primary" variant="tonal" size="small" prepend-icon="mdi-refresh" @click="loadSubscribeFilesInfo">
            {{ t('common.retry') }}
          </VBtn>
        </div>

        <div v-else-if="subScribeInfo?.subscribe" class="subscribe-files-shell">
          <section class="subscribe-files-hero" :style="heroStyle">
            <div v-if="heroBackdropUrl" class="subscribe-files-hero__backdrop" />
            <div class="subscribe-files-hero__content">
              <div class="subscribe-files-poster-card">
                <VImg v-if="posterUrl" :src="posterUrl" cover class="subscribe-files-poster-card__image">
                  <template #placeholder>
                    <VSkeletonLoader class="w-100 h-100" />
                  </template>
                </VImg>
                <div v-else class="subscribe-files-poster-card__empty">
                  <VIcon icon="mdi-movie-open-outline" size="28" />
                </div>
              </div>

              <div class="subscribe-files-hero__meta">
                <div class="subscribe-files-hero__eyebrow">
                  <VIcon icon="mdi-folder-play-outline" size="15" />
                  <span>{{ t('dialog.subscribeFiles.title') }}</span>
                </div>
                <h2 class="subscribe-files-hero__title">{{ subscribe?.name }}</h2>
                <div class="subscribe-files-hero__chips num">
                  <VChip v-if="subscribe?.season != null" color="primary" variant="tonal" size="small">
                    {{ t('dialog.subscribeFiles.season', { number: subscribe.season }) }}
                  </VChip>
                  <VChip v-if="subscribe?.year" variant="tonal" size="small">{{ subscribe.year }}</VChip>
                  <VChip
                    :color="getSubscribeStateColor(subscribe?.state)"
                    variant="tonal"
                    size="small"
                    prepend-icon="mdi-check-circle-outline"
                  >
                    {{ getSubscribeStateText(subscribe?.state) }}
                  </VChip>
                </div>
                <p class="subscribe-files-hero__description">
                  {{ selectedEpisode?.description || subscribe?.description || t('dialog.subscribeFiles.noOverview') }}
                </p>
              </div>

              <div class="subscribe-files-stats">
                <div v-for="item in statItems" :key="item.key" class="subscribe-files-stat-card">
                  <div
                    class="subscribe-files-stat-card__icon"
                    :class="`subscribe-files-stat-card__icon--${item.color}`"
                  >
                    <VIcon :icon="item.icon" size="18" />
                  </div>
                  <div class="subscribe-files-stat-card__content">
                    <div class="subscribe-files-stat-card__label">{{ item.label }}</div>
                    <div class="subscribe-files-stat-card__value num">{{ item.value }}/{{ item.total }}</div>
                  </div>
                  <VProgressLinear
                    :model-value="calcPercent(item.value, item.total)"
                    :color="item.color"
                    height="4"
                    rounded
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="subscribe-files-content">
            <aside v-if="display.mdAndUp.value" class="subscribe-files-episode-rail">
              <div class="subscribe-files-episode-rail__header">
                <div class="subscribe-files-episode-rail__heading">
                  <span>{{ t('dialog.subscribeFiles.episodeList') }}</span>
                  <strong class="num">{{ t('dialog.subscribeFiles.episodeTotal', { count: totalCount }) }}</strong>
                </div>
                <VChip size="x-small" color="warning" variant="tonal" class="num">
                  {{ t('dialog.subscribeFiles.missingCount', { count: missingCount }) }}
                </VChip>
              </div>

              <div class="subscribe-files-episode-list">
                <button
                  v-for="episode in episodeGroups"
                  :key="episode.episodeNumber"
                  class="subscribe-files-episode-item"
                  :class="{
                    'subscribe-files-episode-item--active': selectedEpisode?.episodeNumber === episode.episodeNumber,
                  }"
                  type="button"
                  @click="selectEpisode(episode.episodeNumber)"
                >
                  <span class="subscribe-files-episode-item__label num">{{ episode.episodeLabel }}</span>
                  <span class="subscribe-files-episode-item__title">{{ episode.title }}</span>
                  <VChip :color="getEpisodeStatusColor(episode.status)" variant="tonal" size="x-small">
                    {{ getEpisodeStatusText(episode.status) }}
                  </VChip>
                </button>
              </div>
            </aside>

            <main class="subscribe-files-main">
              <div class="subscribe-files-toolbar">
                <div v-if="display.mdAndUp.value" class="subscribe-files-detail__header">
                  <div class="subscribe-files-detail__heading">
                    <div class="subscribe-files-detail__title">
                      <span class="num">{{ selectedEpisode?.episodeLabel }}</span>
                      <strong>{{ selectedEpisode?.title }}</strong>
                    </div>
                    <div class="subscribe-files-detail__subtitle">
                      {{ activeSectionTitle }}
                    </div>
                  </div>
                  <VChip
                    v-if="selectedEpisode"
                    :color="getEpisodeStatusColor(selectedEpisode.status)"
                    variant="tonal"
                    size="small"
                  >
                    {{ getEpisodeStatusText(selectedEpisode.status) }}
                  </VChip>
                </div>

                <div class="subscribe-files-tabs">
                  <VBtnToggle
                    v-model="activeTab"
                    mandatory
                    density="compact"
                    class="subscribe-files-tab-group"
                    selected-class="subscribe-files-tab-group__button--active"
                  >
                    <VBtn value="download" variant="text" class="subscribe-files-tab-group__button">
                      <VIcon size="17" start icon="mdi-download-outline" />
                      {{ t('dialog.subscribeFiles.downloadTab') }}
                    </VBtn>
                    <VBtn value="library" variant="text" class="subscribe-files-tab-group__button">
                      <VIcon size="17" start icon="mdi-filmstrip-box-multiple" />
                      {{ t('dialog.subscribeFiles.libraryTab') }}
                    </VBtn>
                  </VBtnToggle>
                </div>
              </div>

              <div v-if="display.mdAndUp.value" class="subscribe-files-detail">
                <transition name="fade-slide" mode="out-in">
                  <div :key="activeTab" class="subscribe-files-file-list">
                    <template v-if="selectedFiles.length">
                      <article
                        v-for="(file, index) in selectedFiles"
                        :key="resolveFileKey(activeTab, file, index)"
                        class="subscribe-files-file-card"
                      >
                        <div
                          class="subscribe-files-file-card__media"
                          :class="`subscribe-files-file-card__media--${activeTab === 'download' ? 'info' : 'success'}`"
                        >
                          <VIcon
                            :icon="activeTab === 'download' ? 'mdi-cloud-download-outline' : 'mdi-server-network'"
                            size="18"
                          />
                        </div>
                        <div class="subscribe-files-file-card__content">
                          <div class="subscribe-files-file-card__topline">
                            <VChip
                              v-if="resolveResolutionLabel(file)"
                              color="primary"
                              variant="tonal"
                              size="x-small"
                              class="num"
                            >
                              {{ resolveResolutionLabel(file) }}
                            </VChip>
                            <VChip
                              v-if="activeTab === 'download' && (file as SubscribeDownloadFileInfo).site_name"
                              color="secondary"
                              variant="tonal"
                              size="x-small"
                            >
                              {{ (file as SubscribeDownloadFileInfo).site_name }}
                            </VChip>
                            <VChip
                              v-if="
                                activeTab === 'library' && resolveLibraryStorageLabel(file as SubscribeLibraryFileInfo)
                              "
                              color="success"
                              variant="tonal"
                              size="x-small"
                            >
                              {{ resolveLibraryStorageLabel(file as SubscribeLibraryFileInfo) }}
                            </VChip>
                            <VChip
                              :color="activeTab === 'download' ? 'info' : 'success'"
                              variant="tonal"
                              size="x-small"
                            >
                              {{
                                activeTab === 'download'
                                  ? t('dialog.subscribeFiles.statusDownloaded')
                                  : t('dialog.subscribeFiles.statusInLibrary')
                              }}
                            </VChip>
                          </div>
                          <h3 class="subscribe-files-file-card__title">
                            {{
                              activeTab === 'download'
                                ? (file as SubscribeDownloadFileInfo).torrent_title ||
                                  t('dialog.subscribeFiles.unknownTorrent')
                                : activeSectionTitle
                            }}
                          </h3>
                          <div
                            v-if="
                              activeTab === 'download' &&
                              ((file as SubscribeDownloadFileInfo).downloader ||
                                (file as SubscribeDownloadFileInfo).hash)
                            "
                            class="subscribe-files-file-card__meta num"
                          >
                            <span v-if="(file as SubscribeDownloadFileInfo).downloader">
                              {{ t('dialog.subscribeFiles.downloader') }}：{{
                                (file as SubscribeDownloadFileInfo).downloader
                              }}
                            </span>
                            <span v-if="(file as SubscribeDownloadFileInfo).hash">
                              Hash：{{ (file as SubscribeDownloadFileInfo).hash }}
                            </span>
                          </div>
                          <div class="subscribe-files-path-block">
                            <div class="subscribe-files-path-block__main">
                              <span class="subscribe-files-path-block__label">
                                <VIcon
                                  :icon="
                                    activeTab === 'library' && isDetailUrl(file.file_path)
                                      ? 'mdi-open-in-new'
                                      : 'mdi-folder-outline'
                                  "
                                  size="14"
                                />
                                {{ t('dialog.subscribeFiles.filePath') }}
                              </span>
                              <a
                                v-if="activeTab === 'library' && isDetailUrl(file.file_path)"
                                class="subscribe-files-path-link"
                                :href="file.file_path"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {{ file.file_path }}
                              </a>
                              <code v-else>
                                {{
                                  activeTab === 'library'
                                    ? resolveLibraryPathText(file as SubscribeLibraryFileInfo)
                                    : file.file_path || t('dialog.subscribeFiles.noPath')
                                }}
                              </code>
                            </div>
                            <VBtn
                              icon="mdi-content-copy"
                              variant="text"
                              size="small"
                              class="subscribe-files-copy-btn"
                              :disabled="!file.file_path"
                              :aria-label="t('dialog.subscribeFiles.copyPath')"
                              @click="copyPath(file.file_path)"
                            />
                          </div>
                        </div>
                      </article>
                    </template>

                    <div v-else class="subscribe-files-empty">
                      <VIcon icon="mdi-folder-search-outline" size="32" />
                      <div>{{ t('dialog.subscribeFiles.noTabFiles', { tab: activeSectionTitle }) }}</div>
                    </div>
                  </div>
                </transition>
              </div>

              <div v-else class="subscribe-files-mobile-list">
                <article
                  v-for="episode in mobileEpisodeGroups"
                  :key="episode.episodeNumber"
                  class="subscribe-files-mobile-card"
                  :class="`subscribe-files-mobile-card--${episode.status}`"
                >
                  <div class="subscribe-files-mobile-card__header">
                    <div class="subscribe-files-mobile-card__episode num">{{ episode.episodeLabel }}</div>
                    <div class="subscribe-files-mobile-card__title">
                      <strong>{{ episode.title }}</strong>
                      <span>{{ activeSectionTitle }}</span>
                    </div>
                    <VChip :color="getEpisodeStatusColor(episode.status)" variant="tonal" size="x-small">
                      {{ getEpisodeStatusText(episode.status) }}
                    </VChip>
                  </div>

                  <div v-if="episode.activeFiles.length" class="subscribe-files-mobile-card__files">
                    <div
                      v-for="(file, index) in episode.activeFiles"
                      :key="resolveFileKey(activeTab, file, index, episode.episodeNumber)"
                      class="subscribe-files-mobile-file"
                    >
                      <div class="subscribe-files-mobile-file__chips">
                        <VChip
                          v-if="resolveResolutionLabel(file)"
                          color="primary"
                          variant="tonal"
                          size="x-small"
                          class="num"
                        >
                          {{ resolveResolutionLabel(file) }}
                        </VChip>
                        <VChip
                          v-if="activeTab === 'download' && (file as SubscribeDownloadFileInfo).site_name"
                          color="secondary"
                          variant="tonal"
                          size="x-small"
                        >
                          {{ (file as SubscribeDownloadFileInfo).site_name }}
                        </VChip>
                        <VChip
                          v-if="activeTab === 'library' && resolveLibraryStorageLabel(file as SubscribeLibraryFileInfo)"
                          color="success"
                          variant="tonal"
                          size="x-small"
                        >
                          {{ resolveLibraryStorageLabel(file as SubscribeLibraryFileInfo) }}
                        </VChip>
                      </div>
                      <div v-if="activeTab === 'download'" class="subscribe-files-mobile-file__title">
                        {{
                          (file as SubscribeDownloadFileInfo).torrent_title || t('dialog.subscribeFiles.unknownTorrent')
                        }}
                      </div>
                      <div
                        v-if="
                          activeTab === 'download' &&
                          ((file as SubscribeDownloadFileInfo).downloader || (file as SubscribeDownloadFileInfo).hash)
                        "
                        class="subscribe-files-file-card__meta num"
                      >
                        <span v-if="(file as SubscribeDownloadFileInfo).downloader">
                          {{ t('dialog.subscribeFiles.downloader') }}：{{
                            (file as SubscribeDownloadFileInfo).downloader
                          }}
                        </span>
                        <span v-if="(file as SubscribeDownloadFileInfo).hash">
                          Hash：{{ (file as SubscribeDownloadFileInfo).hash }}
                        </span>
                      </div>
                      <div class="subscribe-files-path-block subscribe-files-path-block--mobile">
                        <div class="subscribe-files-path-block__main">
                          <a
                            v-if="activeTab === 'library' && isDetailUrl(file.file_path)"
                            class="subscribe-files-path-link"
                            :href="file.file_path"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {{ file.file_path }}
                          </a>
                          <code v-else>
                            {{
                              activeTab === 'library'
                                ? resolveLibraryPathText(file as SubscribeLibraryFileInfo)
                                : file.file_path || t('dialog.subscribeFiles.noPath')
                            }}
                          </code>
                        </div>
                        <VBtn
                          icon="mdi-content-copy"
                          variant="text"
                          size="small"
                          class="subscribe-files-copy-btn"
                          :disabled="!file.file_path"
                          :aria-label="t('dialog.subscribeFiles.copyPath')"
                          @click="copyPath(file.file_path)"
                        />
                      </div>
                    </div>
                  </div>

                  <div v-else class="subscribe-files-mobile-card__empty">
                    {{ t('dialog.subscribeFiles.noTabFiles', { tab: activeSectionTitle }) }}
                  </div>
                </article>
              </div>
            </main>
          </section>
        </div>

        <div v-else class="subscribe-files-empty subscribe-files-empty--standalone">
          <VIcon icon="mdi-folder-alert-outline" size="36" />
          <strong>{{ t('dialog.subscribeFiles.noData') }}</strong>
        </div>
      </div>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.subscribe-files-dialog {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  color: var(--mp-fg);
  inline-size: 100%;
  min-block-size: 0;
}

.subscribe-files-dialog__close {
  position: absolute;
  z-index: 8;
  color: var(--mp-muted-fg);
  inset-block-start: 0.75rem;
  inset-inline-end: 0.75rem;
}

.subscribe-files-dialog__body {
  display: flex;
  overflow: hidden;
  flex: 1 1 0%;
  flex-direction: column;
  min-block-size: 0;
}

.subscribe-files-shell {
  display: flex;
  overflow: hidden;
  flex: 1 1 0%;
  flex-direction: column;
  min-block-size: 0;
}

.subscribe-files-hero {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
  border-block-end: 1px solid var(--mp-border);
}

/* 背景剧照仅做极轻柔氛围晕染，确保深浅与玻璃四态下前景文字始终锐利可读。 */
.subscribe-files-hero__backdrop {
  position: absolute;
  background-image: var(--subscribe-files-backdrop);
  background-position: center;
  background-size: cover;
  filter: blur(22px) saturate(1.1);
  inset: -1.5rem;
  opacity: 0.12;
  pointer-events: none;
}

/* 原生 Sheet 已提供外框，头部作为独立卡片留白，避免沿用网页贴边的半圆角。 */
.subscribe-files-dialog--native .subscribe-files-hero {
  border: 1px solid var(--mp-border);
  border-radius: var(--app-surface-radius);
  margin-block: 0.75rem 0;
  margin-inline: 1rem;
}

.subscribe-files-hero__content {
  position: relative;
  z-index: 1;
  display: grid;
  align-items: center;
  gap: 1.25rem;
  grid-template-columns: 4.75rem minmax(0, 1fr) 20rem;
  padding-block: 1.125rem;
  padding-inline: 1.5rem;
}

.subscribe-files-poster-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  aspect-ratio: 2 / 3;
  background: var(--mp-muted);
  block-size: 7.125rem;
  inline-size: 4.75rem;
}

.subscribe-files-poster-card__image {
  block-size: 100%;
}

.subscribe-files-poster-card__empty {
  display: grid;
  block-size: 100%;
  color: var(--mp-faint);
  place-items: center;
}

.subscribe-files-hero__meta {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.3rem;
}

.subscribe-files-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.3rem;
  letter-spacing: 0.02em;
}

.subscribe-files-hero__title {
  overflow: hidden;
  margin: 0;
  color: var(--mp-fg);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-block-start: 0.1rem;
}

.subscribe-files-hero__description {
  display: -webkit-box;
  overflow: hidden;
  margin: 0.15rem 0 0;
  -webkit-box-orient: vertical;
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.45;
  max-inline-size: 38rem;
}

.subscribe-files-stats {
  display: grid;
  align-self: end;
  gap: 0.625rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding-block-start: 1.5rem;
}

.subscribe-files-stat-card {
  display: grid;
  align-items: center;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--mp-border);
  border-radius: var(--app-control-radius);
  background: var(--mp-muted);
  gap: 0.5rem;
  grid-template-columns: auto minmax(0, 1fr);
}

.subscribe-files-stat-card > .v-progress-linear {
  grid-column: 1 / -1;
}

.subscribe-files-stat-card__content {
  min-inline-size: 0;
}

.subscribe-files-stat-card__icon {
  display: grid;
  border: 1px solid var(--mp-border);
  border-radius: 0.5rem;
  background: var(--mp-card);
  block-size: 2rem;
  inline-size: 2rem;
  place-items: center;
}

.subscribe-files-stat-card__icon--info {
  border-color: var(--mp-info-border);
  background: var(--mp-info-soft);
  color: var(--mp-info-fg);
}

.subscribe-files-stat-card__icon--success {
  border-color: var(--mp-success-border);
  background: var(--mp-success-soft);
  color: var(--mp-success-fg);
}

.subscribe-files-stat-card__label {
  overflow: hidden;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-stat-card__value {
  color: var(--mp-fg);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.25;
}

.subscribe-files-content {
  display: grid;
  overflow: hidden;
  flex: 1 1 0%;
  gap: 1rem;
  grid-template-columns: 17rem minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  min-block-size: 0;
  padding-block: 1rem 1.25rem;
  padding-inline: 1.5rem;
}

.subscribe-files-episode-rail,
.subscribe-files-main {
  overflow: hidden;
  border: 1px solid var(--mp-border);
  border-radius: var(--app-control-radius);
  background: var(--mp-list-group-bg);
  block-size: 100%;
  min-block-size: 0;
}

.subscribe-files-episode-rail {
  display: flex;
  flex-direction: column;
}

.subscribe-files-episode-rail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.875rem;
  border-block-end: 1px solid var(--mp-border);
  gap: 0.5rem;
}

.subscribe-files-episode-rail__heading {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.subscribe-files-episode-rail__heading span {
  color: var(--mp-fg);
  font-size: 0.8125rem;
  font-weight: 600;
}

.subscribe-files-episode-rail__heading strong {
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 500;
}

.subscribe-files-episode-list {
  display: flex;
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 0%;
  flex-direction: column;
  padding: 0.5rem;
  gap: 0.25rem;
  min-block-size: 0;
  overscroll-behavior: contain;
}

.subscribe-files-episode-item {
  display: grid;
  flex: 0 0 auto;
  align-items: center;
  padding: 0.5rem 0.625rem;
  border: 1px solid transparent;
  border-radius: calc(var(--app-control-radius) - 4px);
  background: transparent;
  color: var(--mp-fg);
  column-gap: 0.5rem;
  cursor: pointer;
  grid-template-columns: auto minmax(0, 1fr) auto;
  text-align: start;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.subscribe-files-episode-item:hover {
  background: var(--mp-list-row-hover);
}

.subscribe-files-episode-item--active {
  border-color: var(--mp-primary-border);
  background: var(--mp-primary-soft);
}

.subscribe-files-episode-item--active:hover {
  background: var(--mp-primary-soft);
}

.subscribe-files-episode-item__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.1875rem 0.45rem;
  border: 1px solid var(--mp-border);
  border-radius: 0.45rem;
  background: var(--mp-muted);
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
  min-inline-size: 2.35rem;
}

.subscribe-files-episode-item--active .subscribe-files-episode-item__label {
  border-color: var(--mp-primary-border);
  background: rgba(var(--v-theme-primary), 0.14);
  color: var(--mp-primary-fg);
}

.subscribe-files-episode-item__title {
  overflow: hidden;
  font-size: 0.8125rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-episode-item--active .subscribe-files-episode-item__title {
  font-weight: 600;
}

.subscribe-files-main {
  display: flex;
  flex-direction: column;
}

.subscribe-files-toolbar {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-block-end: 1px solid var(--mp-border);
  gap: 0.75rem;
}

.subscribe-files-detail__header {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 12rem;
  align-items: center;
  gap: 0.625rem;
}

.subscribe-files-detail__heading {
  min-inline-size: 0;
}

.subscribe-files-detail__title {
  display: flex;
  min-inline-size: 0;
  align-items: baseline;
  gap: 0.45rem;
}

.subscribe-files-detail__title span {
  flex: 0 0 auto;
  color: var(--mp-primary-fg);
  font-size: 0.875rem;
  font-weight: 700;
}

.subscribe-files-detail__title strong {
  overflow: hidden;
  color: var(--mp-fg);
  font-size: 0.9375rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-detail__subtitle {
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  line-height: 1.35;
}

.subscribe-files-tabs {
  flex: 0 0 auto;
}

.subscribe-files-tab-group {
  display: grid;
  overflow: hidden;
  padding: 0.1875rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  background: var(--mp-muted);
  block-size: auto;
  gap: 0.25rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.subscribe-files-tab-group :deep(.v-btn) {
  block-size: 2rem !important;
  min-inline-size: 7.25rem;
  padding-inline: 0.75rem;
}

.subscribe-files-tab-group :deep(.v-btn__content) {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.subscribe-files-tab-group__button {
  border: 1px solid transparent !important;
  border-radius: calc(var(--app-control-radius) - 4px) !important;
  color: var(--mp-muted-fg) !important;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
}

.subscribe-files-tab-group__button--active {
  border-color: var(--mp-primary-border) !important;
  background-color: var(--mp-primary-soft) !important;
  color: var(--mp-primary-fg) !important;
}

.subscribe-files-detail {
  display: flex;
  overflow: hidden;
  flex: 1 1 0%;
  flex-direction: column;
  padding: 0.875rem 1rem;
  min-block-size: 0;
}

.subscribe-files-file-list {
  display: flex;
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 0%;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
  overscroll-behavior: contain;
}

.subscribe-files-file-card {
  display: grid;
  flex: 0 0 auto;
  padding: 0.875rem 1rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  background: var(--mp-card);
  gap: 0.875rem;
  grid-template-columns: auto minmax(0, 1fr);
}

.subscribe-files-file-card__media {
  display: grid;
  border: 1px solid var(--mp-border);
  border-radius: 0.625rem;
  background: var(--mp-muted);
  block-size: 2.25rem;
  inline-size: 2.25rem;
  place-items: center;
}

.subscribe-files-file-card__media--info {
  border-color: var(--mp-info-border);
  background: var(--mp-info-soft);
  color: var(--mp-info-fg);
}

.subscribe-files-file-card__media--success {
  border-color: var(--mp-success-border);
  background: var(--mp-success-soft);
  color: var(--mp-success-fg);
}

.subscribe-files-file-card__content {
  min-inline-size: 0;
}

.subscribe-files-file-card__topline,
.subscribe-files-mobile-file__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.subscribe-files-file-card__title {
  margin: 0.45rem 0 0.25rem;
  color: var(--mp-fg);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.subscribe-files-file-card__meta {
  display: flex;
  flex-wrap: wrap;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  gap: 0.25rem 0.875rem;
  margin-block-end: 0.5rem;
}

.subscribe-files-path-block {
  display: grid;
  align-items: center;
  padding: 0.5rem 0.625rem 0.5rem 0.75rem;
  border: 1px solid var(--mp-border-subtle);
  border-radius: calc(var(--app-control-radius) - 4px);
  background: var(--mp-muted);
  gap: 0.5rem;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-block-start: 0.45rem;
}

.subscribe-files-path-block__main {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.2rem;
}

.subscribe-files-path-block__label {
  display: inline-flex;
  align-items: center;
  color: var(--mp-muted-fg);
  font-size: 0.72rem;
  font-weight: 500;
  gap: 0.25rem;
}

.subscribe-files-path-block code,
.subscribe-files-path-link {
  display: block;
  min-inline-size: 0;
  color: var(--mp-fg);
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-all;
}

.subscribe-files-path-link {
  color: var(--mp-primary-fg);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.subscribe-files-path-link:hover {
  opacity: 0.85;
}

.subscribe-files-copy-btn {
  color: var(--mp-muted-fg);
}

.subscribe-files-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  border: 1px dashed var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  color: var(--mp-muted-fg);
  font-size: 0.875rem;
  gap: 0.625rem;
  min-block-size: 12rem;
  text-align: center;
}

.subscribe-files-empty strong {
  color: var(--mp-fg);
  font-size: 0.9375rem;
  font-weight: 600;
}

.subscribe-files-empty--standalone {
  margin: 1.5rem;
  min-block-size: 20rem;
}

.subscribe-files-mobile-list {
  display: flex;
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 0%;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-block: 0.5rem 1.25rem;
  padding-inline: calc(1rem + env(safe-area-inset-left, 0px)) calc(1rem + env(safe-area-inset-right, 0px));
}

/* 移动端分集卡片禁止在纵向 Flex 列表内被压缩，避免多集时卡片高度塌陷裁切文件列表。 */
.subscribe-files-mobile-card {
  flex: 0 0 auto;
  border: 1px solid var(--mp-border);
  border-radius: var(--app-control-radius);
  background: var(--mp-list-group-bg);
}

.subscribe-files-mobile-card__header {
  display: grid;
  align-items: center;
  padding: 0.75rem 0.875rem;
  gap: 0.625rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.subscribe-files-mobile-card__episode {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--mp-primary-border);
  border-radius: 0.5rem;
  background: var(--mp-primary-soft);
  color: var(--mp-primary-fg);
  font-size: 0.8125rem;
  font-weight: 700;
  min-inline-size: 2.5rem;
}

.subscribe-files-mobile-card__title {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.1rem;
}

.subscribe-files-mobile-card__title strong {
  overflow: hidden;
  color: var(--mp-fg);
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-mobile-card__title span,
.subscribe-files-mobile-card__empty {
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
}

.subscribe-files-mobile-card__files {
  display: flex;
  flex-direction: column;
  padding: 0.75rem 0.875rem;
  border-block-start: 1px solid var(--mp-border);
  gap: 0.75rem;
}

.subscribe-files-mobile-file {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.subscribe-files-mobile-file + .subscribe-files-mobile-file {
  padding-block-start: 0.75rem;
  border-block-start: 1px solid var(--mp-border-subtle);
}

.subscribe-files-mobile-file__title {
  color: var(--mp-fg);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.subscribe-files-path-block--mobile {
  margin-block-start: 0.1rem;
}

.subscribe-files-mobile-card__empty {
  border-block-start: 1px solid var(--mp-border-subtle);
  padding-block: 0.625rem 0.75rem;
  padding-inline: 0.875rem;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}

@media (width >= 960px) and (width <= 1180px) {
  .subscribe-files-hero__content {
    gap: 1rem;
    grid-template-columns: 4rem minmax(0, 1fr) 15.5rem;
    padding-block: 0.875rem;
    padding-inline: 1.25rem;
  }

  .subscribe-files-poster-card {
    block-size: 6rem;
    inline-size: 4rem;
  }

  .subscribe-files-stats {
    padding-block-start: 1.25rem;
  }

  .subscribe-files-stat-card__icon {
    display: none;
  }

  .subscribe-files-stat-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .subscribe-files-stat-card__content {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.35rem;
  }

  .subscribe-files-content {
    gap: 0.75rem;
    grid-template-columns: 14.25rem minmax(0, 1fr);
    padding-block: 0.75rem 1rem;
    padding-inline: 1.25rem;
  }
}

@media (width >= 960px) and (height <= 680px) {
  .subscribe-files-hero__content {
    gap: 0.875rem 1rem;
    grid-template-columns: 3.75rem minmax(0, 1fr) 18rem;
    padding-block: 0.75rem;
  }

  .subscribe-files-poster-card {
    block-size: 5.625rem;
    inline-size: 3.75rem;
  }

  .subscribe-files-hero__description {
    display: none;
  }

  .subscribe-files-stats {
    padding-block-start: 1.25rem;
  }

  .subscribe-files-content {
    padding-block: 0.75rem 1rem;
  }
}

@media (width < 960px) {
  :global(.v-dialog.v-dialog--fullscreen > .v-overlay__content.subscribe-files-dialog-content) {
    overflow: hidden;
  }

  .subscribe-files-dialog {
    block-size: 100%;
    max-block-size: 100%;
    min-block-size: 0;
  }

  .subscribe-files-dialog__close {
    inset-block-start: 0.5rem;
    inset-inline-end: calc(0.5rem + env(safe-area-inset-right, 0px));
  }

  .subscribe-files-hero__content {
    align-items: center;
    gap: 0.625rem 0.75rem;
    grid-template-columns: 3.25rem minmax(0, 1fr);
    padding: 0.75rem calc(1rem + env(safe-area-inset-right, 0px)) 0.75rem calc(1rem + env(safe-area-inset-left, 0px));
  }

  .subscribe-files-poster-card {
    block-size: 4.875rem;
    inline-size: 3.25rem;
  }

  .subscribe-files-hero__meta {
    gap: 0.2rem;
    padding-inline-end: 2.25rem;
  }

  .subscribe-files-hero__eyebrow {
    font-size: 0.7rem;
  }

  .subscribe-files-hero__title {
    font-size: 1.0625rem;
  }

  .subscribe-files-hero__description {
    display: none;
  }

  .subscribe-files-stats {
    gap: 0.5rem;
    grid-column: 1 / -1;
    max-inline-size: none;
    padding-block-start: 0;
  }

  .subscribe-files-stat-card {
    padding: 0.4375rem 0.625rem;
    gap: 0.3rem;
    grid-template-columns: minmax(0, 1fr);
  }

  .subscribe-files-stat-card__icon {
    display: none;
  }

  .subscribe-files-stat-card__content {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.375rem;
  }

  .subscribe-files-stat-card__value {
    font-size: 0.875rem;
  }

  .subscribe-files-content {
    display: flex;
    overflow: hidden;
    flex: 1 1 0%;
    flex-direction: column;
    padding: 0;
    gap: 0;
    min-block-size: 0;
  }

  .subscribe-files-main {
    display: flex;
    overflow: hidden;
    flex: 1 1 0%;
    flex-direction: column;
    border: 0;
    border-radius: 0;
    background: transparent;
    block-size: auto;
    min-block-size: 0;
  }

  .subscribe-files-toolbar {
    padding: 0.625rem calc(1rem + env(safe-area-inset-right, 0px)) 0.375rem calc(1rem + env(safe-area-inset-left, 0px));
    border-block-end: 0;
  }

  .subscribe-files-tabs,
  .subscribe-files-tab-group {
    inline-size: 100%;
  }

  .subscribe-files-tab-group :deep(.v-btn) {
    min-inline-size: 0;
  }
}

@media (width < 960px) and (height <= 580px) {
  .subscribe-files-shell {
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .subscribe-files-content,
  .subscribe-files-main,
  .subscribe-files-mobile-list {
    overflow: visible;
    flex: 0 0 auto;
  }
}
</style>
