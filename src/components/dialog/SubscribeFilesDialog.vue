<script setup lang="ts">
import { copyToClipboard } from '@/@core/utils/navigator'
import api from '@/api'
import type { SubscribeDownloadFileInfo, SubscribeEpisodeInfo, SubscribeLibraryFileInfo, SubscrbieInfo } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

type SubscribeFileTab = 'download' | 'library'
type EpisodeStatus = 'library' | 'download' | 'missing'

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

/**
 * 调用 API 查询订阅文件信息。
 */
async function loadSubscribeFilesInfo() {
  try {
    loading.value = true
    subScribeInfo.value = await api.get(`subscribe/files/${props.subid}`)
  } catch (e) {
    console.log(e)
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
function resolveEpisodeStatus(download: SubscribeDownloadFileInfo[], library: SubscribeLibraryFileInfo[]): EpisodeStatus {
  if (library.length) return 'library'
  if (download.length) return 'download'
  return 'missing'
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
 * 返回集状态对应的图标。
 */
function getEpisodeStatusIcon(status: EpisodeStatus) {
  const iconMap: Record<EpisodeStatus, string> = {
    library: 'mdi-check-circle-outline',
    download: 'mdi-download-circle-outline',
    missing: 'mdi-clock-outline',
  }

  return iconMap[status]
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
 */
function resolveResolutionLabel(file?: SubscribeDownloadFileInfo | SubscribeLibraryFileInfo) {
  const text = 'torrent_title' in (file || {}) ? `${(file as SubscribeDownloadFileInfo).torrent_title || ''} ${file?.file_path || ''}` : file?.file_path || ''
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
  return Math.max(subscribeTotal, episodeGroups.value.length)
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
    scrollable
    max-width="74rem"
    :fullscreen="!display.mdAndUp.value"
    content-class="subscribe-files-overlay"
  >
    <VCard class="subscribe-files-dialog">
      <VBtn
        class="subscribe-files-dialog__close"
        icon="mdi-close"
        variant="text"
        size="small"
        :aria-label="t('common.close')"
        @click="emit('close')"
      />

      <LoadingBanner v-if="loading" />

      <VCardText v-else class="subscribe-files-dialog__body">
        <div v-if="subScribeInfo?.subscribe" class="subscribe-files-shell">
          <section class="subscribe-files-hero" :style="heroStyle">
            <div class="subscribe-files-hero__shade" />
            <div class="subscribe-files-hero__content">
              <div class="subscribe-files-poster-card">
                <VImg :src="posterUrl" cover class="subscribe-files-poster-card__image">
                  <template #placeholder>
                    <VSkeletonLoader class="w-100 h-100" />
                  </template>
                </VImg>
                <div class="subscribe-files-poster-card__caption">
                  <span>{{ subscribe?.name }}</span>
                </div>
              </div>

              <div class="subscribe-files-hero__meta">
                <div class="subscribe-files-hero__eyebrow">
                  <VIcon icon="mdi-folder-play-outline" size="18" />
                  <span>{{ t('dialog.subscribeFiles.title') }}</span>
                </div>
                <h2 class="subscribe-files-hero__title">{{ subscribe?.name }}</h2>
                <div class="subscribe-files-hero__chips">
                  <VChip v-if="subscribe?.season" color="primary" variant="flat" size="small">
                    {{ t('dialog.subscribeFiles.season', { number: subscribe.season }) }}
                  </VChip>
                  <VChip v-if="subscribe?.year" variant="tonal" size="small">{{ subscribe.year }}</VChip>
                  <VChip
                    :color="getSubscribeStateColor(subscribe?.state)"
                    variant="flat"
                    size="small"
                    prepend-icon="mdi-check-circle"
                  >
                    {{ getSubscribeStateText(subscribe?.state) }}
                  </VChip>
                </div>
                <p class="subscribe-files-hero__description">
                  {{ selectedEpisode?.description || subscribe?.description || t('dialog.subscribeFiles.noOverview') }}
                </p>
                <div class="subscribe-files-stats">
                  <div v-for="item in statItems" :key="item.key" class="subscribe-files-stat-card">
                    <div class="subscribe-files-stat-card__icon">
                      <VIcon :icon="item.icon" :color="item.color" size="22" />
                    </div>
                    <div class="subscribe-files-stat-card__content">
                      <div class="subscribe-files-stat-card__label">{{ item.label }}</div>
                      <div class="subscribe-files-stat-card__value">{{ item.value }}/{{ item.total }}</div>
                    </div>
                    <VProgressLinear
                      :model-value="calcPercent(item.value, item.total)"
                      :color="item.color"
                      height="3"
                      rounded
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="subscribe-files-content">
            <aside v-if="display.mdAndUp.value" class="subscribe-files-episode-rail">
              <div class="subscribe-files-episode-rail__header">
                <div>
                  <span>{{ t('dialog.subscribeFiles.episodeList') }}</span>
                  <strong>{{ t('dialog.subscribeFiles.episodeTotal', { count: totalCount }) }}</strong>
                </div>
                <VChip size="small" color="warning" variant="tonal">
                  {{ t('dialog.subscribeFiles.missingCount', { count: missingCount }) }}
                </VChip>
              </div>

              <div class="subscribe-files-episode-list">
                <button
                  v-for="episode in episodeGroups"
                  :key="episode.episodeNumber"
                  class="subscribe-files-episode-item"
                  :class="{ 'subscribe-files-episode-item--active': selectedEpisode?.episodeNumber === episode.episodeNumber }"
                  type="button"
                  @click="selectEpisode(episode.episodeNumber)"
                >
                  <span class="subscribe-files-episode-item__label">{{ episode.episodeLabel }}</span>
                  <span class="subscribe-files-episode-item__title">{{ episode.title }}</span>
                  <VChip :color="getEpisodeStatusColor(episode.status)" variant="tonal" size="x-small">
                    {{ getEpisodeStatusText(episode.status) }}
                  </VChip>
                  <VIcon
                    class="subscribe-files-episode-item__icon"
                    :icon="getEpisodeStatusIcon(episode.status)"
                    :color="getEpisodeStatusColor(episode.status)"
                    size="18"
                  />
                </button>
              </div>
            </aside>

            <main class="subscribe-files-main">
              <div class="subscribe-files-tabs">
                <VBtnToggle
                  v-model="activeTab"
                  mandatory
                  divided
                  class="subscribe-files-tab-group"
                  selected-class="subscribe-files-tab-group__button--active"
                >
                  <VBtn value="download" class="subscribe-files-tab-group__button">
                    <VIcon size="20" start icon="mdi-download" />
                    {{ t('dialog.subscribeFiles.downloadTab') }}
                  </VBtn>
                  <VBtn value="library" class="subscribe-files-tab-group__button">
                    <VIcon size="20" start icon="mdi-filmstrip-box-multiple" />
                    {{ t('dialog.subscribeFiles.libraryTab') }}
                  </VBtn>
                </VBtnToggle>
              </div>

              <div v-if="display.mdAndUp.value" class="subscribe-files-detail">
                <div class="subscribe-files-detail__header">
                  <div>
                    <div class="subscribe-files-detail__title">
                      <span>{{ selectedEpisode?.episodeLabel }}</span>
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

                <transition name="fade-slide" mode="out-in">
                  <div :key="activeTab" class="subscribe-files-file-list">
                    <template v-if="selectedFiles.length">
                      <article
                        v-for="(file, index) in selectedFiles"
                        :key="`${activeTab}-${file.file_path || index}`"
                        class="subscribe-files-file-card"
                      >
                        <div class="subscribe-files-file-card__media">
                          <VIcon
                            :icon="activeTab === 'download' ? 'mdi-play' : 'mdi-server-network'"
                            :color="activeTab === 'download' ? 'info' : 'success'"
                            size="20"
                          />
                        </div>
                        <div class="subscribe-files-file-card__content">
                          <div class="subscribe-files-file-card__topline">
                            <VChip v-if="resolveResolutionLabel(file)" color="primary" variant="tonal" size="x-small">
                              {{ resolveResolutionLabel(file) }}
                            </VChip>
                            <VChip
                              v-if="activeTab === 'download' && (file as SubscribeDownloadFileInfo).site_name"
                              color="primary"
                              variant="tonal"
                              size="x-small"
                            >
                              {{ (file as SubscribeDownloadFileInfo).site_name }}
                            </VChip>
                            <VChip
                              v-if="activeTab === 'library' && (file as SubscribeLibraryFileInfo).storage"
                              color="success"
                              variant="tonal"
                              size="x-small"
                            >
                              {{ (file as SubscribeLibraryFileInfo).storage }}
                            </VChip>
                            <VChip
                              :color="activeTab === 'download' ? 'info' : 'success'"
                              variant="flat"
                              size="x-small"
                            >
                              {{ activeTab === 'download' ? t('dialog.subscribeFiles.statusDownloaded') : t('dialog.subscribeFiles.statusInLibrary') }}
                            </VChip>
                          </div>
                          <h3 class="subscribe-files-file-card__title">
                            {{ activeTab === 'download' ? ((file as SubscribeDownloadFileInfo).torrent_title || t('dialog.subscribeFiles.unknownTorrent')) : activeSectionTitle }}
                          </h3>
                          <div v-if="activeTab === 'download'" class="subscribe-files-file-card__meta">
                            <span v-if="(file as SubscribeDownloadFileInfo).downloader">
                              {{ t('dialog.subscribeFiles.downloader') }}：{{ (file as SubscribeDownloadFileInfo).downloader }}
                            </span>
                            <span v-if="(file as SubscribeDownloadFileInfo).hash">
                              Hash：{{ (file as SubscribeDownloadFileInfo).hash }}
                            </span>
                          </div>
                          <div class="subscribe-files-path-block">
                            <div class="subscribe-files-path-block__label">
                              <VIcon icon="mdi-folder-outline" size="16" />
                              {{ t('dialog.subscribeFiles.filePath') }}
                            </div>
                            <code>{{ file.file_path || t('dialog.subscribeFiles.noPath') }}</code>
                            <VBtn
                              icon="mdi-content-copy"
                              variant="tonal"
                              size="small"
                              :disabled="!file.file_path"
                              :aria-label="t('dialog.subscribeFiles.copyPath')"
                              @click="copyPath(file.file_path)"
                            />
                          </div>
                        </div>
                      </article>
                    </template>

                    <div v-else class="subscribe-files-empty">
                      <VIcon icon="mdi-folder-search-outline" size="34" />
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
                    <div class="subscribe-files-mobile-card__episode">{{ episode.episodeLabel }}</div>
                    <div class="subscribe-files-mobile-card__title">
                      <strong>{{ episode.title }}</strong>
                      <span>{{ activeSectionTitle }}</span>
                    </div>
                    <VChip :color="getEpisodeStatusColor(episode.status)" variant="tonal" size="small">
                      {{ getEpisodeStatusText(episode.status) }}
                    </VChip>
                  </div>

                  <div v-if="episode.activeFiles.length" class="subscribe-files-mobile-card__files">
                    <div
                      v-for="(file, index) in episode.activeFiles"
                      :key="`${episode.episodeNumber}-${activeTab}-${file.file_path || index}`"
                      class="subscribe-files-mobile-file"
                    >
                      <div class="subscribe-files-mobile-file__chips">
                        <VChip v-if="resolveResolutionLabel(file)" color="primary" variant="tonal" size="x-small">
                          {{ resolveResolutionLabel(file) }}
                        </VChip>
                        <VChip
                          v-if="activeTab === 'download' && (file as SubscribeDownloadFileInfo).site_name"
                          color="primary"
                          variant="tonal"
                          size="x-small"
                        >
                          {{ (file as SubscribeDownloadFileInfo).site_name }}
                        </VChip>
                        <VChip
                          v-if="activeTab === 'library' && (file as SubscribeLibraryFileInfo).storage"
                          color="success"
                          variant="tonal"
                          size="x-small"
                        >
                          {{ (file as SubscribeLibraryFileInfo).storage }}
                        </VChip>
                      </div>
                      <div v-if="activeTab === 'download'" class="subscribe-files-mobile-file__title">
                        {{ (file as SubscribeDownloadFileInfo).torrent_title || t('dialog.subscribeFiles.unknownTorrent') }}
                      </div>
                      <div class="subscribe-files-path-block subscribe-files-path-block--mobile">
                        <code>{{ file.file_path || t('dialog.subscribeFiles.noPath') }}</code>
                        <VBtn
                          icon="mdi-content-copy"
                          variant="tonal"
                          size="small"
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
          <VIcon icon="mdi-folder-alert-outline" size="40" />
          <div>{{ t('dialog.subscribeFiles.noData') }}</div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.subscribe-files-dialog {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), var(--sfd-border-opacity));
  backdrop-filter: blur(var(--sfd-blur)) saturate(1.18);
  background:
    linear-gradient(145deg, rgba(var(--v-theme-primary), var(--sfd-accent-opacity)), transparent 42%),
    rgba(var(--v-theme-surface), var(--sfd-dialog-opacity)) !important;
  color: rgb(var(--v-theme-on-surface));

  --sfd-accent-opacity: 0.1;
  --sfd-blur: 18px;
  --sfd-border-opacity: 0.14;
  --sfd-dialog-opacity: 0.9;
  --sfd-hero-end-opacity: 0.88;
  --sfd-hero-mid-opacity: 0.62;
  --sfd-hero-shade-opacity: 0.92;
  --sfd-hero-start-opacity: 0.98;
  --sfd-panel-opacity: 0.12;
  --sfd-panel-strong-opacity: 0.18;
  --sfd-code-opacity: 0.16;
  --sfd-muted-opacity: 0.7;
}

.subscribe-files-dialog__close {
  position: absolute;
  z-index: 8;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.22);
  inset-block-start: 1rem;
  inset-inline-end: 1rem;
}

.subscribe-files-dialog__body {
  overflow: hidden;
  padding: 0 !important;
}

.subscribe-files-shell {
  display: flex;
  flex-direction: column;
  min-block-size: min(86vh, 56rem);
}

.subscribe-files-hero {
  position: relative;
  overflow: hidden;
  min-block-size: 21rem;
  background:
    linear-gradient(
      90deg,
      rgba(var(--v-theme-surface), var(--sfd-hero-start-opacity)),
      rgba(var(--v-theme-surface), var(--sfd-hero-mid-opacity)) 48%,
      rgba(var(--v-theme-surface), var(--sfd-hero-end-opacity))
    ),
    var(--subscribe-files-backdrop) center / cover;
}

.subscribe-files-hero__shade {
  position: absolute;
  background:
    radial-gradient(circle at 24% 8%, rgba(var(--v-theme-primary), 0.24), transparent 34%),
    linear-gradient(180deg, transparent, rgba(var(--v-theme-surface), var(--sfd-hero-shade-opacity)) 94%);
  inset: 0;
}

.subscribe-files-hero__content {
  position: relative;
  z-index: 1;
  display: grid;
  align-items: end;
  gap: 2rem;
  grid-template-columns: 15rem minmax(0, 1fr);
  padding: 3.5rem 2.25rem 2rem;
}

.subscribe-files-poster-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: calc(var(--app-surface-radius) + 0.25rem);
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-surface), var(--sfd-panel-strong-opacity));
}

