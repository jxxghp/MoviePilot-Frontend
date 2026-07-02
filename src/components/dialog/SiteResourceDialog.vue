<script setup lang="ts">
import api from '@/api'
import type { Site, TorrentInfo, SiteCategory } from '@/api/types'
import { formatFileSize } from '@core/utils/formatters'
import { useDisplay, useTheme } from 'vuetify'
import AddDownloadDialog from '../dialog/AddDownloadDialog.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t, locale } = useI18n()

// 响应式断点
const display = useDisplay()

// 当前主题
const theme = useTheme()

// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
})

// 关键字
const keyword = ref<string>()

// 选择分类
const selectCategory = ref<number[]>([])

// 全部分类
const siteCategoryList = ref<SiteCategory[]>()

// 注册事件
const emit = defineEmits(['close'])

// 数据列表
const resourceDataList = ref<TorrentInfo[]>([])

// 每页条数
const resourceItemsPerPage = ref(25)

// 当前页
const resourcePage = ref(1)

// 加载状态
const resourceLoading = ref(false)

// 移动端搜索栏是否展开
const mobileSearchExpanded = ref(false)

// 种子元数据
const torrent = ref<TorrentInfo>()

// 添加下载对话框
const addDownloadDialog = ref(false)

// 分类选项
const categoryOptions = computed(() => {
  return siteCategoryList.value?.map(item => {
    return { title: item.desc, value: item.id }
  })
})

// 总条数
const resourceTotalItems = computed(() => resourceDataList.value.length)

// 资源浏览表头
const resourceHeaders = computed(() => [
  { title: t('dialog.siteResource.titleColumn'), key: 'title', sortable: false },
  { title: t('dialog.siteResource.timeColumn'), key: 'pubdate', sortable: true },
  { title: t('dialog.siteResource.sizeColumn'), key: 'size', sortable: true },
  { title: t('dialog.siteResource.seedersColumn'), key: 'seeders', sortable: true },
  { title: t('dialog.siteResource.peersColumn'), key: 'peers', sortable: true },
  { title: '', key: 'actions', sortable: false },
])

// 输入框标签
const keywordFieldLabel = computed(() => {
  return keyword.value ? '' : t('dialog.siteResource.searchKeyword')
})

const categoryFieldLabel = computed(() => {
  return selectCategory.value.length > 0 ? '' : t('dialog.siteResource.resourceCategory')
})

// 结果统计文案
const resultSummaryText = computed(() => {
  if (locale.value.startsWith('zh')) {
    return `共 ${resourceTotalItems.value} 条结果`
  }

  return `${resourceTotalItems.value} results`
})

// 是否小屏幕
const isMobileLayout = computed(() => display.smAndDown.value)

// 是否透明主题
const isTransparentTheme = computed(() => theme.name.value === 'transparent')

// 移动端分页数据
const mobileResourceList = computed(() => resourceDataList.value)

// 获取资源项唯一标识
function getResourceItemKey(item: TorrentInfo, index: number) {
  return item.page_url || item.enclosure || `${item.title}-${item.pubdate || ''}-${index}`
}

// 打开种子详情页面
function openTorrentDetail(page_url: string) {
  if (!page_url) return
  window.open(page_url, '_blank')
}

// 下载种子文件
async function downloadTorrentFile(enclosure: string) {
  if (!enclosure) return
  window.open(enclosure, '_blank')
}

// 促销Chip类
function getVolumeFactorClass(downloadVolume: number, uploadVolume: number) {
  if (downloadVolume === 0) return 'text-white bg-lime-500'
  if (downloadVolume < 1) return 'text-white bg-green-500'
  if (uploadVolume !== 1) return 'text-white bg-sky-500'

  return 'text-white bg-gray-500'
}

// 添加下载
async function addDownload(_torrent: TorrentInfo) {
  torrent.value = _torrent
  addDownloadDialog.value = true
}

