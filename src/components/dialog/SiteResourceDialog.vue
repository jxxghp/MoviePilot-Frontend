<script setup lang="ts">
import type { PropType } from 'vue'
import api from '@/api'
import type { Site, SiteCategory, TorrentInfo } from '@/api/types'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { formatFileSize } from '@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import AddDownloadDialog from '../dialog/AddDownloadDialog.vue'

type ResourceSort = 'latest' | 'largest' | 'mostSeeders' | 'mostPeers'

const RESOURCE_PAGE_SIZE = 100
const RESOURCE_LOAD_AHEAD = 480

// 国际化
const { t } = useI18n()

// 响应式断点
const display = useDisplay()

// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
})

// 注册事件
const emit = defineEmits(['close'])

// 查询条件
const keyword = ref<string>()
const selectCategory = ref<number[]>([])

// 站点分类
const siteCategoryList = ref<SiteCategory[]>([])

// 资源分页数据
const resourceDataList = ref<TorrentInfo[]>([])
const resourcePage = ref(-1)
const resourceHasMore = ref(true)
const resourceLoading = ref(false)
const resourceLoadingMore = ref(false)
const resourceError = ref(false)
const resourceLoadMoreError = ref(false)

// 只有最后一次搜索可以更新列表与加载状态，避免旧请求覆盖新条件。
let resourceRequestId = 0

// 资源滚动容器
const resourceScrollRef = ref<HTMLElement>()

// 排序
const resourceSort = ref<ResourceSort>('latest')

// 种子元数据
const torrent = ref<TorrentInfo>()

// 添加下载对话框
const addDownloadDialog = ref(false)

// 分类选项
const categoryOptions = computed(() =>
  siteCategoryList.value.map(item => ({
    title: item.desc,
    value: item.id,
  })),
)

// 排序选项
const resourceSortOptions = computed(() => [
  { title: t('dialog.siteResource.latest'), value: 'latest' as const },
  { title: t('dialog.siteResource.largest'), value: 'largest' as const },
  { title: t('dialog.siteResource.mostSeeders'), value: 'mostSeeders' as const },
  { title: t('dialog.siteResource.mostPeers'), value: 'mostPeers' as const },
])

// 站点是否配置了资源分类
const hasSiteCategory = computed(() => siteCategoryList.value.length > 0)

// 已加载资源数量
const resourceTotalItems = computed(() => resourceDataList.value.length)

// 是否小屏幕
const isMobileLayout = computed(() => display.smAndDown.value)

// 移动端上滑后收起筛选区域，保留搜索图标以便快速恢复。
const isMobileSearchCollapsed = ref(false)

// 记录资源滚动位置，用于识别移动端内容是否正在向上移动。
let lastResourceScrollTop = 0

// 结果统计文案
const resultSummaryText = computed(() => t('dialog.siteResource.resourceCount', { count: resourceTotalItems.value }))

// 排序后的资源列表
const sortedResourceList = computed(() => {
  const resources = [...resourceDataList.value]

  if (resourceSort.value === 'largest') {
    return resources.sort((left, right) => right.size - left.size)
  }

  if (resourceSort.value === 'mostSeeders') {
    return resources.sort((left, right) => right.seeders - left.seeders)
  }

  if (resourceSort.value === 'mostPeers') {
    return resources.sort((left, right) => right.peers - left.peers)
  }

  // 后端第一页已经按最新发布返回；保留分页顺序，避免跨页追加时重新排列资源。
  return resources
})

// 渐进网格的估算高度，桌面端为横向资源卡，移动端为纵向资源卡。
const estimatedResourceItemHeight = computed(() => (isMobileLayout.value ? 280 : 166))

// 获取资源去重标识，兼容站点没有返回链接的情况。
function getResourceIdentity(item: TorrentInfo): string {
  return item.page_url || item.enclosure || `${item.title ?? ''}|${item.pubdate ?? ''}|${item.size}|${item.seeders}`
}