.subscribe-files-poster-card__image {
  block-size: 100%;
}

.subscribe-files-poster-card__caption {
  position: absolute;
  display: flex;
  align-items: flex-end;
  padding: 1.25rem 1rem 1rem;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.72));
  color: white;
  font-size: 1.35rem;
  font-weight: 700;
  inset-block-end: 0;
  inset-inline: 0;
  line-height: 1.25;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.45);
}

.subscribe-files-hero__meta {
  min-inline-size: 0;
}

.subscribe-files-hero__eyebrow {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.85rem;
  font-weight: 600;
  gap: 0.35rem;
  letter-spacing: 0.04em;
}

.subscribe-files-hero__title {
  overflow: hidden;
  margin-block: 0.75rem 0.5rem;
  font-size: clamp(2.1rem, 4vw, 3.25rem);
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.08;
  text-overflow: ellipsis;
}

.subscribe-files-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.subscribe-files-hero__description {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 0.95rem;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  line-height: 1.75;
  margin-block: 1rem 0;
  max-inline-size: 42rem;
}

.subscribe-files-stats {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-block-start: 1rem;
  max-inline-size: 42rem;
}

.subscribe-files-stat-card {
  display: grid;
  align-items: center;
  padding: 0.9rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--sfd-panel-opacity));
  gap: 0.65rem;
  grid-template-columns: auto 1fr;
}