// 添加下载成功
function addDownloadSuccess(_url: string) {
  addDownloadDialog.value = false
}

// 添加下载失败
function addDownloadError(_error: string) {
  addDownloadDialog.value = false
}

// 调用API，查询站点资源
async function getResourceList() {
  resourceLoading.value = true
  resourcePage.value = 1

  try {
    resourceDataList.value = await api.get(`site/resource/${props.site?.id}`, {
      params: {
        keyword: keyword.value,
        cat: selectCategory.value?.join(','),
      },
    })
  } catch (error) {
    console.error(error)
  }

  resourceLoading.value = false

  if (isMobileLayout.value) {
    mobileSearchExpanded.value = false
  }
}

// 加载站点分类
async function getSiteCategoryList() {
  try {
    siteCategoryList.value = await api.get(`site/category/${props.site?.id}`)
  } catch (error) {
    console.error(error)
  }
}

watch([resourceItemsPerPage, resourceTotalItems, () => display.mdAndUp.value], () => {
  if (display.mdAndUp.value) {
    const maxPage = Math.max(1, Math.ceil(resourceTotalItems.value / resourceItemsPerPage.value))
    if (resourcePage.value > maxPage) {
      resourcePage.value = maxPage
    }

    return
  }
})

watch(
  () => display.mdAndUp.value,
  isDesktop => {
    if (isDesktop) {
      mobileSearchExpanded.value = false
    }
  },
)

// 切换移动端搜索栏
function toggleMobileSearch() {
  mobileSearchExpanded.value = !mobileSearchExpanded.value
}

// 关闭移动端搜索栏
function closeMobileSearch() {
  mobileSearchExpanded.value = false
}

// 装载时查询站点分类和资源
onMounted(() => {
  getSiteCategoryList()
  getResourceList()
})
</script>

