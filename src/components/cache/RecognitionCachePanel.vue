<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { ApiResponse, RecognitionCacheData, RecognitionCacheItem } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

type RecognitionStatusFilter = 'all' | 'recognized' | 'unrecognized'
type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'
type RecognitionCacheSource = 'tmdb' | 'douban'

const MOBILE_CACHE_PAGE_SIZE = 20

const { t } = useI18n()
const display = useDisplay()
const createConfirm = useConfirm()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()

const isMobile = computed(() => display.smAndDown.value)
const recognitionSource = computed<RecognitionCacheSource>(() =>
  globalSettingsStore.globalSettings.RECOGNIZE_SOURCE === 'douban' ? 'douban' : 'tmdb',
)
const recognitionSourceName = computed(() =>
  recognitionSource.value === 'douban'
    ? t('setting.cache.recognitionSource.douban')
    : t('setting.cache.recognitionSource.themoviedb'),
)
const recognitionIdLabel = computed(() =>
  recognitionSource.value === 'douban' ? t('setting.cache.doubanId') : t('setting.cache.tmdbId'),
)
const recognitionCacheEndpoint = computed(() => `${recognitionSource.value}/cache`)
const recognitionFilterPlaceholder = computed(() =>
  t('setting.cache.filterRecognitionCache', { source: recognitionSourceName.value }),
)
const loading = ref(false)
const searchFilter = ref('')
const statusFilter = ref<RecognitionStatusFilter>('all')
const selectedItems = ref<string[]>([])
const cacheData = ref<RecognitionCacheData>({
  count: 0,
  recognized: 0,
  unrecognized: 0,
  data: [],
})
const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)
const mobileInfiniteKey = ref(0)
let cacheLoadRequestId = 0

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
  { title: recognitionIdLabel.value, key: 'recognition_id', sortable: true, width: '120px' },
  { title: t('setting.cache.recognitionStatus'), key: 'status', sortable: true, width: '120px' },
  { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '72px' },
])