.subscribe-files-stat-card > .v-progress-linear {
  grid-column: 1 / -1;
}

.subscribe-files-stat-card__content {
  min-inline-size: 0;
}

.subscribe-files-stat-card__icon {
  display: grid;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 2.4rem;
  inline-size: 2.4rem;
  place-items: center;
}

.subscribe-files-stat-card__label {
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.78rem;
}

.subscribe-files-stat-card__value {
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1.15;
}

.subscribe-files-content {
  display: grid;
  flex: 1 1 auto;
  gap: 1rem;
  grid-template-columns: 19rem minmax(0, 1fr);
  min-block-size: 0;
  padding: 0 1.25rem 1.25rem;
}

.subscribe-files-episode-rail,
.subscribe-files-main {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--sfd-panel-opacity));
}

.subscribe-files-episode-rail {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.subscribe-files-episode-rail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  gap: 0.75rem;
}

.subscribe-files-episode-rail__header div {
  display: grid;
  gap: 0.15rem;
}

.subscribe-files-episode-rail__header span {
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.85rem;
}

.subscribe-files-episode-list {
  display: flex;
  overflow: auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.35rem;
  min-block-size: 0;
  padding: 0.75rem;
}

.subscribe-files-episode-item {
  display: grid;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid transparent;
  border-radius: calc(var(--app-surface-radius) - 0.25rem);
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  column-gap: 0.65rem;
  cursor: pointer;
  grid-template-columns: 2.75rem minmax(0, 1fr) auto auto;
  text-align: start;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.subscribe-files-episode-item:hover,
.subscribe-files-episode-item--active {
  border-color: rgba(var(--v-theme-primary), 0.38);
  background: rgba(var(--v-theme-primary), 0.12);
}

.subscribe-files-episode-item--active {
  transform: translateX(2px);
}

.subscribe-files-episode-item__label {
  display: grid;
  border-radius: 0.75rem;
  background: rgba(var(--v-theme-primary), 0.18);
  block-size: 2.4rem;
  color: rgb(var(--v-theme-primary));
  font-weight: 800;
  inline-size: 2.4rem;
  place-items: center;
}

.subscribe-files-episode-item__title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-episode-item__icon {
  opacity: 0.9;
}

.subscribe-files-main {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.subscribe-files-tabs {
  padding: 1rem 1rem 0;
}

.subscribe-files-tab-group {
  display: grid;
  overflow: hidden;
  inline-size: min(28rem, 100%);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-surface), var(--sfd-panel-opacity));
  gap: 0.35rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0.25rem;
}