<template>
  <VDialog scrollable :fullscreen="display.smAndDown.value" max-width="92rem" transition="dialog-bottom-transition">
    <VCard class="site-resource-dialog">
      <div>
        <VToolbar color="primary" density="comfortable">
          <VToolbarTitle>{{ t('dialog.siteResource.browseTitle', { name: props.site?.name }) }}</VToolbarTitle>
          <VSpacer />
          <VToolbarItems>
            <VBtn icon @click="emit('close')" class="me-3">
              <VIcon size="large" color="white" icon="ri-close-line" />
            </VBtn>
          </VToolbarItems>
        </VToolbar>
      </div>

      <div class="pa-3 pb-2">
        <template v-if="!isMobileLayout">
          <VSheet class="site-resource-filter-panel">
            <div class="site-resource-filter-panel__inner">
              <VRow class="site-resource-filter-row">
                <VCol cols="12" md="4">
                  <VTextField
                    v-model="keyword"
                    class="site-resource-filter-input"
                    size="small"
                    density="compact"
                    variant="solo-filled"
                    flat
                    :label="keywordFieldLabel"
                    clearable
                    prepend-inner-icon="mdi-magnify"
                    hide-details
                    @keyup.enter="getResourceList"
                  />
                </VCol>
                <VCol cols="12" md="5">
                  <VSelect
                    v-model="selectCategory"
                    :items="categoryOptions"
                    class="site-resource-filter-input"
                    size="small"
                    density="compact"
                    variant="solo-filled"
                    flat
                    chips
                    :label="categoryFieldLabel"
                    multiple
                    clearable
                    prepend-inner-icon="mdi-folder"
                    hide-details
                  />
                </VCol>
                <VCol cols="12" md="3" class="d-flex align-center">
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

              <div
                v-if="resourceTotalItems > 0"
                class="d-flex justify-space-between align-center flex-wrap gap-2 mt-3"
              >
                <div class="text-body-2 text-medium-emphasis">
                  {{ resultSummaryText }}
                </div>
                <VChip size="small" color="primary" variant="tonal" class="site-resource-result-chip">
                  {{ resourceTotalItems }}
                </VChip>
              </div>
            </div>
          </VSheet>
        </template>

        <template v-else>
          <div class="site-resource-mobile-search">
            <VBtn
              icon
              variant="text"
              color="primary"
              class="site-resource-mobile-search__toggle"
              @click="toggleMobileSearch"
            >
              <VIcon icon="mdi-magnify" />
            </VBtn>
            <div v-if="resourceTotalItems > 0" class="text-body-2 text-medium-emphasis">
              {{ resultSummaryText }}
            </div>
          </div>

          <VExpandTransition>
            <div v-if="mobileSearchExpanded" class="mt-2">
              <VSheet class="site-resource-filter-panel">
                <div class="site-resource-filter-panel__inner">
                  <VRow class="site-resource-filter-row">
                    <VCol cols="12">
                      <VTextField
                        v-model="keyword"
                        class="site-resource-filter-input"
                        size="small"
                        density="compact"
                        variant="solo-filled"
                        flat
                        :label="keywordFieldLabel"
                        clearable
                        prepend-inner-icon="mdi-magnify"
                        hide-details
                        autofocus
                        @keyup.enter="getResourceList"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VSelect
                        v-model="selectCategory"
                        :items="categoryOptions"
                        class="site-resource-filter-input"
                        size="small"
                        density="compact"
                        variant="solo-filled"
                        flat
                        chips
                        :label="categoryFieldLabel"
                        multiple
                        clearable
                        prepend-inner-icon="mdi-folder"
                        hide-details
                      />
                    </VCol>
                    <VCol cols="12" class="d-flex gap-2">
                      <VBtn color="primary" variant="flat" block rounded="lg" class="site-resource-search-btn" @click="getResourceList">
                        {{ t('dialog.siteResource.search') }}
                      </VBtn>
                      <VBtn variant="text" rounded="lg" @click="closeMobileSearch">
                        {{ t('common.cancel') }}
                      </VBtn>
                    </VCol>
                  </VRow>
                </div>
              </VSheet>
            </div>
          </VExpandTransition>
        </template>
      </div>

      <VCardText class="site-resource-content px-0 py-0 my-0">
        <VDataTable
          v-if="display.mdAndUp.value"
          v-model:page="resourcePage"
          v-model:items-per-page="resourceItemsPerPage"
          :headers="resourceHeaders"
          :items="resourceDataList"
          :items-length="resourceTotalItems"
          :loading="resourceLoading"
          density="compact"
          item-value="title"
          return-object
          fixed-header
          hover
          :items-per-page-text="t('dialog.siteResource.itemsPerPage')"
          :loading-text="t('dialog.siteResource.loading')"
          :items-per-page-options="[10, 25, 50, 100]"
          height="100%"
          class="h-full site-resource-table"
        >
          <template #item.title="{ item }">
            <button type="button" class="site-resource-title-btn text-start" @click.stop="addDownload(item)">
              <div class="text-high-emphasis pt-1 font-weight-medium">
                {{ item.title }}
              </div>
              <div v-if="item.description" class="text-sm my-1 text-medium-emphasis">
                {{ item.description }}
              </div>
              <div class="mt-2">
                <VChip v-if="item.hit_and_run" variant="elevated" size="small" class="me-1 mb-1 text-white bg-black">
                  H&amp;R
                </VChip>
                <VChip v-if="item.freedate_diff" variant="elevated" color="secondary" size="small" class="me-1 mb-1">
                  {{ item.freedate_diff }}
                </VChip>
                <VChip
                  v-for="(label, index) in item.labels"
                  :key="index"
                  variant="elevated"
                  size="small"
                  color="primary"
                  class="me-1 mb-1"
                >
                  {{ label }}
                </VChip>
                <VChip
                  v-if="item.downloadvolumefactor !== 1 || item.uploadvolumefactor !== 1"
                  :class="getVolumeFactorClass(item.downloadvolumefactor, item.uploadvolumefactor)"
                  variant="elevated"
                  size="small"
                  class="me-1 mb-1"
                >
                  {{ item.volume_factor }}
                </VChip>
              </div>
            </button>
          </template>

          <template #item.pubdate="{ item }">
            <div>{{ item.date_elapsed }}</div>
            <div class="text-sm text-medium-emphasis">
              {{ item.pubdate }}
            </div>
          </template>

          <template #item.size="{ item }">
            <div class="text-nowrap whitespace-nowrap">
              {{ formatFileSize(item.size) }}
            </div>
          </template>

          <template #item.seeders="{ item }">
            <div>{{ item.seeders }}</div>
          </template>

          <template #item.peers="{ item }">
            <div>{{ item.peers }}</div>
          </template>

          <template #item.actions="{ item }">
            <div class="me-n3">
              <IconBtn>
                <VIcon icon="mdi-dots-vertical" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem @click="openTorrentDetail(item.page_url || '')">
                      <template #prepend>
                        <VIcon icon="mdi-information" />
                      </template>
                      <VListItemTitle>{{ t('dialog.siteResource.viewDetails') }}</VListItemTitle>
                    </VListItem>
                    <VListItem v-if="item.enclosure?.startsWith('http')" @click="downloadTorrentFile(item.enclosure)">
                      <template #prepend>
                        <VIcon icon="mdi-download" />
                      </template>
                      <VListItemTitle>{{ t('dialog.siteResource.downloadTorrent') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </template>

          <template #no-data>{{ t('dialog.siteResource.noData') }}</template>
        </VDataTable>

        <div v-else class="site-resource-mobile">
          <div v-if="resourceLoading" class="px-4 py-6">
            <VProgressLinear color="primary" indeterminate rounded />
            <div class="text-center text-body-2 text-medium-emphasis mt-3">
              {{ t('dialog.siteResource.loading') }}
            </div>
          </div>

          <div v-else-if="mobileResourceList.length > 0" class="site-resource-mobile__list px-3 pb-4">
            <ProgressiveCardGrid
              :items="mobileResourceList"
              :columns="1"
              :gap="12"
              :estimated-item-height="220"
              :overscan-rows="5"
              :get-item-key="getResourceItemKey"
            >
              <template #default="{ item }">
                <VCard
                  class="site-resource-card"
                  :class="{ 'site-resource-card--transparent': isTransparentTheme }"
                  variant="flat"
                >
                  <VCardText class="pa-3">
                    <button type="button" class="site-resource-title-btn text-start" @click="addDownload(item)">
                      <div class="site-resource-card__title text-body-1 font-weight-medium text-high-emphasis">
                        {{ item.title }}
                      </div>
                      <div
                        v-if="item.description"
                        class="site-resource-card__description mt-1 text-body-2 text-medium-emphasis"
                      >
                        {{ item.description }}
                      </div>
                    </button>

                    <div class="site-resource-card__chips mt-2">
                      <VChip
                        v-if="item.hit_and_run"
                        variant="elevated"
                        size="small"
                        class="me-1 mb-1 text-white bg-black"
                      >
                        H&amp;R
                      </VChip>
                      <VChip
                        v-if="item.freedate_diff"
                        variant="elevated"
                        color="secondary"
                        size="small"
                        class="me-1 mb-1"
                      >
                        {{ item.freedate_diff }}
                      </VChip>
                      <VChip
                        v-for="(label, chipIndex) in item.labels"
                        :key="chipIndex"
                        variant="elevated"
                        size="small"
                        color="primary"
                        class="me-1 mb-1"
                      >
                        {{ label }}
                      </VChip>
                      <VChip
                        v-if="item.downloadvolumefactor !== 1 || item.uploadvolumefactor !== 1"
                        :class="getVolumeFactorClass(item.downloadvolumefactor, item.uploadvolumefactor)"
                        variant="elevated"
                        size="small"
                        class="me-1 mb-1"
                      >
                        {{ item.volume_factor }}
                      </VChip>
                    </div>

                    <!-- 移动端在操作区前展示关键资源指标，方便点击前快速判断。 -->
                    <div class="site-resource-card__summary mt-3">
                      <div class="site-resource-card__stat">
                        <VIcon icon="mdi-clock-outline" size="15" />
                        <span>{{ item.date_elapsed || item.pubdate || '-' }}</span>
                      </div>
                      <div class="site-resource-card__stat">
                        <VIcon icon="mdi-harddisk" size="15" />
                        <span>{{ formatFileSize(item.size) }}</span>
                      </div>
                      <div class="site-resource-card__stat site-resource-card__stat--success">
                        <VIcon icon="mdi-arrow-up" size="15" />
                        <span>{{ item.seeders ?? '-' }}</span>
                      </div>
                      <div class="site-resource-card__stat site-resource-card__stat--warning">
                        <VIcon icon="mdi-arrow-down" size="15" />
                        <span>{{ item.peers ?? '-' }}</span>
                      </div>
                    </div>

                    <!-- 下载保留文本，其它低频操作改为图标按钮并保持同一行。 -->
                    <div class="site-resource-card__actions mt-2">
                      <VBtn
                        color="primary"
                        variant="flat"
                        class="site-resource-card__download-btn"
                        prepend-icon="mdi-download"
                        @click="addDownload(item)"
                      >
                        {{ t('actionStep.addDownload') }}
                      </VBtn>
                      <VTooltip :text="t('common.viewDetails')" location="top">
                        <template #activator="{ props: tooltipProps }">
                          <VBtn
                            v-bind="tooltipProps"
                            icon
                            variant="tonal"
                            color="primary"
                            class="site-resource-card__icon-btn"
                            :aria-label="t('common.viewDetails')"
                            @click="openTorrentDetail(item.page_url || '')"
                          >
                            <VIcon icon="mdi-open-in-new" />
                          </VBtn>
                        </template>
                      </VTooltip>
                      <VTooltip
                        v-if="item.enclosure?.startsWith('http')"
                        :text="t('dialog.siteResource.downloadTorrent')"
                        location="top"
                      >
                        <template #activator="{ props: tooltipProps }">
                          <VBtn
                            v-bind="tooltipProps"
                            icon
                            variant="tonal"
                            color="primary"
                            class="site-resource-card__icon-btn"
                            :aria-label="t('dialog.siteResource.downloadTorrent')"
                            @click="downloadTorrentFile(item.enclosure)"
                          >
                            <VIcon icon="mdi-file-download-outline" />
                          </VBtn>
                        </template>
                      </VTooltip>
                      <VBtn
                        v-else
                        icon
                        variant="tonal"
                        color="primary"
                        disabled
                        class="site-resource-card__icon-btn"
                        :aria-label="t('dialog.siteResource.downloadTorrent')"
                      >
                        <VIcon icon="mdi-file-download-outline" />
                      </VBtn>
                    </div>
                  </VCardText>
                </VCard>
              </template>
            </ProgressiveCardGrid>
          </div>

          <div v-else class="px-4 py-10 text-center text-medium-emphasis">
            {{ t('dialog.siteResource.noData') }}
          </div>
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
  flex-direction: column;
  overflow: hidden;
}

.site-resource-filter-row {
  align-items: center;
}

.site-resource-filter-panel {
  background:
    radial-gradient(circle at top left, rgba(var(--v-theme-primary), 0.06), transparent 40%),
    linear-gradient(180deg, rgba(var(--v-theme-surface), 0.98), rgba(var(--v-theme-surface), 0.93));
}

.site-resource-filter-panel__inner {
  padding: 0.75rem 0.85rem;
}

.site-resource-filter-input :deep(.v-field) {
  border-radius: var(--app-field-radius);
  background: rgba(var(--v-theme-surface), 0.92);
  box-shadow: inset 0 0 0 1px rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.8));
}

