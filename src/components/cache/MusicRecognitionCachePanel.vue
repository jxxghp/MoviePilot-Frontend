<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { ApiResponse, MusicRecognitionCacheData, MusicRecognitionCacheItem } from '@/api/types'
import { useConfirm } from '@/composables/useConfirm'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

type RecognitionStatusFilter = 'all' | 'recognized' | 'unrecognized'
type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'

const MOBILE_CACHE_PAGE_SIZE = 20
const MUSIC_CACHE_ENDPOINT = 'music/cache'

const { t } = useI18n()
const display = useDisplay()
const createConfirm = useConfirm()
const $toast = useToast()
const globalSettingsStore = useGlobalSettingsStore()

const isMobile = computed(() => display.smAndDown.value)
const recognitionSourceName = computed(() => t('setting.cache.recognitionSource.musicbrainz'))
const recognitionIdLabel = computed(() => t('setting.cache.musicbrainzId'))
const recognitionFilterPlaceholder = computed(() =>
  t('setting.cache.filterRecognitionCache', { source: recognitionSourceName.value }),
)
const loading = ref(false)
const searchFilter = ref('')
const statusFilter = ref<RecognitionStatusFilter>('all')
const selectedItems = ref<string[]>([])
const cacheData = ref<MusicRecognitionCacheData>({
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
  { title: t('setting.cache.recognitionResult'), key: 'result', sortable: false, width: '240px' },
  { title: recognitionIdLabel.value, key: 'media_id', sortable: true, width: '140px' },
  { title: t('setting.cache.recognitionStatus'), key: 'status', sortable: true, width: '120px' },
  { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '72px' },
])