// 获取渐进网格使用的稳定键。
function getResourceItemKey(item: TorrentInfo, index: number): string {
  return getResourceIdentity(item) || `${item.title ?? ''}-${item.pubdate ?? ''}-${index}`
}

// 打开种子详情页面。
function openTorrentDetail(pageUrl: string): void {
  if (!pageUrl) return
  window.open(pageUrl, '_blank')
}

// 打开种子文件下载地址。
function downloadTorrentFile(enclosure: string): void {
  if (!enclosure) return
  window.open(enclosure, '_blank')
}

// 根据促销因子返回 Vuetify 主题色，避免绑定具体主题的 CSS 类。
function getVolumeFactorColor(downloadVolume: number, uploadVolume: number): string {
  if (downloadVolume < 1) return 'success'
  if (uploadVolume > 1) return 'info'
  return 'secondary'
}

// 打开添加下载对话框。
function addDownload(resource: TorrentInfo): void {
  torrent.value = resource
  addDownloadDialog.value = true
}

// 添加下载完成后关闭子对话框。
function addDownloadSuccess(): void {
  addDownloadDialog.value = false
}

// 添加下载失败后关闭子对话框。
function addDownloadError(): void {
  addDownloadDialog.value = false
}

// 将新一页资源追加到列表并按稳定标识去重。
function appendResourcePage(resources: TorrentInfo[]): void {
  const existingKeys = new Set(resourceDataList.value.map(getResourceIdentity))
  const newResources = resources.filter(resource => {
    const key = getResourceIdentity(resource)
    if (existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })

  resourceDataList.value = [...resourceDataList.value, ...newResources]
}

// 请求指定页资源；请求编号失效时丢弃响应，防止旧搜索污染当前列表。
async function requestResourcePage(page: number, requestId: number): Promise<TorrentInfo[] | undefined> {
  const resources = await api.get<TorrentInfo[], TorrentInfo[]>(`site/resource/${props.site?.id}`, {
    params: {
      keyword: keyword.value,
      cat: selectCategory.value.join(','),
      page,
    },
    feedback: 'silent',
  })

  if (requestId !== resourceRequestId) return undefined
  return Array.isArray(resources) ? resources : []
}

// 重新查询第一页，保留旧结果直到新请求成功，避免搜索时内容突然空白。
async function getResourceList(): Promise<void> {
  const requestId = ++resourceRequestId
  resourceLoading.value = true
  resourceError.value = false
  resourceLoadMoreError.value = false
  resourcePage.value = -1
  resourceHasMore.value = true

  try {
    const resources = await requestResourcePage(0, requestId)
    if (!resources) return

    resourceDataList.value = []
    appendResourcePage(resources)
    resourcePage.value = 0
    resourceHasMore.value = resources.length >= RESOURCE_PAGE_SIZE
  } catch (error) {
    if (requestId !== resourceRequestId) return
    console.error(error)
    resourceError.value = true
  } finally {
    if (requestId === resourceRequestId) resourceLoading.value = false
  }
}

// 滚动接近底部时加载下一页，桌面和移动端共用同一条渐进加载链路。
async function loadMoreResources(): Promise<void> {
  if (resourceLoading.value || resourceLoadingMore.value || !resourceHasMore.value || resourcePage.value < 0) return

  const requestId = resourceRequestId
  const nextPage = resourcePage.value + 1
  resourceLoadingMore.value = true
  resourceLoadMoreError.value = false

  try {
    const resources = await requestResourcePage(nextPage, requestId)
    if (!resources) return

    appendResourcePage(resources)
    resourcePage.value = nextPage
    resourceHasMore.value = resources.length >= RESOURCE_PAGE_SIZE
  } catch (error) {
    if (requestId !== resourceRequestId) return
    console.error(error)
    resourceLoadMoreError.value = true
  } finally {
    if (requestId === resourceRequestId) resourceLoadingMore.value = false
  }
}

// 处理弹窗内部滚动，提前预取下一页以保持连续浏览。
function handleResourceScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return

  if (isMobileLayout.value) {
    const scrollDelta = target.scrollTop - lastResourceScrollTop
    if (scrollDelta > 4 && target.scrollTop > 24) {
      isMobileSearchCollapsed.value = true
    } else if (target.scrollTop <= 8) {
      isMobileSearchCollapsed.value = false
    }
  }
  lastResourceScrollTop = target.scrollTop

  if (target.scrollHeight - target.scrollTop - target.clientHeight <= RESOURCE_LOAD_AHEAD) {
    void loadMoreResources()
  }
}