.site-resource-filter-input :deep(.v-field__prepend-inner) {
  color: rgba(var(--v-theme-primary), 0.85);
}

.site-resource-search-btn {
  box-shadow: 0 8px 18px rgba(var(--v-theme-primary), 0.18);
  letter-spacing: 0.02em;
  min-block-size: 40px;
}

.site-resource-result-chip {
  font-weight: 600;
}

.site-resource-mobile-search {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.site-resource-mobile-search__toggle {
  flex: 0 0 auto;
}

.site-resource-title-btn {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  inline-size: 100%;
}

.site-resource-content {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: hidden;
}

.site-resource-table {
  block-size: 100%;
}

.site-resource-table :deep(.v-data-table) {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.site-resource-table :deep(.v-data-table__wrapper) {
  flex: 1 1 auto;
  min-block-size: 0;
}

.site-resource-table :deep(.v-table__wrapper) {
  flex: 1 1 auto;
  min-block-size: 0;
}

.site-resource-table :deep(.v-data-table-footer) {
  flex: 0 0 auto;
}

.site-resource-mobile {
  overflow-y: auto;
  block-size: 100%;
}

.site-resource-mobile__list {
  min-block-size: 100%;
}

.v-table th {
  white-space: nowrap;
}

.site-resource-card {
  --site-resource-card-bg:
    linear-gradient(180deg, rgba(var(--v-theme-surface), 0.98), rgba(var(--v-theme-surface), 0.94)),
    radial-gradient(circle at top right, rgba(var(--v-theme-primary), 0.08), transparent 34%);

  border: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.9));
  background: var(--site-resource-card-bg);
}