.subscribe-files-tab-group :deep(.v-btn) {
  min-inline-size: 0;
}

.subscribe-files-tab-group :deep(.v-btn__content) {
  flex-wrap: nowrap;
  white-space: nowrap;
}

.subscribe-files-tab-group :deep(.v-icon) {
  flex: 0 0 auto;
}

.subscribe-files-tab-group__button {
  border-radius: calc(var(--app-control-radius) - 0.15rem) !important;
  color: rgba(var(--v-theme-on-surface), 0.72) !important;
  font-weight: 700;
  letter-spacing: 0;
}

.subscribe-files-tab-group__button--active {
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.92), rgba(var(--v-theme-primary), 0.68)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;
}

.subscribe-files-detail {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding: 1rem;
}

.subscribe-files-detail__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-block-end: 1rem;
  gap: 1rem;
}

.subscribe-files-detail__title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.subscribe-files-detail__title span {
  color: rgb(var(--v-theme-primary));
  font-weight: 800;
}

.subscribe-files-detail__title strong {
  font-size: 1.1rem;
}

.subscribe-files-detail__subtitle {
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.85rem;
  margin-block-start: 0.2rem;
}

.subscribe-files-file-list {
  display: flex;
  overflow: auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.8rem;
  min-block-size: 0;
  padding-block-end: 0.25rem;
}