// 点击搜索图标恢复移动端筛选区域。
function restoreMobileSearch(): void {
  isMobileSearchCollapsed.value = false
}

// 加载站点分类；分类失败不阻断资源浏览。
async function getSiteCategoryList(): Promise<void> {
  try {
    siteCategoryList.value =
      (await api.get<SiteCategory[], SiteCategory[]>(`site/category/${props.site?.id}`, { feedback: 'silent' })) ?? []
  } catch (error) {
    console.error(error)
  }
}

// 装载时同时初始化分类和第一页资源。
onMounted(() => {
  void getSiteCategoryList()
  void getResourceList()
})
</script>

<template>
  <VDialog scrollable :fullscreen="display.smAndDown.value" max-width="92rem" transition="dialog-bottom-transition">
    <VCard class="site-resource-dialog">
      <div>
        <VCardItem class="site-resource-dialog__header py-2">
          <template #prepend>
            <VIcon icon="mdi-file-search-outline" class="me-2" />
          </template>
          <VCardTitle>{{ t('dialog.siteResource.title') }}</VCardTitle>
          <VCardSubtitle>{{ props.site?.name }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn @click="emit('close')" />
      </div>

      <div
        class="site-resource-controls px-3 pt-3 pb-2"
        :class="{ 'site-resource-controls--collapsed': isMobileSearchCollapsed && isMobileLayout }"
      >
        <VSheet v-if="!isMobileSearchCollapsed || !isMobileLayout" class="site-resource-filter-panel" elevation="0">
          <VRow class="site-resource-filter-row">
            <VCol cols="12" md="5" class="site-resource-filter-cell">
              <VTextField
                v-model="keyword"
                class="site-resource-filter-input"
                density="compact"
                variant="outlined"
                :label="t('dialog.siteResource.searchKeyword')"
                :aria-label="t('dialog.siteResource.searchKeyword')"
                clearable
                prepend-inner-icon="mdi-magnify"
                hide-details
                @keyup.enter="getResourceList"
              />
            </VCol>
            <VCol cols="12" md="5" class="site-resource-filter-cell">
              <VSelect
                v-model="selectCategory"
                :items="categoryOptions"
                class="site-resource-filter-input site-resource-category-input"
                density="compact"
                variant="outlined"
                :label="t('dialog.siteResource.resourceCategory')"
                :aria-label="t('dialog.siteResource.resourceCategory')"
                multiple
                chips
                clearable
                prepend-inner-icon="mdi-folder-outline"
                hide-details
                :disabled="!hasSiteCategory"
              />
            </VCol>
            <VCol cols="12" md="2" class="site-resource-filter-cell site-resource-filter-cell--action">
              <VBtn
                color="primary"
                variant="flat"
                block
                size="default"
                rounded="lg"
                prepend-icon="mdi-magnify"
                class="site-resource-search-btn"
                @click="getResourceList"
              >
                {{ t('dialog.siteResource.search') }}
              </VBtn>
            </VCol>
          </VRow>
        </VSheet>

        <div
          class="site-resource-summary mt-3"
          :class="{ 'site-resource-summary--collapsed': isMobileSearchCollapsed && isMobileLayout }"
        >
          <VBtn
            v-if="isMobileSearchCollapsed && isMobileLayout"
            icon
            variant="text"
            size="small"
            class="site-resource-filter-toggle"
            :aria-label="t('dialog.siteResource.search')"
            @click="restoreMobileSearch"
          >
            <VIcon icon="mdi-magnify" />
          </VBtn>
          <div class="site-resource-summary__count text-body-2 font-weight-medium">
            {{ resultSummaryText }}
          </div>
          <VSelect
            v-model="resourceSort"
            :items="resourceSortOptions"
            class="site-resource-sort"
            density="compact"
            variant="plain"
            :aria-label="t('dialog.siteResource.sort')"
            prepend-inner-icon="mdi-sort-ascending"
            hide-details
          />
        </div>
      </div>

      <VCardText class="site-resource-content px-0 py-0 my-0">
        <VProgressLinear
          v-if="resourceLoading && resourceDataList.length > 0"
          color="primary"
          indeterminate
          height="2"
        />

        <VAlert
          v-if="resourceError && !resourceLoading"
          type="error"
          variant="tonal"
          class="mx-3 mb-3"
          :text="t('dialog.siteResource.loadFailed')"
        >
          <template #append>
            <VBtn variant="text" color="error" @click="getResourceList">
              {{ t('common.retry') }}
            </VBtn>
          </template>
        </VAlert>

        <div
          v-if="resourceLoading && resourceDataList.length === 0 && !resourceError"
          data-testid="resource-loading-state"
          class="site-resource-state px-4 py-8"
        >
          <VProgressCircular color="primary" indeterminate size="32" width="3" />
          <div class="mt-3 text-body-2 text-medium-emphasis">{{ t('dialog.siteResource.loading') }}</div>
        </div>

        <div
          v-else-if="resourceDataList.length > 0"
          ref="resourceScrollRef"
          data-testid="resource-scroll"
          class="site-resource-scroll"
          @scroll.passive="handleResourceScroll"
        >
          <div class="site-resource-list px-3 pb-4">
            <ProgressiveCardGrid
              :items="sortedResourceList"
              :columns="1"
              :gap="12"
              :estimated-item-height="estimatedResourceItemHeight"
              :overscan-rows="6"
              virtualize-in-overlay
              :get-item-key="getResourceItemKey"
            >
              <template #default="{ item }">
                <VCard class="site-resource-item" variant="flat" @click="addDownload(item)">
                  <VCardText class="site-resource-item__body pa-3">
                    <div class="site-resource-item__layout">
                      <div class="site-resource-item__main">
                        <div class="site-resource-title-content">
                          <div class="site-resource-item__title text-body-1 font-weight-medium">
                            {{ item.title || '-' }}
                          </div>
                          <div
                            v-if="item.description"
                            class="site-resource-item__description mt-1 text-body-2 text-medium-emphasis"
                          >
                            {{ item.description }}
                          </div>
                        </div>

                        <div class="site-resource-item__chips mt-2" :aria-label="t('dialog.siteResource.tags')">
                          <VChip
                            v-if="
                              item.volume_factor && (item.downloadvolumefactor !== 1 || item.uploadvolumefactor !== 1)
                            "
                            :color="getVolumeFactorColor(item.downloadvolumefactor, item.uploadvolumefactor)"
                            variant="tonal"
                            size="small"
                          >
                            {{ item.volume_factor }}
                          </VChip>
                          <VChip v-if="item.hit_and_run" color="error" variant="tonal" size="small"> H&amp;R </VChip>
                          <VChip v-if="item.freedate_diff" color="secondary" variant="tonal" size="small">
                            {{ item.freedate_diff }}
                          </VChip>
                          <VChip v-if="item.category" color="primary" variant="tonal" size="small">
                            {{ item.category }}
                          </VChip>
                          <VChip v-for="label in item.labels" :key="label" color="info" variant="tonal" size="small">
                            {{ label }}
                          </VChip>
                        </div>
                      </div>

                      <div class="site-resource-more-menu" @click.stop>
                        <VMenu location="bottom end" :close-on-content-click="true">
                          <template #activator="{ props: menuProps }">
                            <VBtn
                              v-bind="menuProps"
                              icon
                              variant="text"
                              size="small"
                              class="site-resource-more-btn"
                              :aria-label="t('dialog.siteResource.more')"
                            >
                              <VIcon icon="mdi-dots-vertical" />
                            </VBtn>
                          </template>
                          <VList density="compact" class="site-resource-menu">
                            <VListItem :disabled="!item.page_url" @click="openTorrentDetail(item.page_url || '')">
                              <template #prepend>
                                <VIcon icon="mdi-open-in-new" />
                              </template>
                              <VListItemTitle>{{ t('dialog.siteResource.viewDetails') }}</VListItemTitle>
                            </VListItem>
                            <VListItem
                              v-if="item.enclosure?.startsWith('http')"
                              @click="downloadTorrentFile(item.enclosure)"
                            >
                              <template #prepend>
                                <VIcon icon="mdi-download-outline" />
                              </template>
                              <VListItemTitle>{{ t('dialog.siteResource.downloadTorrent') }}</VListItemTitle>
                            </VListItem>
                          </VList>
                        </VMenu>
                      </div>

                      <div class="site-resource-item__metrics">
                        <div class="site-resource-metric site-resource-metric--time">
                          <VIcon icon="mdi-clock-outline" size="18" />
                          <span class="site-resource-metric__copy">
                            <span class="site-resource-metric__value">{{ item.date_elapsed || '-' }}</span>
                            <span v-if="item.pubdate" class="site-resource-metric__caption">{{ item.pubdate }}</span>
                          </span>
                        </div>
                        <div class="site-resource-metric">
                          <VIcon icon="mdi-harddisk" size="18" />
                          <span class="site-resource-metric__value">{{ formatFileSize(item.size) }}</span>
                        </div>
                        <div class="site-resource-metric site-resource-metric--success">
                          <VIcon icon="mdi-account-group-outline" size="18" />
                          <span class="site-resource-metric__value">{{ item.seeders }}</span>
                        </div>
                        <div class="site-resource-metric site-resource-metric--info">
                          <VIcon icon="mdi-download-outline" size="18" />
                          <span class="site-resource-metric__value">{{ item.peers }}</span>
                        </div>
                      </div>
                    </div>
                  </VCardText>
                </VCard>
              </template>
            </ProgressiveCardGrid>

            <div v-if="resourceLoadingMore" data-testid="resource-load-more" class="site-resource-load-state">
              <VProgressLinear color="primary" indeterminate rounded />
              <span class="text-body-2 text-medium-emphasis">{{ t('dialog.siteResource.loading') }}</span>
            </div>
            <div v-else-if="resourceLoadMoreError" class="site-resource-load-state">
              <VBtn color="primary" variant="text" size="small" @click="loadMoreResources">
                {{ t('common.retry') }}
              </VBtn>
            </div>
            <div v-else-if="!resourceHasMore" class="site-resource-load-state text-body-2 text-medium-emphasis">
              {{ t('dialog.siteResource.noMore') }}
            </div>
          </div>
        </div>

        <div v-else-if="!resourceError" class="site-resource-state px-4 py-10 text-body-2 text-medium-emphasis">
          {{ t('dialog.siteResource.noData') }}
        </div>
      </VCardText>
    </VCard>

    <AddDownloadDialog
      v-if="addDownloadDialog"
      v-model="addDownloadDialog"
      :torrent="torrent"
      @done="addDownloadSuccess"
      @error="addDownloadError"
      @close="addDownloadDialog = false"
    />
  </VDialog>
</template>

<style lang="scss" scoped>
.site-resource-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
}

