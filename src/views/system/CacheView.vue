<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { TorrentCacheData, TorrentCacheItem } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { formatFileSize, formatDateDifference } from '@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore } from '@/stores'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import RecognitionCachePanel from '@/components/cache/RecognitionCachePanel.vue'

const CacheReidentifyDialog = defineAsyncComponent(() => import('@/components/dialog/CacheReidentifyDialog.vue'))

type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'
type CacheManagerType = 'torrent' | 'recognition'

const MOBILE_CACHE_PAGE_SIZE = 20

const activeCacheType = ref<CacheManagerType>('torrent')

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()

// 显示器宽度
const display = useDisplay()
const isMobile = computed(() => display.smAndDown.value)

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 缓存数据
const cacheData = ref<TorrentCacheData>({
  count: 0,
  sites: 0,
  data: [],
})

// 筛选条件
const titleFilter = ref<string | null>(null)
const siteFilter = ref<string | null>(null)

// 获取所有站点选项
const siteOptions = computed(() => {
  const sites = new Set<string>()
  cacheData.value.data.forEach(item => {
    if (item.site_name) {
      sites.add(item.site_name)
    }
  })
  return Array.from(sites).sort()
})

// 筛选后的数据
const filteredData = computed(() => {
  return cacheData.value.data.filter(item => {
    const titleMatch = !titleFilter.value || item.title?.toLowerCase().includes(titleFilter.value?.toLowerCase())
    const siteMatch = !siteFilter.value || item.site_name === siteFilter.value
    return titleMatch && siteMatch
  })
})

// 选中的缓存项
const selectedItems = ref<string[]>([])

// 加载状态
const loading = ref(false)

const currentReidentifyItem = ref<TorrentCacheItem | null>(null)

// 移动端已经追加到虚拟列表的数据条数
const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)

let reidentifyDialogController: ReturnType<typeof openSharedDialog> | null = null

const tableStyle = computed(() => {
  return appMode ? '' : 'height: calc(100vh - 21rem - env(safe-area-inset-bottom)'
})

// 移动端虚拟列表数据
const mobileVisibleData = computed(() => filteredData.value.slice(0, mobileVisibleCount.value))

// 移动端是否还有未追加的数据页
const mobileHasMore = computed(() => mobileVisibleData.value.length < filteredData.value.length)

// 移动端无限滚动组件刷新键
const mobileInfiniteKey = ref(0)

/** 重置移动端分页，让筛选或刷新后的列表从第一页开始展示。 */
function resetMobilePagination() {
  mobileVisibleCount.value = MOBILE_CACHE_PAGE_SIZE
  mobileInfiniteKey.value++
}

/** 调用 API 加载缓存数据。 */
async function loadCacheData() {
  try {
    loading.value = true
    const res: any = await api.get('torrent/cache')
    cacheData.value = res.data
    resetMobilePagination()
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 追加移动端下一页数据，并通过虚拟滚动限制实际渲染节点数量。 */
function loadMoreMobileCache({ done }: { done: (status: InfiniteScrollStatus) => void }) {
  if (loading.value) {
    done('ok')
    return
  }

  if (!mobileHasMore.value) {
    done('empty')
    return
  }

  mobileVisibleCount.value = Math.min(mobileVisibleCount.value + MOBILE_CACHE_PAGE_SIZE, filteredData.value.length)
  done(mobileHasMore.value ? 'ok' : 'empty')
}

/** 清空所有缓存。 */
async function clearAllCache() {
  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.clearConfirm'),
  })

  if (!isConfirmed) return
  try {
    loading.value = true
    await api.delete('torrent/cache')
    $toast.success(t('setting.cache.clearSuccess'))
    await loadCacheData()
    selectedItems.value = []
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.clearFailed'))
  } finally {
    loading.value = false
  }
}