.site-resource-card--transparent {
  --site-resource-card-bg: rgba(var(--v-theme-surface), var(--transparent-opacity));

  backdrop-filter: blur(var(--transparent-blur));
}

.site-resource-card__summary {
  display: grid;
  gap: 0.35rem;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(2.5rem, 0.62fr) minmax(2.5rem, 0.62fr);
  align-items: center;
}

.site-resource-card__stat {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  gap: 0.22rem;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1;
  min-block-size: 1.65rem;
  min-inline-size: 0;
  padding-inline: 0.4rem;
}

.site-resource-card__stat span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-resource-card__stat--success {
  color: rgb(var(--v-theme-success));
}

.site-resource-card__stat--warning {
  color: rgb(var(--v-theme-warning));
}

.site-resource-card__title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.38;
}

.site-resource-card__description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.site-resource-card__chips {
  max-block-size: 4.75rem;
  overflow: hidden;
}

.site-resource-card__actions {
  display: grid;
  gap: 0.45rem;
  grid-template-columns: minmax(0, 1fr) 2.5rem 2.5rem;
  align-items: center;
}

.site-resource-card__download-btn {
  min-block-size: 2.5rem;
  min-inline-size: 0;
  box-shadow: 0 6px 16px rgba(var(--v-theme-primary), 0.17);
}

.site-resource-card__download-btn :deep(.v-btn__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-resource-card__icon-btn {
  block-size: 2.5rem;
  inline-size: 2.5rem;
  min-inline-size: 2.5rem;
}

.site-resource-card__icon-btn :deep(.v-btn__content) {
  font-size: 1.05rem;
}

@media (width >= 960px) {
  .site-resource-dialog {
    block-size: min(88vh, 960px);
  }
}

@media (width <= 959px) {
  .site-resource-dialog {
    border-radius: 0;
  }

  .site-resource-filter-panel__inner {
    padding: 0.7rem 0.75rem;
  }

  .site-resource-mobile-search {
    min-block-size: 2.5rem;
  }
}

@media (width <= 420px) {
  .site-resource-card__summary {
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.95fr) minmax(2.3rem, 0.55fr) minmax(2.3rem, 0.55fr);
  }

  .site-resource-card__stat {
    padding-inline: 0.3rem;
  }
}
</style>