.site-resource-controls {
  flex: 0 0 auto;
}

.site-resource-dialog__header {
  flex: 0 0 auto;
}

.site-resource-dialog__header :deep(.v-card-item__content) {
  min-inline-size: 0;
}

.site-resource-dialog__header :deep(.v-card-title),
.site-resource-dialog__header :deep(.v-card-subtitle) {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.site-resource-filter-panel {
  border: var(--app-grouped-list-border);
  border-radius: var(--app-grouped-list-radius);
  background: var(--app-grouped-list-background);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  box-shadow: var(--app-surface-shadow);
}

.site-resource-filter-row {
  align-items: stretch;
  margin: 0;
}

.site-resource-filter-row > .site-resource-filter-cell {
  padding: 0.55rem;
}

.site-resource-filter-input :deep(.v-field) {
  border-radius: var(--app-control-radius);
}

.site-resource-filter-input :deep(.v-field__prepend-inner) {
  color: rgb(var(--v-theme-primary));
}

.site-resource-filter-input :deep(.app-responsive-input__meta) {
  padding-inline: 0.65rem;
}

.site-resource-filter-cell--action {
  display: flex;
  align-items: center;
}

.site-resource-search-btn {
  min-block-size: 2.5rem;
}

.site-resource-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-block-size: 2.5rem;
}

