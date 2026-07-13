<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { ApiResponse, TmdbRecognitionCacheData, TmdbRecognitionCacheItem } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

type RecognitionStatusFilter = 'all' | 'recognized' | 'unrecognized'
type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'

const MOBILE_CACHE_PAGE_SIZE = 20
const MOBILE_CACHE_ITEM_HEIGHT = 144

const { t } = useI18n()
const display = useDisplay()
const createConfirm = useConfirm()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

const isMobile = computed(() => display.smAndDown.value)
const loading = ref(false)
const searchFilter = ref('')
const statusFilter = ref<RecognitionStatusFilter>('all')
const selectedItems = ref<string[]>([])
const cacheData = ref<TmdbRecognitionCacheData>({
  count: 0,
  recognized: 0,
  unrecognized: 0,
  data: [],
})
const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)
const mobileInfiniteKey = ref(0)

const statusOptions = computed(() => [
  { title: t('setting.cache.allStatuses'), value: 'all' },
  { title: t('setting.cache.recognizedOnly'), value: 'recognized' },
  { title: t('setting.cache.unrecognizedOnly'), value: 'unrecognized' },
])

const tableHeaders = computed(() => [
  { title: '', key: 'data-table-select', sortable: false, width: '48px' },
  { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '76px' },
  { title: t('setting.cache.cacheKey'), key: 'key', sortable: true },
  { title: t('setting.cache.recognitionResult'), key: 'result', sortable: false, width: '220px' },
  { title: t('setting.cache.tmdbId'), key: 'tmdb_id', sortable: true, width: '110px' },
  { title: t('setting.cache.recognitionStatus'), key: 'status', sortable: true, width: '120px' },
  { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '72px' },
])

const filteredData = computed(() => {
  const keyword = searchFilter.value.trim().toLowerCase()
  return cacheData.value.data.filter(item => {
    const matchesKeyword =
      !keyword ||
      [item.key, item.title, item.year, String(item.tmdb_id)].some(value => value.toLowerCase().includes(keyword))
    const matchesStatus =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'recognized' ? item.tmdb_id > 0 : item.tmdb_id === 0)
    return matchesKeyword && matchesStatus
  })
})

const mobileVisibleData = computed(() => filteredData.value.slice(0, mobileVisibleCount.value))
const mobileHasMore = computed(() => mobileVisibleData.value.length < filteredData.value.length)

/** 重置移动端分页，让筛选或刷新后的识别缓存从第一页开始展示。 */
function resetMobilePagination() {
  mobileVisibleCount.value = MOBILE_CACHE_PAGE_SIZE
  mobileInfiniteKey.value++
}

/** 追加移动端下一页识别缓存，并由虚拟滚动限制实际渲染节点。 */
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

/** 加载 TheMovieDb 识别缓存列表。 */
async function loadCacheData(showSuccess = false) {
  try {
    loading.value = true
    const response = (await api.get('tmdb/cache')) as unknown as ApiResponse<TmdbRecognitionCacheData>
    cacheData.value = response.data ?? { count: 0, recognized: 0, unrecognized: 0, data: [] }
    selectedItems.value = selectedItems.value.filter(key => cacheData.value.data.some(item => item.key === key))
    resetMobilePagination()
    if (showSuccess) $toast.success(t('setting.cache.listRefreshSuccess'))
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    loading.value = false
  }
}

/** 清空全部 TheMovieDb 识别缓存。 */
async function clearAllCache() {
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.tmdbClearConfirm'),
  })
  if (!confirmed) return

  try {
    loading.value = true
    const response = (await api.delete('tmdb/cache')) as unknown as ApiResponse
    if (!response.success) throw new Error(response.message)
    $toast.success(response.message || t('setting.cache.clearSuccess'))
    await loadCacheData()
    selectedItems.value = []
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.clearFailed'))
  } finally {
    loading.value = false
  }
}

/** 请求后端删除指定 TheMovieDb 识别缓存。 */
async function deleteCacheItem(key: string) {
  const response = (await api.delete(`tmdb/cache/${encodeURIComponent(key)}`)) as unknown as ApiResponse
  if (!response.success) throw new Error(response.message)
}

/** 删除桌面端表格中选中的 TheMovieDb 识别缓存。 */
async function deleteSelectedItems() {
  if (selectedItems.value.length === 0) {
    $toast.warning(t('setting.cache.selectDeleteWarning'))
    return
  }

  const deleteCount = selectedItems.value.length
  try {
    loading.value = true
    await Promise.all(selectedItems.value.map(deleteCacheItem))
    $toast.success(t('setting.cache.deleteSelectedSuccess', { count: deleteCount }))
    await loadCacheData()
    selectedItems.value = []
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.deleteSelectedFailed'))
  } finally {
    loading.value = false
  }
}