const filteredData = computed(() => {
  const keyword = searchFilter.value.trim().toLowerCase()
  return cacheData.value.data.filter(item => {
    const matchesKeyword =
      !keyword ||
      [item.key, item.title, item.year, getRecognitionId(item)].some(value => value.toLowerCase().includes(keyword))
    const matchesStatus =
      statusFilter.value === 'all' || (statusFilter.value === 'recognized' ? isRecognized(item) : !isRecognized(item))
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

/** 加载当前识别数据源对应的缓存列表。 */
async function loadCacheData(showSuccess = false) {
  const requestId = ++cacheLoadRequestId
  try {
    loading.value = true
    const response = (await api.get(recognitionCacheEndpoint.value)) as unknown as ApiResponse<RecognitionCacheData>
    if (requestId !== cacheLoadRequestId) return
    const responseData = response.data ?? { count: 0, recognized: 0, unrecognized: 0, data: [] }
    cacheData.value = {
      ...responseData,
      data: responseData.data.map(item => ({ ...item, recognition_id: getRecognitionId(item) })),
    }
    selectedItems.value = selectedItems.value.filter(key => cacheData.value.data.some(item => item.key === key))
    resetMobilePagination()
    if (showSuccess) $toast.success(t('setting.cache.listRefreshSuccess'))
  } catch (error) {
    if (requestId !== cacheLoadRequestId) return
    console.error(error)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    if (requestId === cacheLoadRequestId) loading.value = false
  }
}

/** 清空当前识别数据源的全部识别缓存。 */
async function clearAllCache() {
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.recognitionClearConfirm', { source: recognitionSourceName.value }),
  })
  if (!confirmed) return

  try {
    loading.value = true
    const response = (await api.delete(recognitionCacheEndpoint.value)) as unknown as ApiResponse
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

/** 请求当前识别数据源接口删除指定识别缓存。 */
async function deleteCacheItem(key: string) {
  const response = (await api.delete(
    `${recognitionCacheEndpoint.value}/${encodeURIComponent(key)}`,
  )) as unknown as ApiResponse
  if (!response.success) throw new Error(response.message)
}

/** 删除桌面端表格中选中的识别缓存。 */
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

/** 删除单条识别缓存。 */
async function deleteSingleItem(item: RecognitionCacheItem) {
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

/** 获取识别缓存海报的可展示地址。 */
function getPosterUrl(item: RecognitionCacheItem): string {
  if (!item.poster_path) return ''
  const sourceUrl = item.poster_path.startsWith('/')
    ? `https://${globalSettingsStore.globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w300${item.poster_path}`
    : item.poster_path
  return getDisplayImageUrl(sourceUrl, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 获取当前识别数据源对应的媒体 ID。 */
function getRecognitionId(item: RecognitionCacheItem): string {
  const recognitionId = recognitionSource.value === 'douban' ? item.douban_id : item.tmdb_id
  return recognitionId ? String(recognitionId) : ''
}

/** 判断识别缓存条目是否包含有效媒体 ID。 */
function isRecognized(item: RecognitionCacheItem): boolean {
  const recognitionId = getRecognitionId(item)
  return Boolean(recognitionId && recognitionId !== '0')
}

/** 获取移动端识别缓存卡片的稳定渲染 key。 */
function getRecognitionCacheItemKey(item: RecognitionCacheItem): string {
  return item.key
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
function getRecognitionStatusLabel(item: RecognitionCacheItem): string {
  return isRecognized(item) ? t('setting.cache.recognized') : t('setting.cache.unrecognized')
}

onMounted(() => {
  void loadCacheData()
})

watch([searchFilter, statusFilter], () => {
  resetMobilePagination()
})

watch(recognitionSource, () => {
  searchFilter.value = ''
  statusFilter.value = 'all'
  selectedItems.value = []
  void loadCacheData()
})
</script>

<template>
  <section class="recognition-cache-panel">
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
        :label="isMobile ? undefined : recognitionFilterPlaceholder"
        :placeholder="isMobile ? recognitionFilterPlaceholder : undefined"
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
        class="recognition-cache-mobile-scroll"
        @load="loadMoreMobileCache"
      >
        <template #loading>
          <div class="cache-panel-load-state">
            <VProgressCircular indeterminate color="primary" size="22" width="3" />
            <span>{{ t('setting.cache.loadingMore') }}</span>
          </div>
        </template>

        <template #empty />

        <ProgressiveCardGrid
          v-if="mobileVisibleData.length > 0"
          :items="mobileVisibleData"
          :columns="1"
          :gap="10"
          :estimated-item-height="152"
          :overscan-rows="5"
          :get-item-key="getRecognitionCacheItemKey"
        >
          <template #default="{ item }">
            <article class="recognition-cache-mobile-item">
              <div class="recognition-cache-poster">
                <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
                <VIcon v-else icon="mdi-image-off-outline" size="28" />
              </div>

              <div class="recognition-cache-mobile-item__content">
                <div class="recognition-cache-mobile-item__title">
                  {{ item.title || t('setting.cache.unrecognized') }}
                </div>
                <div class="recognition-cache-mobile-item__meta">
                  <VChip size="x-small" variant="tonal" :color="getMediaTypeColor(item.media_type)">
                    {{ getMediaTypeLabel(item.media_type) }}
                  </VChip>
                  <span v-if="item.year">{{ item.year }}</span>
                  <span v-if="isRecognized(item)">{{ recognitionIdLabel }} #{{ getRecognitionId(item) }}</span>
                </div>
                <div class="recognition-cache-mobile-item__key">{{ item.key }}</div>
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
        </ProgressiveCardGrid>
      </VInfiniteScroll>

      <div v-else class="cache-panel-empty">
        <VIcon icon="mdi-database-search-outline" size="42" />
        <strong>{{ t('setting.cache.noRecognitionCache', { source: recognitionSourceName }) }}</strong>
        <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
      </div>
    </template>

    <VDataTable
      v-else
      v-model="selectedItems"
      class="recognition-cache-table"
      :headers="tableHeaders"
      :items="filteredData"
      :loading="loading"
      item-value="key"
      show-select
      hover
      :items-per-page-text="t('common.itemsPerPage')"
      :no-data-text="t('common.noDataText')"
      :loading-text="t('common.loadingText')"
    >
      <template #item.poster="{ item }">
        <div class="recognition-cache-table__poster">
          <VImg v-if="getPosterUrl(item)" :src="getPosterUrl(item)" :alt="item.title || item.key" cover />
          <VIcon v-else icon="mdi-image-off-outline" />
        </div>
      </template>

      <template #item.key="{ item }">
        <div class="recognition-cache-table__key">{{ item.key }}</div>
      </template>

      <template #item.result="{ item }">
        <div class="recognition-cache-result">
          <strong>{{ item.title || t('setting.cache.unrecognized') }}</strong>
          <span v-if="item.year">{{ item.year }}</span>
          <VChip size="x-small" variant="tonal" :color="getMediaTypeColor(item.media_type)">
            {{ getMediaTypeLabel(item.media_type) }}
          </VChip>
        </div>
      </template>

      <template #item.recognition_id="{ item }">
        <span v-if="isRecognized(item)" class="font-weight-medium">#{{ getRecognitionId(item) }}</span>
        <span v-else class="text-medium-emphasis">-</span>
      </template>

      <template #item.status="{ item }">
        <VChip size="small" variant="tonal" :color="isRecognized(item) ? 'success' : 'warning'">
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
          <strong>{{ t('setting.cache.noRecognitionCache', { source: recognitionSourceName }) }}</strong>
          <span>{{ t('setting.cache.noRecognitionCacheHint') }}</span>
        </div>
      </template>
    </VDataTable>
  </section>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.recognition-cache-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding: 20px;
  gap: 16px;
  min-block-size: 0;
  overflow-y: auto;
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
  gap: 10px;
  min-block-size: 58px;
  min-inline-size: 126px;
  padding-block: 10px;
  padding-inline: 14px;
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
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  margin-block-start: 3px;
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

.recognition-cache-table {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  box-shadow: var(--app-surface-shadow);
}

.recognition-cache-table__poster,
.recognition-cache-poster {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.36);
}

.recognition-cache-table__poster {
  block-size: 62px;
  inline-size: 44px;
  margin-block: 4px;
}

.recognition-cache-table__poster :deep(.v-img),
.recognition-cache-poster :deep(.v-img) {
  block-size: 100%;
  inline-size: 100%;
}

.recognition-cache-table__key {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-family: monospace;
  font-size: 12px;
  max-inline-size: 36rem;
  overflow-wrap: anywhere;
}

.recognition-cache-result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.recognition-cache-result strong {
  color: rgba(var(--v-theme-on-surface), 0.88);
  inline-size: 100%;
}

.recognition-cache-result span {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 12px;
}

.cache-panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  gap: 8px;
  min-block-size: 14rem;
  text-align: center;
}

.cache-panel-empty strong {
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 15px;
}

.cache-panel-empty span {
  font-size: 13px;
  max-inline-size: 30rem;
}

@media (width <= 959.98px) {
  .recognition-cache-panel {
    block-size: 100%;
    padding-block: 14px calc(18px + env(safe-area-inset-bottom));
    padding-inline: 16px;
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
    flex-direction: row;
    align-items: center;
    padding: 18px;
    gap: 14px;
    min-block-size: 92px;
    min-inline-size: 0;
  }

  .cache-panel-stat strong {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.05;
    white-space: nowrap;
  }

  .cache-panel-stat span {
    font-size: 14px;
    font-weight: 600;
    margin-block-start: 8px;
  }

  .cache-panel-filters {
    gap: 10px;
    grid-template-columns: 1fr;
  }

  .cache-panel-filter :deep(.v-field__outline) {
    color: rgba(var(--v-theme-on-surface), 0.18);
  }

  .cache-panel-filter :deep(.v-field__input) {
    color: rgba(var(--v-theme-on-surface), 0.72);
    font-size: 16px;
    min-block-size: 54px;
  }

  .recognition-cache-mobile-scroll {
    overflow: visible !important;
    min-block-size: 20rem;
  }

  .recognition-cache-mobile-scroll :deep(.v-infinite-scroll__container),
  .recognition-cache-mobile-scroll :deep(.progressive-card-grid),
  .recognition-cache-mobile-scroll :deep(.progressive-card-grid__track) {
    overflow: visible !important;
  }

  .recognition-cache-mobile-scroll :deep(.v-infinite-scroll__side) {
    padding-block: 14px 2px;
  }

  .cache-panel-load-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 15px;
    font-weight: 700;
    gap: 8px;
    min-block-size: 70px;
  }

  .recognition-cache-mobile-item {
    display: grid;
    align-items: start;
    padding: 12px;
    border: var(--app-surface-border);
    border-radius: var(--app-surface-radius);
    backdrop-filter: var(--app-grouped-list-backdrop-filter);
    background: var(--app-grouped-list-background);
    box-shadow: var(--app-surface-shadow);
    gap: 12px;
    grid-template-columns: 54px minmax(0, 1fr) 36px;
  }

  .recognition-cache-poster {
    block-size: 78px;
    inline-size: 54px;
  }

  .recognition-cache-mobile-item__content {
    min-inline-size: 0;
  }

  .recognition-cache-mobile-item__title {
    color: rgba(var(--v-theme-on-surface), 0.9);
    font-size: 15px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .recognition-cache-mobile-item__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 12px;
    gap: 7px;
    margin-block-start: 7px;
  }

  .recognition-cache-mobile-item__key {
    color: rgba(var(--v-theme-on-surface), 0.48);
    font-family: monospace;
    font-size: 11px;
    line-height: 1.35;
    margin-block-start: 8px;
    overflow-wrap: anywhere;
  }
}

@media (width <= 374.98px) {
  .recognition-cache-panel {
    padding-inline: 12px;
  }

  .cache-panel-stat {
    padding: 12px;
    gap: 10px;
  }
}
</style>