.subscribe-files-file-card {
  display: grid;
  padding: 0.9rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--sfd-panel-opacity));
  gap: 0.8rem;
  grid-template-columns: auto minmax(0, 1fr);
}

.subscribe-files-file-card__media {
  display: grid;
  border-radius: 0.85rem;
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 2.5rem;
  inline-size: 2.5rem;
  place-items: center;
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
  overflow: hidden;
  margin-block: 0.6rem 0.35rem;
  font-size: 0.96rem;
  font-weight: 700;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-file-card__meta {
  display: flex;
  flex-wrap: wrap;
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.78rem;
  gap: 0.4rem 0.8rem;
  margin-block-end: 0.65rem;
}

.subscribe-files-path-block {
  display: grid;
  align-items: center;
  padding: 0.65rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: calc(var(--app-surface-radius) - 0.25rem);
  background: rgba(var(--v-theme-on-surface), var(--sfd-code-opacity));
  gap: 0.55rem;
  grid-template-columns: minmax(0, 1fr) auto;
}

.subscribe-files-path-block__label {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.78rem;
  gap: 0.25rem;
  grid-column: 1 / -1;
}

.subscribe-files-path-block code {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.8rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.subscribe-files-empty {
  display: grid;
  align-content: center;
  justify-items: center;
  min-block-size: 12rem;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
  border-radius: var(--app-surface-radius);
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  gap: 0.5rem;
}

.subscribe-files-empty--standalone {
  min-block-size: 24rem;
  margin: 1.5rem;
}

.subscribe-files-mobile-list {
  display: flex;
  overflow: auto;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem;
}

.subscribe-files-mobile-card {
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--sfd-panel-opacity));
}