/** 删除单条 TheMovieDb 识别缓存。 */
async function deleteSingleItem(item: TmdbRecognitionCacheItem) {
  try {
    loading.value = true
    await deleteCacheItem(item.key)
    $toast.success(t('setting.cache.deleteSuccess'))
    await loadCacheData()
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.cache.deleteFailed'))
  } finally {
    loading.value = false
  }
}

/** 获取 TheMovieDb 缓存海报的可展示地址。 */
function getPosterUrl(item: TmdbRecognitionCacheItem): string {
  if (!item.poster_path) return ''
  const sourceUrl = item.poster_path.startsWith('/')
    ? `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w300${item.poster_path}`
    : item.poster_path
  return getDisplayImageUrl(sourceUrl, globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 获取本地化的媒体类型名称。 */
function getMediaTypeLabel(mediaType: string): string {
  if (mediaType === 'movie') return t('setting.cache.mediaType.movie')
  if (mediaType === 'tv') return t('setting.cache.mediaType.tv')
  return t('setting.cache.mediaType.unknown')
}

/** 获取媒体类型对应的主题颜色。 */
function getMediaTypeColor(mediaType: string): string {
  if (mediaType === 'movie') return 'primary'
  if (mediaType === 'tv') return 'success'
  return 'secondary'
}

/** 获取识别状态的本地化名称。 */
function getRecognitionStatusLabel(item: TmdbRecognitionCacheItem): string {
  return item.tmdb_id > 0 ? t('setting.cache.recognized') : t('setting.cache.unrecognized')
}

onMounted(() => {
  void loadCacheData()
})

watch([searchFilter, statusFilter], () => {
  resetMobilePagination()
})
</script>

<template>
  <section class="tmdb-cache-panel">
    <div class="cache-panel-toolbar">
      <div class="cache-panel-stats">
        <div class="cache-panel-stat cache-panel-stat--primary">
          <VIcon icon="mdi-database-outline" :size="isMobile ? 32 : 22" />
          <div>
            <strong>{{ cacheData.count }}</strong>
            <span>{{ t('setting.cache.totalCount') }}</span>
          </div>
        </div>
        <div class="cache-panel-stat cache-panel-stat--success">
          <VIcon icon="mdi-check-decagram-outline" :size="isMobile ? 32 : 22" />
          <div>
            <strong>{{ cacheData.recognized }}</strong>
            <span>{{ t('setting.cache.recognized') }}</span>
          </div>
        </div>
        <div v-if="!isMobile" class="cache-panel-stat cache-panel-stat--warning">
          <VIcon icon="mdi-help-circle-outline" size="22" />
          <div>
            <strong>{{ cacheData.unrecognized }}</strong>
            <span>{{ t('setting.cache.unrecognized') }}</span>
          </div>
        </div>
      </div>

      <div v-if="!isMobile" class="cache-panel-actions">
        <VBtn icon variant="text" color="primary" :loading="loading" @click="loadCacheData(true)">
          <VIcon icon="mdi-refresh" />
          <VTooltip activator="parent" location="bottom">{{ t('setting.cache.refreshList') }}</VTooltip>
        </VBtn>
        <VBtn
          icon
          variant="text"
          color="warning"
          :disabled="selectedItems.length === 0"
          :loading="loading"
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

    <div class="cache-panel-filters">
      <VTextField
        v-model="searchFilter"
        class="cache-panel-filter"
        :label="isMobile ? undefined : t('setting.cache.filterRecognitionCache')"
        :placeholder="isMobile ? t('setting.cache.filterRecognitionCache') : undefined"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        :density="isMobile ? 'comfortable' : 'compact'"
        :single-line="isMobile"
        clearable
        hide-details
      />
      <VSelect
        v-model="statusFilter"
        class="cache-panel-filter"
        :label="isMobile ? undefined : t('setting.cache.recognitionStatus')"
        :placeholder="isMobile ? t('setting.cache.recognitionStatus') : undefined"
        :items="statusOptions"
        prepend-inner-icon="mdi-list-status"
        variant="outlined"
        :density="isMobile ? 'comfortable' : 'compact'"
        :single-line="isMobile"
        hide-details
      />
    </div>

    <div v-if="isMobile" class="cache-panel-mobile-actions">
      <VBtn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="loadCacheData(true)">
        {{ t('setting.cache.refresh') }}
      </VBtn>
      <VBtn variant="tonal" color="error" :loading="loading" prepend-icon="mdi-delete-variant" @click="clearAllCache">
        {{ t('setting.cache.clearAll') }}
      </VBtn>
    </div>

    <template v-if="isMobile">
      <VInfiniteScroll
        v-if="mobileVisibleData.length > 0 || loading"
        :key="mobileInfiniteKey"
        mode="intersect"
        side="end"
        :items="mobileVisibleData"
        class="tmdb-cache-mobile-scroll"
        @load="loadMoreMobileCache"
      >
        <template #loading>
          <div class="cache-panel-load-state">
            <VProgressCircular indeterminate color="primary" size="22" width="3" />
            <span>{{ t('setting.cache.loadingMore') }}</span>
          </div>
        </template>

        <template #empty />

        <VVirtualScroll
          v-if="mobileVisibleData.length > 0"
          renderless
          :items="mobileVisibleData"
          :item-height="MOBILE_CACHE_ITEM_HEIGHT"
        >
          <template #default="{ item, itemRef }">
            <article :ref="itemRef" :key="item.key" class="tmdb-cache-mobile-item">
              <div class="tmdb-cache-poster">
                <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
                <VIcon v-else icon="mdi-image-off-outline" size="28" />
              </div>

              <div class="tmdb-cache-mobile-item__content">
                <div class="tmdb-cache-mobile-item__title">
                  {{ item.title || t('setting.cache.unrecognized') }}
                </div>
                <div class="tmdb-cache-mobile-item__meta">
                  <VChip size="x-small" variant="tonal" :color="getMediaTypeColor(item.media_type)">
                    {{ getMediaTypeLabel(item.media_type) }}
                  </VChip>
                  <span v-if="item.year">{{ item.year }}</span>
                  <span v-if="item.tmdb_id">TMDB #{{ item.tmdb_id }}</span>
                </div>
                <div class="tmdb-cache-mobile-item__key">{{ item.key }}</div>
              </div>

              <VBtn
                icon
                size="small"
                variant="text"
                color="error"
                :aria-label="t('common.delete')"
                @click="deleteSingleItem(item)"
              >
                <VIcon icon="mdi-delete-outline" size="20" />
              </VBtn>
            </article>
          </template>
        </VVirtualScroll>
      </VInfiniteScroll>

      <div v-else class="cache-panel-empty">
        <VIcon icon="mdi-database-search-outline" size="42" />
        <strong>{{ t('setting.cache.noRecognitionCache') }}</strong>
        <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
      </div>
    </template>

    <VDataTable
      v-else
      v-model="selectedItems"
      class="tmdb-cache-table"
      :headers="tableHeaders"
      :items="filteredData"
      :loading="loading"
      item-value="key"
      show-select
      hover
      fixed-header
      :items-per-page-text="t('common.itemsPerPage')"
      :no-data-text="t('common.noDataText')"
      :loading-text="t('common.loadingText')"
    >
      <template #item.poster="{ item }">
        <div class="tmdb-cache-table__poster">
          <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
          <VIcon v-else icon="mdi-image-off-outline" />
        </div>
      </template>

      <template #item.key="{ item }">
        <div class="tmdb-cache-table__key">{{ item.key }}</div>
      </template>

      <template #item.result="{ item }">
        <div class="tmdb-cache-result">
          <strong>{{ item.title || t('setting.cache.unrecognized') }}</strong>
          <span v-if="item.year">{{ item.year }}</span>
          <VChip size="x-small" variant="tonal" :color="getMediaTypeColor(item.media_type)">
            {{ getMediaTypeLabel(item.media_type) }}
          </VChip>
        </div>
      </template>

      <template #item.tmdb_id="{ item }">
        <span v-if="item.tmdb_id" class="font-weight-medium">#{{ item.tmdb_id }}</span>
        <span v-else class="text-medium-emphasis">-</span>
      </template>

      <template #item.status="{ item }">
        <VChip size="small" variant="tonal" :color="item.tmdb_id > 0 ? 'success' : 'warning'">
          {{ getRecognitionStatusLabel(item) }}
        </VChip>
      </template>

      <template #item.actions="{ item }">
        <VBtn icon size="small" variant="text" color="error" @click="deleteSingleItem(item)">
          <VIcon icon="mdi-delete-outline" size="18" />
          <VTooltip activator="parent" location="start">{{ t('common.delete') }}</VTooltip>
        </VBtn>
      </template>

      <template #no-data>
        <div class="cache-panel-empty">
          <VIcon icon="mdi-database-search-outline" size="42" />
          <strong>{{ t('setting.cache.noRecognitionCache') }}</strong>
          <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
        </div>
      </template>
    </VDataTable>
  </section>
</template>

<style scoped>
.tmdb-cache-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding: 20px;
  gap: 16px;
}

.cache-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.cache-panel-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cache-panel-stat {
  display: flex;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
  min-block-size: 58px;
  min-inline-size: 126px;
  padding: 10px 14px;
  gap: 10px;
}

.cache-panel-stat strong,
.cache-panel-stat span {
  display: block;
}

.cache-panel-stat strong {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 18px;
  line-height: 1.15;
}

.cache-panel-stat span {
  margin-block-start: 3px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
}

.cache-panel-stat--primary {
  color: rgb(var(--v-theme-primary));
}

.cache-panel-stat--success {
  color: rgb(var(--v-theme-success));
}

.cache-panel-stat--warning {
  color: rgb(var(--v-theme-warning));
}

.cache-panel-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}