/** 刷新缓存数据。 */
async function refreshCache() {
  try {
    loading.value = true
    const res: any = await api.post('torrent/cache/refresh')
    $toast.success(res.message || t('setting.cache.refreshSuccess'))
    await loadCacheData()
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.refreshFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除桌面端表格中选中的缓存项。 */
async function deleteSelectedItems() {
  if (selectedItems.value.length === 0) {
    $toast.warning(t('setting.cache.selectDeleteWarning'))
    return
  }

  try {
    loading.value = true
    const deletePromises = selectedItems.value.map(hash => {
      const item = cacheData.value.data.find(d => d.hash === hash)
      if (item) {
        return api.delete(`torrent/cache/${item.domain}/${hash}`)
      }
      return Promise.resolve()
    })

    await Promise.all(deletePromises)
    $toast.success(t('setting.cache.deleteSelectedSuccess', { count: selectedItems.value.length }))
    await loadCacheData()
    selectedItems.value = []
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteSelectedFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除单个缓存项。 */
async function deleteSingleItem(item: TorrentCacheItem) {
  try {
    loading.value = true
    await api.delete(`torrent/cache/${item.domain}/${item.hash}`)
    $toast.success(t('setting.cache.deleteSuccess'))
    await loadCacheData()
    // 从选中列表中移除
    const index = selectedItems.value.indexOf(item.hash)
    if (index > -1) {
      selectedItems.value.splice(index, 1)
    }
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteFailed'))
  } finally {
    loading.value = false
  }
}

/** 打开重新识别对话框。 */
function openReidentifyDialog(item: TorrentCacheItem) {
  currentReidentifyItem.value = item
  reidentifyDialogController?.close()
  reidentifyDialogController = openSharedDialog(
    CacheReidentifyDialog,
    {
      itemTitle: item.title,
      loading: loading.value,
      recognizeSource: globalSettings.RECOGNIZE_SOURCE,
    },
    {
      close: () => {
        reidentifyDialogController = null
      },
      confirm: performReidentify,
      'update:modelValue': (value: boolean) => {
        if (!value) reidentifyDialogController = null
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 执行缓存项重新识别。 */
async function performReidentify(payload: { doubanId?: string; tmdbId?: number } = {}) {
  if (!currentReidentifyItem.value) return

  try {
    loading.value = true
    reidentifyDialogController?.updateProps({ loading: true })
    const params: any = {}
    if (payload.tmdbId) params.tmdbid = payload.tmdbId
    if (payload.doubanId) params.doubanid = payload.doubanId

    const res: any = await api.post(
      `torrent/cache/reidentify/${currentReidentifyItem.value.domain}/${currentReidentifyItem.value.hash}`,
      null,
      {
        params,
      },
    )

    $toast.success(res.message || t('setting.cache.reidentifySuccess'))
    await loadCacheData()
    reidentifyDialogController?.close()
    reidentifyDialogController = null
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.reidentifyFailed'))
  } finally {
    loading.value = false
    reidentifyDialogController?.updateProps({ loading: false })
  }
}

/** 获取媒体类型对应的主题颜色。 */
function getMediaTypeColor(type: string): string {
  switch (type) {
    case 'movie':
    case t('setting.cache.mediaType.movie'):
      return 'primary'
    case 'tv':
    case t('setting.cache.mediaType.tv'):
      return 'success'
    default:
      return 'default'
  }
}

/** 获取移动端类型角标使用的 MediaCard 同款颜色类。 */
function getMobileMediaTypeChipClass(type: string): string {
  switch (type) {
    case 'movie':
    case t('setting.cache.mediaType.movie'):
      return 'border-blue-500 bg-blue-600'
    case 'tv':
    case t('setting.cache.mediaType.tv'):
      return 'bg-indigo-500 border-indigo-600'
    default:
      return 'border-purple-600 bg-purple-600'
  }
}

/** 生成移动端缓存卡片的稳定渲染键。 */
function getMobileCacheItemKey(item: TorrentCacheItem, index: number): string {
  return item.hash || [item.domain, item.title, index].join('-')
}

/** 获取移动端缓存卡片使用的媒体标题。 */
function getMobileMediaTitle(item: TorrentCacheItem): string {
  return item.media_name || item.description || t('setting.cache.unrecognized')
}

/** 获取移动端缓存卡片展示的识别补充信息。 */
function getMobileMediaMeta(item: TorrentCacheItem): string {
  return [item.media_year, item.season_episode].filter(Boolean).join(' · ')
}

/** 获取移动端缓存卡片展示的资源补充信息。 */
function getMobileResourceMeta(item: TorrentCacheItem): string {
  return [formatDateDifference(item.pubdate || ''), item.resource_term, item.site_name].filter(Boolean).join(' · ')
}

/** 打开缓存项的站点详情页面。 */
function openPageUrl(url: string) {
  window.open(url, '_blank')
}

onMounted(() => {
  loadCacheData()
})

watch([titleFilter, siteFilter], () => {
  resetMobilePagination()
})
</script>

<template>
  <section class="cache-manager">
    <header class="cache-manager__header">
      <VBtnToggle
        v-model="activeCacheType"
        mandatory
        divided
        density="comfortable"
        variant="text"
        color="primary"
        class="cache-manager__switcher"
        :aria-label="t('setting.cache.cacheType')"
      >
        <VBtn value="torrent" prepend-icon="mdi-download-box-outline">
          {{ t('setting.cache.torrentCache') }}
        </VBtn>
        <VBtn value="recognition" prepend-icon="mdi-movie-search-outline">
          {{ t('setting.cache.recognitionCache') }}
        </VBtn>
      </VBtnToggle>
    </header>

    <div class="cache-manager__content">
      <RecognitionCachePanel v-if="activeCacheType === 'recognition'" />

      <template v-else>
        <section v-if="isMobile" class="cache-mobile-page">
          <div class="cache-mobile-stats">
            <div class="cache-mobile-stat cache-mobile-stat--primary">
              <VIcon icon="mdi-database" size="32" />
              <div>
                <strong>{{ cacheData.count }}</strong>
                <span>{{ t('setting.cache.totalCount') }}</span>
              </div>
            </div>

            <div class="cache-mobile-stat cache-mobile-stat--success">
              <VIcon icon="mdi-web" size="32" />
              <div>
                <strong>{{ cacheData.sites }}</strong>
                <span>{{ t('setting.cache.siteCount') }}</span>
              </div>
            </div>
          </div>

          <div class="cache-mobile-filters">
            <VTextField
              v-model="titleFilter"
              class="cache-mobile-filter"
              :placeholder="t('setting.cache.filterByTitle')"
              :aria-label="t('setting.cache.filterByTitle')"
              prepend-inner-icon="mdi-magnify"
              clearable
              density="comfortable"
              variant="outlined"
              single-line
              hide-details
            />

            <VAutocomplete
              v-model="siteFilter"
              class="cache-mobile-filter"
              :placeholder="t('setting.cache.filterBySite')"
              :aria-label="t('setting.cache.filterBySite')"
              :items="siteOptions"
              prepend-inner-icon="mdi-web"
              clearable
              density="comfortable"
              variant="outlined"
              single-line
              hide-details
            />
          </div>

          <div class="cache-mobile-actions">
            <VBtn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="refreshCache">
              {{ t('setting.cache.refresh') }}
            </VBtn>
            <VBtn
              variant="tonal"
              color="error"
              :loading="loading"
              prepend-icon="mdi-delete-variant"
              @click="clearAllCache"
            >
              {{ t('setting.cache.clearAll') }}
            </VBtn>
          </div>

          <VInfiniteScroll
            v-if="mobileVisibleData.length > 0 || loading"
            :key="mobileInfiniteKey"
            mode="intersect"
            side="end"
            :items="mobileVisibleData"
            class="cache-mobile-scroll"
            @load="loadMoreMobileCache"
          >
            <template #loading>
              <div class="cache-mobile-load-state">
                <VProgressCircular indeterminate color="primary" size="22" width="3" />
                <span>{{ t('setting.cache.loadingMore') }}</span>
              </div>
            </template>

            <template #empty />

            <ProgressiveCardGrid
              v-if="mobileVisibleData.length > 0"
              :items="mobileVisibleData"
              :columns="1"
              :gap="12"
              :estimated-item-height="168"
              :overscan-rows="5"
              :get-item-key="getMobileCacheItemKey"
            >
              <template #default="{ item }">
                <article class="cache-mobile-card">
                  <div class="cache-mobile-card__poster">
                    <VChip
                      v-if="item.media_type"
                      variant="elevated"
                      size="small"
                      :class="getMobileMediaTypeChipClass(item.media_type)"
                      class="cache-mobile-card__type bg-opacity-80 text-white font-bold"
                    >
                      {{
                        item.media_type === 'movie'
                          ? t('setting.cache.mediaType.movie')
                          : item.media_type === 'tv'
                            ? t('setting.cache.mediaType.tv')
                            : item.media_type
                      }}
                    </VChip>
                    <VImg
                      v-if="item.poster_path"
                      :src="item.poster_path"
                      :alt="item.media_name || item.title"
                      cover
                      class="h-100 w-100"
                    >
                      <template #placeholder>
                        <VSkeletonLoader class="h-100 w-100" />
                      </template>
                    </VImg>
                    <VIcon
                      v-else
                      :icon="item.media_type === 'movie' ? 'mdi-movie-open' : 'mdi-television-play'"
                      size="34"
                    />
                  </div>

                  <div class="cache-mobile-card__content">
                    <div class="cache-mobile-card__torrent">
                      {{ item.title }}
                    </div>

                    <div class="cache-mobile-card__main">
                      {{ getMobileMediaTitle(item) }}
                      <span v-if="getMobileMediaMeta(item)">{{ getMobileMediaMeta(item) }}</span>
                    </div>

                    <div class="cache-mobile-card__meta">
                      <span>{{ getMobileResourceMeta(item) }}</span>
                      <strong>{{ formatFileSize(item.size) }}</strong>
                    </div>
                  </div>

                  <VMenu location="bottom end">
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        v-bind="menuProps"
                        icon
                        variant="text"
                        class="cache-mobile-card__menu"
                        :aria-label="t('setting.cache.actions')"
                      >
                        <VIcon icon="mdi-dots-vertical" />
                      </VBtn>
                    </template>

                    <VList density="compact">
                      <VListItem @click="openReidentifyDialog(item)">
                        <template #prepend>
                          <VIcon icon="mdi-text-recognition" color="primary" />
                        </template>
                        <VListItemTitle>{{ t('setting.cache.reidentify') }}</VListItemTitle>
                      </VListItem>
                      <VListItem v-if="item.page_url" @click="openPageUrl(item.page_url || '')">
                        <template #prepend>
                          <VIcon icon="mdi-open-in-new" color="info" />
                        </template>
                        <VListItemTitle>{{ t('common.openInNewWindow') }}</VListItemTitle>
                      </VListItem>
                      <VListItem @click="deleteSingleItem(item)">
                        <template #prepend>
                          <VIcon icon="mdi-delete" color="error" />
                        </template>
                        <VListItemTitle>{{ t('common.delete') }}</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </article>
              </template>
            </ProgressiveCardGrid>
          </VInfiniteScroll>

          <div v-else class="cache-mobile-empty">
            <VIcon icon="mdi-database-off" size="42" />
            <span>{{ t('setting.cache.noData') }}</span>
            <small>{{ t('setting.cache.noDataHint') }}</small>
          </div>
        </section>

        <div v-else class="cache-desktop-page">
          <div class="cache-desktop-toolbar">
            <div class="cache-desktop-stats">
              <div class="cache-desktop-stat cache-desktop-stat--primary">
                <VIcon icon="mdi-database-outline" size="22" />
                <div>
                  <strong>{{ cacheData.count }}</strong>
                  <span>{{ t('setting.cache.totalCount') }}</span>
                </div>
              </div>

              <div class="cache-desktop-stat cache-desktop-stat--success">
                <VIcon icon="mdi-web" size="22" />
                <div>
                  <strong>{{ cacheData.sites }}</strong>
                  <span>{{ t('setting.cache.siteCount') }}</span>
                </div>
              </div>
            </div>

            <div class="cache-desktop-actions">
              <VBtn icon variant="text" color="primary" :loading="loading" @click="refreshCache">
                <VIcon icon="mdi-refresh" />
                <VTooltip activator="parent" location="bottom">{{ t('setting.cache.refresh') }}</VTooltip>
              </VBtn>

              <VBtn
                icon
                variant="text"
                color="warning"
                :loading="loading"
                :disabled="selectedItems.length === 0"
                @click="deleteSelectedItems"
              >
                <VIcon icon="mdi-delete-sweep-outline" />
                <VTooltip activator="parent" location="bottom">
                  {{ t('setting.cache.deleteSelected') }} ({{ selectedItems.length }})
                </VTooltip>
              </VBtn>

              <VBtn icon variant="text" color="error" :loading="loading" @click="clearAllCache">
                <VIcon icon="mdi-delete-variant" />
                <VTooltip activator="parent" location="bottom">{{ t('setting.cache.clearAll') }}</VTooltip>
              </VBtn>
            </div>
          </div>

          <!-- 筛选框 -->
          <VRow class="cache-desktop-filters">
            <VCol cols="6">
              <VTextField
                v-model="titleFilter"
                :label="t('setting.cache.filterByTitle')"
                prepend-inner-icon="mdi-magnify"
                clearable
                density="compact"
                variant="outlined"
                hide-details
              />
            </VCol>
            <VCol cols="6">
              <VAutocomplete
                v-model="siteFilter"
                :label="t('setting.cache.filterBySite')"
                :items="siteOptions"
                prepend-inner-icon="mdi-web"
                clearable
                density="compact"
                variant="outlined"
                hide-details
                :placeholder="t('setting.cache.selectSite')"
              />
            </VCol>
          </VRow>

          <!-- 缓存列表 -->
          <VDataTable
            v-model="selectedItems"
            :headers="[
              { title: '', key: 'data-table-select', sortable: false, width: '48px' },
              { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '80px' },
              { title: t('setting.cache.torrentTitle'), key: 'title', sortable: true },
              { title: t('setting.cache.site'), key: 'site_name', sortable: true, width: '120px' },
              { title: t('setting.cache.size'), key: 'size', sortable: true, width: '100px' },
              { title: t('setting.cache.publishTime'), key: 'pubdate', sortable: true, width: '150px' },
              { title: t('setting.cache.recognitionResult'), key: 'media_info', sortable: false, width: '200px' },
              { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '150px' },
            ]"
            :items="filteredData"
            :loading="loading"
            item-value="hash"
            show-select
            hover
            fixed-header
            :items-per-page-text="t('common.itemsPerPage')"
            :no-data-text="t('common.noDataText')"
            :loading-text="t('common.loadingText')"
            :style="tableStyle"
          >
            <!-- 全选复选框 -->
            <template #header.data-table-select="{ allSelected, selectAll, someSelected }">
              <VCheckbox
                :indeterminate="someSelected && !allSelected"
                :model-value="allSelected"
                @update:model-value="(value: boolean | null) => selectAll(value as boolean)"
              />
            </template>

            <!-- 海报列 -->
            <template #item.poster="{ item }">
              <div class="text-center">
                <VImg
                  v-if="item.poster_path"
                  :src="item.poster_path"
                  :alt="item.media_name || item.title"
                  cover
                  rounded="md"
                  class="w-12 my-1 ms-auto"
                />
                <VIcon v-else size="x-large" color="grey-lighten-1">
                  {{ item.media_type === 'movie' ? 'mdi-movie-open' : 'mdi-television-play' }}
                </VIcon>
              </div>
            </template>

            <!-- 标题列 -->
            <template #item.title="{ item }">
              <div class="d-flex flex-column min-w-40">
                <div class="text-subtitle-2 font-weight-bold">
                  {{ item.title }}
                </div>
                <div v-if="item.description" class="text-caption text-grey">
                  {{ item.description }}
                </div>
                <div v-if="item.season_episode || item.resource_term" class="text-caption text-primary mt-1">
                  {{ item.season_episode }} {{ item.resource_term }}
                </div>
              </div>
            </template>

            <!-- 大小列 -->
            <template #item.size="{ item }">
              {{ formatFileSize(item.size) }}
            </template>

            <!-- 发布时间列 -->
            <template #item.pubdate="{ item }">
              {{ formatDateDifference(item.pubdate || '') }}
            </template>

            <!-- 识别结果列 -->
            <template #item.media_info="{ item }">
              <div v-if="item.media_name" class="d-flex flex-column">
                <div class="text-subtitle-2">
                  {{ item.media_name }}
                  <span v-if="item.media_year" class="text-caption text-grey"> ({{ item.media_year }}) </span>
                </div>
                <div>
                  <VChip v-if="item.media_type" :color="getMediaTypeColor(item.media_type)" size="x-small">
                    {{ item.media_type }}
                  </VChip>
                </div>
              </div>
              <div v-else class="text-caption text-grey">
                {{ t('setting.cache.unrecognized') }}
              </div>
            </template>

            <!-- 操作列 -->
            <template #item.actions="{ item }">
              <div class="d-flex gap-1">
                <VBtn icon size="small" color="primary" variant="text" @click="openReidentifyDialog(item)">
                  <VIcon size="16">mdi-text-recognition</VIcon>
                </VBtn>

                <VBtn icon size="small" color="error" variant="text" @click="deleteSingleItem(item)">
                  <VIcon size="16">mdi-delete</VIcon>
                </VBtn>

                <VBtn
                  v-if="item.page_url"
                  icon
                  size="small"
                  color="info"
                  variant="text"
                  @click="openPageUrl(item.page_url || '')"
                  target="_blank"
                >
                  <VIcon size="16">mdi-open-in-new</VIcon>
                </VBtn>
              </div>
            </template>

            <!-- 空状态 -->
            <template #no-data>
              <div class="text-center pa-4">
                <VIcon size="64" class="mb-4"> mdi-database-off </VIcon>
                <div class="text-body-2 text-grey">
                  {{ t('setting.cache.noData') }}
                </div>
              </div>
            </template>
          </VDataTable>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.cache-manager {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  inline-size: 100%;
  min-block-size: 0;
}

.cache-manager__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-block-end: var(--app-surface-border);
  padding-block: 12px;
  padding-inline: 20px;
}

.cache-manager__switcher {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-control-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
}

.cache-manager__switcher :deep(.v-btn) {
  min-inline-size: 180px;
}

.cache-manager__switcher :deep(.v-btn__content) {
  overflow-wrap: anywhere;
  white-space: normal;
}

.cache-manager__content {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.cache-desktop-page {
  padding: 20px;
}

.cache-desktop-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cache-desktop-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cache-desktop-stat {
  display: flex;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
  gap: 10px;
  min-block-size: 58px;
  min-inline-size: 126px;
  padding-block: 10px;
  padding-inline: 14px;
}

.cache-desktop-stat strong,
.cache-desktop-stat span {
  display: block;
}

.cache-desktop-stat strong {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 18px;
  line-height: 1.15;
}

.cache-desktop-stat span {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  margin-block-start: 3px;
}

.cache-desktop-stat--primary {
  color: rgb(var(--v-theme-primary));
}

.cache-desktop-stat--success {
  color: rgb(var(--v-theme-success));
}

.cache-desktop-actions {
  display: flex;
  gap: 2px;
}

.cache-desktop-filters {
  margin-block: 16px;
}

.cache-desktop-filters :deep(.v-field) {
  border-radius: var(--app-field-radius);
  background: var(--app-grouped-list-background);
}

.cache-desktop-page :deep(.v-data-table) {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  box-shadow: var(--app-surface-shadow);
}

@media (width <= 959.98px) {
  .cache-manager__header {
    padding-inline: 16px;
  }

  .cache-manager__switcher {
    inline-size: 100%;
  }

  .cache-manager__switcher :deep(.v-btn) {
    flex: 1 1 0;
    align-items: center;
    block-size: auto;
    min-inline-size: 0;
    padding-block: 6px;
    padding-inline: 10px;
  }

  .cache-manager__switcher :deep(.v-btn__prepend),
  .cache-manager__switcher :deep(.v-btn__content) {
    align-self: center;
  }

  .cache-manager__switcher :deep(.v-btn__content) {
    display: flex;
    align-items: center;
    line-height: 1.25;
  }
}

.cache-mobile-page {
  --cache-mobile-control-bg: var(--app-grouped-list-background);
  --cache-mobile-page-bg: transparent;
  --cache-mobile-surface-bg: var(--app-grouped-list-background);
  --cache-mobile-surface-blur: var(--app-grouped-list-backdrop-filter);

  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  background: var(--cache-mobile-page-bg);
  block-size: 100%;
  gap: 16px;
  inline-size: 100%;
  min-block-size: 0;
  overflow-y: auto;
  padding-block: 14px calc(18px + env(safe-area-inset-bottom));
  padding-inline: 16px;
}

.cache-mobile-stats {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cache-mobile-stat {
  display: flex;
  align-items: center;
  padding: 18px;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--cache-mobile-surface-blur);
  background: var(--cache-mobile-surface-bg);
  box-shadow: var(--app-surface-shadow);
  gap: 14px;
  min-block-size: 92px;
}

.cache-mobile-stat strong {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.05;
}

.cache-mobile-stat span {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 14px;
  font-weight: 600;
  margin-block-start: 8px;
}

.cache-mobile-stat--primary {
  color: rgb(var(--v-theme-primary));
}

.cache-mobile-stat--success {
  color: rgb(var(--v-theme-success));
}

.cache-mobile-filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cache-mobile-filter :deep(.v-field) {
  border-radius: var(--app-field-radius);
  backdrop-filter: var(--cache-mobile-surface-blur);
  background: var(--cache-mobile-control-bg);
  box-shadow: var(--app-surface-shadow);
}

.cache-mobile-filter :deep(.v-field__outline) {
  color: rgba(var(--v-theme-on-surface), 0.18);
}

.cache-mobile-filter :deep(.v-field__input) {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 16px;
  min-block-size: 54px;
}

.cache-mobile-actions {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cache-mobile-actions :deep(.v-btn) {
  min-block-size: 44px;
}

.cache-mobile-scroll {
  overflow: visible !important;
  min-block-size: 20rem;
}

.cache-mobile-scroll :deep(.v-infinite-scroll__container),
.cache-mobile-scroll :deep(.progressive-card-grid),
.cache-mobile-scroll :deep(.progressive-card-grid__track) {
  overflow: visible !important;
}

.cache-mobile-scroll :deep(.v-infinite-scroll__side) {
  padding-block: 14px 2px;
}

.cache-mobile-card {
  position: relative;
  display: grid;
  overflow: visible;
  align-items: start;
  padding: 14px;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--cache-mobile-surface-blur);
  background: var(--cache-mobile-surface-bg);
  box-shadow: var(--app-surface-shadow);
  gap: 14px;
  grid-template-columns: 72px minmax(0, 1fr);
}

.cache-mobile-card__poster {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.06);
  block-size: 104px;
  color: rgba(var(--v-theme-on-surface), 0.34);
  inline-size: 72px;
}

.cache-mobile-card__type {
  position: absolute;
  z-index: 1;
  inset-block-end: 5px;
  inset-inline-start: 50%;
  transform: translateX(-50%);
}

.cache-mobile-card__content {
  min-inline-size: 0;
}

.cache-mobile-card__torrent {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
  padding-inline-end: 34px;
  white-space: normal;
  word-break: break-word;
}

.cache-mobile-card__main {
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.32;
  margin-block-start: 6px;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.cache-mobile-card__main span {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 14px;
  font-weight: 500;
  margin-inline-start: 6px;
}

.cache-mobile-card__meta {
  display: grid;
  align-items: end;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 14px;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  line-height: 1.35;
  margin-block-start: 8px;
}

.cache-mobile-card__meta span {
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.cache-mobile-card__meta strong {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 14px;
  font-weight: 700;
  text-align: end;
  white-space: nowrap;
}

.cache-mobile-card__menu {
  position: absolute;
  color: rgba(var(--v-theme-on-surface), 0.5);
  inset-block-start: 8px;
  inset-inline-end: 8px;
}

.cache-mobile-load-state,
.cache-mobile-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  text-align: center;
}

.cache-mobile-load-state {
  flex-direction: column;
  font-size: 15px;
  font-weight: 700;
  gap: 8px;
  min-block-size: 70px;
}

.cache-mobile-empty {
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-block-size: 16rem;
}

.cache-mobile-empty span {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 16px;
  font-weight: 700;
}

.cache-mobile-empty small {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 13px;
}

@media (width <= 374.98px) {
  .cache-manager__header {
    padding-inline: 12px;
  }

  .cache-mobile-page {
    padding-inline: 12px;
  }

  .cache-mobile-card {
    padding: 12px;
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .cache-mobile-card__poster {
    block-size: 96px;
    inline-size: 64px;
  }
}
</style>