const filteredData = computed(() => {
  const keyword = searchFilter.value.trim().toLowerCase()
  return cacheData.value.data.filter(item => {
    const matchesKeyword =
      !keyword ||
      [item.key, item.title, item.album, item.media_id, getArtistText(item), String(item.year ?? '')].some(value =>
        (value || '').toLowerCase().includes(keyword),
      )
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

/** 加载音乐识别缓存列表。 */
async function loadCacheData(showSuccess = false) {
  const requestId = ++cacheLoadRequestId
  try {
    loading.value = true
    const response = (await api.get(MUSIC_CACHE_ENDPOINT)) as unknown as ApiResponse<MusicRecognitionCacheData>
    if (requestId !== cacheLoadRequestId) return
    const responseData = response.data ?? {
      count: 0,
      recognized: 0,
      unrecognized: 0,
      data: [],
    }
    cacheData.value = {
      ...responseData,
      data: (responseData.data ?? []).map(item => ({ ...item })),
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

/** 清空全部音乐识别缓存。 */
async function clearAllCache() {
  const confirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.recognitionClearConfirm', { source: recognitionSourceName.value }),
  })
  if (!confirmed) return

  try {
    loading.value = true
    const response = (await api.delete(MUSIC_CACHE_ENDPOINT)) as unknown as ApiResponse
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

/** 请求接口删除指定音乐识别缓存。 */
async function deleteCacheItem(key: string) {
  const response = (await api.delete(`${MUSIC_CACHE_ENDPOINT}/${encodeURIComponent(key)}`)) as unknown as ApiResponse
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
async function deleteSingleItem(item: MusicRecognitionCacheItem) {
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

/** 获取音乐识别缓存封面的可展示地址。 */
function getCoverUrl(item: MusicRecognitionCacheItem): string {
  if (!item.cover_url) return ''
  return getDisplayImageUrl(item.cover_url, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 获取艺术家展示文本。 */
function getArtistText(item: MusicRecognitionCacheItem): string {
  return (item.artists || []).join(' / ')
}

/** 判断识别缓存条目是否包含有效媒体 ID。 */
function isRecognized(item: MusicRecognitionCacheItem): boolean {
  return Boolean(item.media_id)
}

/** 获取移动端识别缓存卡片的稳定渲染 key。 */
function getMusicCacheItemKey(item: MusicRecognitionCacheItem): string {
  return item.key
}

/** 获取音乐实体类型的本地化名称。 */
function getMusicTypeLabel(musicType?: string): string {
  if (musicType === 'album') return t('setting.cache.musicType.album')
  if (musicType === 'artist') return t('setting.cache.musicType.artist')
  return t('setting.cache.musicType.recording')
}

/** 获取音乐实体类型对应的主题颜色。 */
function getMusicTypeColor(musicType?: string): string {
  if (musicType === 'album') return 'success'
  if (musicType === 'artist') return 'info'
  return 'primary'
}

/** 获取识别状态的本地化名称。 */
function getRecognitionStatusLabel(item: MusicRecognitionCacheItem): string {
  return isRecognized(item) ? t('setting.cache.recognized') : t('setting.cache.unrecognized')
}

onMounted(() => {
  void loadCacheData()
})

watch([searchFilter, statusFilter], () => {
  resetMobilePagination()
})
</script>

<template>
  <section class="music-cache-panel">
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
        <div class="cache-panel-stat cache-panel-stat--warning">
          <VIcon icon="mdi-help-circle-outline" :size="isMobile ? 32 : 22" />
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
        class="music-cache-mobile-scroll"
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
          :get-item-key="getMusicCacheItemKey"
        >
          <template #default="{ item }">
            <article class="music-cache-mobile-item">
              <div class="music-cache-cover rounded-md">
                <VImg v-if="getCoverUrl(item)" :src="getCoverUrl(item)" :alt="item.title || item.key" cover />
                <VIcon v-else icon="mdi-album-outline" size="28" />
              </div>

              <div class="music-cache-mobile-item__content">
                <div class="music-cache-mobile-item__title">
                  {{ item.title || t('setting.cache.unrecognized') }}
                </div>
                <div class="music-cache-mobile-item__meta">
                  <VChip size="x-small" variant="tonal" :color="getMusicTypeColor(item.music_type)">
                    {{ getMusicTypeLabel(item.music_type) }}
                  </VChip>
                  <span v-if="getArtistText(item)">{{ getArtistText(item) }}</span>
                  <span v-if="item.year">{{ item.year }}</span>
                </div>
                <div class="music-cache-mobile-item__key">{{ item.key }}</div>
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
      class="music-cache-table"
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
        <div class="music-cache-table__cover rounded-md">
          <VImg v-if="getCoverUrl(item)" :src="getCoverUrl(item)" :alt="item.title || item.key" cover />
          <VIcon v-else icon="mdi-album-outline" />
        </div>
      </template>

      <template #item.key="{ item }">
        <div class="music-cache-table__key">{{ item.key }}</div>
      </template>

      <template #item.result="{ item }">
        <div class="music-cache-result">
          <strong>{{ item.title || t('setting.cache.unrecognized') }}</strong>
          <span v-if="getArtistText(item)">{{ getArtistText(item) }}</span>
          <span v-if="item.album">{{ item.album }}</span>
          <span v-if="item.year">{{ item.year }}</span>
          <VChip size="x-small" variant="tonal" :color="getMusicTypeColor(item.music_type)">
            {{ getMusicTypeLabel(item.music_type) }}
          </VChip>
        </div>
      </template>

      <template #item.media_id="{ item }">
        <span v-if="isRecognized(item)" class="font-weight-medium music-cache-table__media-id">{{
          item.media_id
        }}</span>
        <span v-else class="text-medium-emphasis">-</span>
      </template>

      <template #item.status="{ item }">
        <VChip size="small" variant="tonal" :color="isRecognized(item) ? 'success' : 'warning'">
          {{ getRecognitionStatusLabel(item) }}
        </VChip>
      </template>

      <template #item.actions="{ item }">
        <VBtn
          icon
          size="small"
          variant="text"
          color="error"
          :aria-label="t('common.delete')"
          @click="deleteSingleItem(item)"
        >
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

.music-cache-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 16px;
  min-block-size: 0;
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

.music-cache-table {
  overflow: hidden;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  box-shadow: var(--app-surface-shadow);
}

.music-cache-table__cover,
.music-cache-cover {
  display: flex;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.36);
}

.music-cache-table__cover {
  block-size: 62px;
  inline-size: 62px;
  margin-block: 4px;
}

.music-cache-table__cover :deep(.v-img),
.music-cache-cover :deep(.v-img) {
  block-size: 100%;
  inline-size: 100%;
}

.music-cache-table__key {
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-family: monospace;
  font-size: 12px;
  max-inline-size: 30rem;
  overflow-wrap: anywhere;
}

.music-cache-table__media-id {
  font-family: monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.music-cache-result {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.music-cache-result strong {
  color: rgba(var(--v-theme-on-surface), 0.88);
  inline-size: 100%;
}

.music-cache-result span {
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

  .music-cache-mobile-scroll {
    overflow: visible !important;
    min-block-size: 20rem;
  }

  .music-cache-mobile-scroll :deep(.v-infinite-scroll__container),
  .music-cache-mobile-scroll :deep(.progressive-card-grid),
  .music-cache-mobile-scroll :deep(.progressive-card-grid__track) {
    overflow: visible !important;
  }

  .music-cache-mobile-scroll :deep(.v-infinite-scroll__side) {
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

  .music-cache-mobile-item {
    display: grid;
    align-items: start;
    padding: 12px;
    border: var(--app-surface-border);
    border-radius: var(--app-surface-radius);
    backdrop-filter: var(--app-grouped-list-backdrop-filter);
    background: var(--app-grouped-list-background);
    box-shadow: var(--app-surface-shadow);
    gap: 12px;
    grid-template-columns: 62px minmax(0, 1fr) 36px;
  }

  .music-cache-cover {
    block-size: 62px;
    inline-size: 62px;
  }

  .music-cache-mobile-item__content {
    min-inline-size: 0;
  }

  .music-cache-mobile-item__title {
    color: rgba(var(--v-theme-on-surface), 0.9);
    font-size: 15px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .music-cache-mobile-item__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    color: rgba(var(--v-theme-on-surface), 0.58);
    font-size: 12px;
    gap: 7px;
    margin-block-start: 7px;
  }

  .music-cache-mobile-item__key {
    color: rgba(var(--v-theme-on-surface), 0.48);
    font-family: monospace;
    font-size: 11px;
    line-height: 1.35;
    margin-block-start: 8px;
    overflow-wrap: anywhere;
  }
}
</style>