.subscribe-files-mobile-card__header {
  display: grid;
  align-items: center;
  padding: 0.85rem;
  gap: 0.65rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.subscribe-files-mobile-card__episode {
  display: grid;
  border-radius: 0.8rem;
  background: rgba(var(--v-theme-primary), 0.18);
  block-size: 3rem;
  color: rgb(var(--v-theme-primary));
  font-size: 1.05rem;
  font-weight: 800;
  inline-size: 3rem;
  place-items: center;
}

.subscribe-files-mobile-card__title {
  display: grid;
  min-inline-size: 0;
}

.subscribe-files-mobile-card__title strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-mobile-card__title span,
.subscribe-files-mobile-card__empty {
  color: rgba(var(--v-theme-on-surface), var(--sfd-muted-opacity));
  font-size: 0.8rem;
}

.subscribe-files-mobile-card__files {
  display: grid;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  gap: 0.75rem;
  padding: 0.85rem;
}

.subscribe-files-mobile-file {
  display: grid;
  gap: 0.55rem;
}

.subscribe-files-mobile-file__title {
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-files-path-block--mobile {
  grid-template-columns: minmax(0, 1fr) auto;
}

.subscribe-files-mobile-card__empty {
  padding: 0 0.85rem 0.85rem;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(0.25rem);
}

.subscribe-files-dialog.v-theme--light {
  --sfd-accent-opacity: 0.08;
  --sfd-border-opacity: 0.11;
  --sfd-dialog-opacity: 0.96;
  --sfd-panel-opacity: 0.62;
  --sfd-panel-strong-opacity: 0.76;
  --sfd-code-opacity: 0.05;
  --sfd-muted-opacity: 0.68;
}

@media (width <= 960px) {
  .subscribe-files-dialog {
    border: 0;
    border-radius: 0 !important;
  }

  .subscribe-files-shell {
    min-block-size: 100dvh;
  }

  .subscribe-files-hero {
    min-block-size: auto;
  }

  .subscribe-files-hero__content {
    display: grid;
    gap: 1rem;
    grid-template-columns: 8rem minmax(0, 1fr);
    padding: 1rem;
  }

  .subscribe-files-poster-card {
    border-radius: 1rem;
  }

  .subscribe-files-poster-card__caption {
    display: none;
  }

  .subscribe-files-hero__title {
    font-size: 1.55rem;
  }

  .subscribe-files-hero__description {
    display: none;
  }

  .subscribe-files-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-block-start: 0.75rem;
  }

  .subscribe-files-stat-card {
    padding: 0.75rem;
    gap: 0.45rem;
    grid-template-columns: auto minmax(0, 1fr);
  }

  .subscribe-files-stat-card__content {
    display: block;
  }

  .subscribe-files-stat-card__label,
  .subscribe-files-stat-card__value {
    white-space: nowrap;
  }

  .subscribe-files-stat-card__icon {
    block-size: 2rem;
    inline-size: 2rem;
  }

  .subscribe-files-stat-card__value {
    font-size: 1.2rem;
  }

  .subscribe-files-content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    padding: 0;
  }

  .subscribe-files-main {
    flex: 1 1 auto;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .subscribe-files-tabs {
    padding: 0.9rem 1rem 0;
  }

  .subscribe-files-tab-group {
    inline-size: 100%;
  }
}

@media (width <= 560px) {
  .subscribe-files-hero__content {
    grid-template-columns: 6.5rem minmax(0, 1fr);
  }

  .subscribe-files-mobile-card__header {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .subscribe-files-mobile-card__header .v-chip {
    justify-self: start;
    grid-column: 2;
  }
}
</style>