.cache-panel-filters {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.35fr);
}

.cache-panel-filters :deep(.v-field) {
  border-radius: var(--app-field-radius);
  background: var(--app-grouped-list-background);
}

.cache-panel-mobile-actions {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cache-panel-mobile-actions :deep(.v-btn) {
  min-block-size: 44px;
}

.tmdb-cache-table {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  box-shadow: var(--app-surface-shadow);
  max-block-size: calc(100dvh - 23rem);
}

.tmdb-cache-table__poster,
.tmdb-cache-poster {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.36);
}

.tmdb-cache-table__poster {
  block-size: 62px;
  inline-size: 44px;
  margin-block: 4px;
}

.tmdb-cache-table__poster :deep(.v-img),
.tmdb-cache-poster :deep(.v-img) {
  block-size: 100%;
  inline-size: 100%;
}

.tmdb-cache-table__key {
  max-inline-size: 36rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-family: monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.tmdb-cache-result {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.tmdb-cache-result strong {
  inline-size: 100%;
  color: rgba(var(--v-theme-on-surface), 0.88);
}

.tmdb-cache-result span {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
}

.cache-panel-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-block-size: 14rem;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  text-align: center;
  gap: 8px;
}

.cache-panel-empty strong {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 15px;
}

.cache-panel-empty span {
  max-inline-size: 30rem;
  font-size: 13px;
}

@media (max-width: 959.98px) {
  .tmdb-cache-panel {
    overflow-y: auto;
    block-size: 100%;
    padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
  }

  .cache-panel-toolbar {
    align-items: flex-start;
  }

  .cache-panel-stats {
    display: grid;
    flex: 1 1 auto;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cache-panel-stat {
    align-items: center;
    flex-direction: row;
    min-block-size: 92px;
    min-inline-size: 0;
    padding: 18px;
    gap: 14px;
  }

  .cache-panel-stat strong {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.05;
    white-space: nowrap;
  }

  .cache-panel-stat span {
    margin-block-start: 8px;
    font-size: 14px;
    font-weight: 600;
  }

  .cache-panel-filters {
    gap: 10px;
    grid-template-columns: 1fr;
  }

  .cache-panel-filter :deep(.v-field__outline) {
    color: rgba(var(--v-theme-on-surface), 0.18);
  }

  .cache-panel-filter :deep(.v-field__input) {
    min-block-size: 54px;
    color: rgba(var(--v-theme-on-surface), 0.72);
    font-size: 16px;
  }

  .tmdb-cache-mobile-scroll {
    overflow: visible !important;
    min-block-size: 20rem;
  }

  .tmdb-cache-mobile-scroll :deep(.v-infinite-scroll__container),
  .tmdb-cache-mobile-scroll :deep(.v-virtual-scroll),
  .tmdb-cache-mobile-scroll :deep(.v-virtual-scroll__container) {
    overflow: visible !important;
  }

  .tmdb-cache-mobile-scroll :deep(.v-infinite-scroll__side) {
    padding-block: 14px 2px;
  }

  .cache-panel-load-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    min-block-size: 70px;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 15px;
    font-weight: 700;
    gap: 8px;
  }

  .tmdb-cache-mobile-item {
    display: grid;
    align-items: start;
    border: var(--app-surface-border);
    border-radius: var(--app-surface-radius);
    backdrop-filter: var(--app-grouped-list-backdrop-filter);
    background: var(--app-grouped-list-background);
    box-shadow: var(--app-surface-shadow);
    grid-template-columns: 54px minmax(0, 1fr) 36px;
    margin-block-end: 10px;
    padding: 12px;
    gap: 12px;
  }

  .tmdb-cache-poster {
    block-size: 78px;
    inline-size: 54px;
  }

  .tmdb-cache-mobile-item__content {
    min-inline-size: 0;
  }

  .tmdb-cache-mobile-item__title {
    color: rgba(var(--v-theme-on-surface), 0.9);
    font-size: 15px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .tmdb-cache-mobile-item__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin-block-start: 7px;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 12px;
    gap: 7px;
  }

  .tmdb-cache-mobile-item__key {
    margin-block-start: 8px;
    color: rgba(var(--v-theme-on-surface), 0.48);
    font-family: monospace;
    font-size: 11px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
}

@media (max-width: 374.98px) {
  .tmdb-cache-panel {
    padding-inline: 12px;
  }

  .cache-panel-stat {
    padding: 12px;
    gap: 10px;
  }
}
</style>
