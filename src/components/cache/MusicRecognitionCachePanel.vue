<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import type { MusicRecognitionCacheItem } from '@/api/types'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'

type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'

const MOBILE_CACHE_PAGE_SIZE = 20

// 纯展示组件：数据加载与删除请求由父级识别缓存面板统一负责
const props = defineProps<{
  // 已按搜索与状态条件过滤的音乐识别缓存
  items: MusicRecognitionCacheItem[]
  loading: boolean
  selectedItems: string[]
}>()

const emit = defineEmits<{
  (e: 'update:selectedItems', value: string[]): void
  (e: 'delete', key: string): void
}>()

const { t } = useI18n()
const display = useDisplay()
const globalSettingsStore = useGlobalSettingsStore()

const isMobile = computed(() => display.smAndDown.value)
const recognitionSourceName = computed(() => t('setting.cache.recognitionSource.musicbrainz'))
const recognitionIdLabel = computed(() => t('setting.cache.musicbrainzId'))

const mobileVisibleCount = ref(MOBILE_CACHE_PAGE_SIZE)
const mobileInfiniteKey = ref(0)

const tableHeaders = computed(() => [
  { title: '', key: 'data-table-select', sortable: false, width: '48px' },
  { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '76px' },
  { title: t('setting.cache.cacheKey'), key: 'key', sortable: true },
  { title: t('setting.cache.recognitionResult'), key: 'result', sortable: false, width: '240px' },
  { title: recognitionIdLabel.value, key: 'media_id', sortable: true, width: '140px' },
  { title: t('setting.cache.recognitionStatus'), key: 'status', sortable: true, width: '120px' },
  { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '72px' },
])

const mobileVisibleData = computed(() => props.items.slice(0, mobileVisibleCount.value))
const mobileHasMore = computed(() => mobileVisibleData.value.length < props.items.length)

/** 重置移动端分页，让筛选或刷新后的识别缓存从第一页开始展示。 */
function resetMobilePagination() {
  mobileVisibleCount.value = MOBILE_CACHE_PAGE_SIZE
  mobileInfiniteKey.value++
}

/** 追加移动端下一页识别缓存，并由虚拟滚动限制实际渲染节点。 */
function loadMoreMobileCache({ done }: { done: (status: InfiniteScrollStatus) => void }) {
  if (props.loading) {
    done('ok')
    return
  }

  if (!mobileHasMore.value) {
    done('empty')
    return
  }

  mobileVisibleCount.value = Math.min(mobileVisibleCount.value + MOBILE_CACHE_PAGE_SIZE, props.items.length)
  done(mobileHasMore.value ? 'ok' : 'empty')
}

/** 更新桌面端表格选中项。 */
function updateSelectedItems(value: unknown) {
  emit('update:selectedItems', (value as string[]) ?? [])
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

watch(() => props.items, resetMobilePagination)
</script>

<template>
  <section class="music-cache-panel">
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
                @click="emit('delete', item.key)"
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
      :model-value="selectedItems"
      class="music-cache-table"
      :headers="tableHeaders"
      :items="items"
      :loading="loading"
      item-value="key"
      show-select
      hover
      :items-per-page-text="t('common.itemsPerPage')"
      :no-data-text="t('common.noDataText')"
      :loading-text="t('common.loadingText')"
      @update:model-value="updateSelectedItems"
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
          @click="emit('delete', item.key)"
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
  min-block-size: 0;
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