.site-resource-summary__count {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-resource-sort {
  flex: 0 0 auto;
  inline-size: max-content;
  min-inline-size: 0;
  border-radius: var(--app-control-radius);
}

.site-resource-sort :deep(.v-field),
.site-resource-sort :deep(.v-field__input) {
  inline-size: max-content;
  min-inline-size: 0;
}

.site-resource-sort :deep(.v-select__selection) {
  white-space: nowrap;
}

.site-resource-sort :deep(.v-select__menu-icon),
.site-resource-sort :deep(.v-field__append-inner) {
  display: none !important;
}

.site-resource-sort :deep(.v-field__prepend-inner) {
  color: rgb(var(--v-theme-primary));
}

.site-resource-content {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.site-resource-scroll {
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 auto;
  min-block-size: 0;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.site-resource-list {
  min-block-size: 100%;
}

.site-resource-item {
  border: var(--app-grouped-list-border);
  border-radius: var(--app-grouped-list-radius);
  background: var(--app-grouped-list-background);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  box-shadow: var(--app-surface-shadow);
  transition:
    background-color var(--mp-motion-duration-page) var(--mp-motion-ease-standard),
    box-shadow var(--mp-motion-duration-page) var(--mp-motion-ease-standard);
  cursor: pointer;
}

.site-resource-item:hover {
  background: var(--app-grouped-list-hover-background);
  box-shadow: var(--app-surface-hover-shadow);
}

.site-resource-item__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
}

.site-resource-item__main {
  overflow: hidden;
  min-inline-size: 0;
}

.site-resource-item__title,
.site-resource-item__description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.site-resource-item__title {
  max-block-size: 2.76em;
  line-height: 1.38;
}

.site-resource-item__description {
  max-block-size: 2.7em;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  line-height: 1.35;
}

.site-resource-item__chips {
  display: flex;
  overflow: hidden;
  flex-wrap: wrap;
  gap: 0.35rem;
  max-block-size: 4rem;
}

.site-resource-item__chips :deep(.v-chip) {
  max-inline-size: 100%;
}

.site-resource-item__chips :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-resource-more-btn {
  color: rgb(var(--v-theme-on-surface));
}

.site-resource-more-menu {
  min-inline-size: 0;
}

.site-resource-menu {
  min-inline-size: 12rem;
  border: var(--app-grouped-list-border);
  border-radius: var(--app-grouped-list-radius);
  background: var(--app-grouped-list-background);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  box-shadow: var(--app-surface-shadow);
}

.site-resource-item__metrics {
  display: grid;
  align-items: stretch;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-column: 1 / -1;
  margin-block-start: 0.75rem;
  border-block-start: 1px solid var(--app-grouped-list-separator-color);
}

.site-resource-metric {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-inline-size: 0;
  padding: 0.45rem 0.55rem 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.site-resource-metric + .site-resource-metric {
  border-inline-start: 1px solid var(--app-grouped-list-separator-color);
}

.site-resource-metric--success {
  color: rgb(var(--v-theme-success));
}

.site-resource-metric--info {
  color: rgb(var(--v-theme-info));
}

.site-resource-metric__copy {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-inline-size: 0;
  line-height: 1.25;
}

.site-resource-metric__value,
.site-resource-metric__caption {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-resource-metric__value {
  color: currentcolor;
  font-size: 0.82rem;
  font-weight: 600;
}

.site-resource-metric__caption {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
}

.site-resource-load-state,
.site-resource-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}

.site-resource-load-state {
  gap: 0.45rem;
  padding: 0.9rem 0 0.25rem;
}

@media (width >= 960px) {
  .site-resource-dialog {
    block-size: min(88vh, 960px);
  }

  .site-resource-item__metrics {
    align-self: stretch;
    grid-column: 3;
    margin-block-start: 0;
    border-block-start: 0;
    border-inline-start: 1px solid var(--app-grouped-list-separator-color);
  }

  .site-resource-item__layout {
    // 统计区按卡片宽度统一占比，避免各行内容长度改变竖向分隔线位置。
    grid-template-columns: minmax(0, 1fr) auto minmax(26rem, 46%);
    gap: 1rem;
  }

  .site-resource-item__main {
    grid-column: 1;
  }

  .site-resource-more-menu {
    grid-column: 2;
    align-self: start;
  }

  .site-resource-more-btn {
    align-self: start;
  }

  .site-resource-metric {
    padding: 0 0.9rem;
  }

  .site-resource-metric + .site-resource-metric {
    border-inline-start: 1px solid var(--app-grouped-list-separator-color);
  }
}

@media (width <= 959px) {
  .site-resource-dialog {
    border-radius: 0;
  }

  .site-resource-filter-row > .site-resource-filter-cell {
    padding: 0;
  }

  .site-resource-filter-row > .site-resource-filter-cell + .site-resource-filter-cell {
    padding-block-start: 0.55rem;
  }

  .site-resource-filter-cell--action {
    padding-block-start: 0.15rem;
  }

  .site-resource-filter-input,
  .site-resource-sort {
    grid-template-rows: 44px !important;
    min-block-size: 0 !important;
    padding-block: 0.25rem !important;
  }

  .site-resource-filter-input {
    --app-responsive-input-control-width: 60%;
  }

  .site-resource-category-input {
    align-items: start;
    grid-template-rows: auto !important;
  }

  .site-resource-category-input :deep(.app-responsive-input__control) {
    align-items: stretch;
  }

  .site-resource-category-input :deep(.v-field),
  .site-resource-category-input :deep(.v-field__field),
  .site-resource-category-input :deep(.v-field__input) {
    block-size: auto;
    min-block-size: 2.75rem;
  }

  .site-resource-search-btn {
    min-block-size: 2.5rem;
  }

  .site-resource-summary {
    margin-block-start: 0.65rem !important;
  }

  .site-resource-sort {
    min-block-size: 0;
  }

  .site-resource-item__metrics {
    margin-inline: -0.75rem;
    padding-inline: 0.25rem;
  }

  .site-resource-metric {
    padding-inline: 0.35rem;
  }
}

@media (width <= 420px) {
  .site-resource-controls {
    padding-inline: 0.5rem !important;
  }

  .site-resource-controls--collapsed {
    padding-block: 0.35rem !important;
  }

  .site-resource-summary {
    gap: 0.5rem;
  }

  .site-resource-summary--collapsed {
    justify-content: flex-start;
    margin-block-start: 0 !important;
  }

  .site-resource-filter-toggle {
    flex: 0 0 auto;
  }

  .site-resource-summary--collapsed .site-resource-sort {
    margin-inline-start: auto;
  }

  .site-resource-sort {
    min-inline-size: 0;
  }

  .site-resource-list {
    padding-inline: 0.5rem !important;
  }

  .site-resource-item__metrics {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.95fr) minmax(2.4rem, 0.55fr) minmax(2.4rem, 0.55fr);
  }

  .site-resource-metric {
    gap: 0.2rem;
    padding-inline: 0.25rem;
  }

  .site-resource-metric__value {
    font-size: 0.74rem;
  }

  .site-resource-metric__caption {
    font-size: 0.66rem;
  }
}
</style>
