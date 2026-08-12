<script lang="ts" setup>
import api from '@/api'
import type { DownloadHistory } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { formatDateDifference } from '@core/utils/formatters'
import noImage from '@images/no-image.jpeg'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const emit = defineEmits(['close'])

const { t } = useI18n()
const display = useDisplay()
const globalSettingsStore = useGlobalSettingsStore()
const $toast = useToast()

const historyList = ref<DownloadHistory[]>([])
const currentPage = ref(1)
const pageSize = 30
const loading = ref(false)
const isRefreshed = ref(false)

/** 分页加载下载历史，并将新页追加到现有列表。 */
async function loadHistory({ done }: { done: (status: 'empty' | 'error' | 'ok') => void }) {
  if (loading.value) {
    done('ok')
    return
  }

  try {
    loading.value = true
    const currentData: DownloadHistory[] = await api.get('history/download', {
      params: {
        page: currentPage.value,
        count: pageSize,
      },
    })
    isRefreshed.value = true

    if (currentData.length === 0) {
      done('empty')
      return
    }

    historyList.value = [...historyList.value, ...currentData]
    currentPage.value++
    done('ok')
  } catch (error) {
    console.error(error)
    done('error')
  } finally {
    loading.value = false
  }
}

/** 删除指定下载历史，并在成功后同步移除当前列表项。 */
async function deleteHistory(item: DownloadHistory) {
  try {
    await api.delete('history/download', { data: item, feedback: 'silent' })
    historyList.value = historyList.value.filter(history => history.id !== item.id)
  } catch (error) {
    console.error(error)
    $toast.error(t('dialog.downloadHistory.deleteFailed'))
  }
}

/** 优先返回海报，缺失时使用背景图，并统一转换为可展示地址。 */
function getHistoryImage(item: DownloadHistory) {
  const image = item.poster || item.image
  if (!image) return noImage
  return getDisplayImageUrl(image, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE)
}

/** 返回下载历史的主标题。 */
function getHistoryTitle(item: DownloadHistory) {
  return item.title || item.torrent_name || t('dialog.downloadHistory.unknownTitle')
}

/** 合并下载历史的季号和集号。 */
function getSeasonEpisode(item: DownloadHistory) {
  return `${item.seasons || ''}${item.episodes || ''}`
}
</script>

<template>
  <VDialog
    scrollable
    max-width="50rem"
    :height="display.mdAndUp.value ? '42rem' : undefined"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="download-history-dialog mx-auto d-flex flex-column" width="100%">
      <VCardItem class="flex-none">
        <VCardTitle>{{ t('dialog.downloadHistory.title') }}</VCardTitle>
      </VCardItem>
      <VDivider class="flex-none" />
      <VDialogCloseBtn @click="emit('close')" />

      <VInfiniteScroll
        v-if="!isRefreshed || historyList.length > 0"
        mode="intersect"
        side="end"
        :items="historyList"
        class="download-history-dialog__scroll"
        @load="loadHistory"
      >
        <template #loading>
          <LoadingBanner />
        </template>
        <template #error="{ props: retryProps }">
          <div class="d-flex flex-column align-center ga-2 py-4" role="alert">
            <span class="text-medium-emphasis">{{ t('dialog.downloadHistory.loadFailed') }}</span>
            <VBtn v-bind="retryProps" prepend-icon="mdi-refresh" size="small" variant="tonal">
              {{ t('common.retry') }}
            </VBtn>
          </div>
        </template>
        <template #empty />

        <VList lines="three" class="download-history-dialog__content py-0">
          <VVirtualScroll v-if="historyList.length > 0" :renderless="true" :items="historyList" :item-height="120">
            <template #default="{ item, ...slotProps }">
              <div :ref="'itemRef' in slotProps ? slotProps.itemRef : undefined">
                <VListItem class="download-history-item">
                  <template #prepend>
                    <VImg
                      height="96"
                      width="64"
                      :src="getHistoryImage(item)"
                      aspect-ratio="2/3"
                      class="download-history-item__image me-3 rounded-md"
                      cover
                      position="center"
                    >
                      <template #placeholder>
                        <VSkeletonLoader class="h-100 w-100" />
                      </template>
                    </VImg>
                  </template>

                  <VListItemTitle class="download-history-item__title">
                    {{ getHistoryTitle(item) }}
                    <span v-if="item.year" class="text-body-2 text-medium-emphasis">({{ item.year }})</span>
                  </VListItemTitle>
                  <div v-if="getSeasonEpisode(item) || item.torrent_site" class="download-history-item__chips mt-1">
                    <VChip v-if="getSeasonEpisode(item)" color="primary" size="x-small" variant="tonal">
                      {{ getSeasonEpisode(item) }}
                    </VChip>
                    <VChip v-if="item.torrent_site" color="info" size="x-small" variant="tonal">
                      {{ item.torrent_site }}
                    </VChip>
                  </div>
                  <VListItemSubtitle
                    v-if="item.torrent_name"
                    class="download-history-item__torrent download-history-item__meta mt-1"
                  >
                    {{ item.torrent_name }}
                  </VListItemSubtitle>
                  <VListItemSubtitle
                    v-if="item.date"
                    class="download-history-item__date download-history-item__meta mt-1"
                  >
                    {{ formatDateDifference(item.date) }}
                  </VListItemSubtitle>

                  <template #append>
                    <IconBtn :aria-label="t('dialog.downloadHistory.actions')">
                      <VIcon icon="mdi-dots-vertical" />
                      <VMenu activator="parent" close-on-content-click>
                        <VList>
                          <VListItem base-color="error" @click="deleteHistory(item)">
                            <template #prepend>
                              <VIcon icon="mdi-delete" />
                            </template>
                            <VListItemTitle>{{ t('common.delete') }}</VListItemTitle>
                          </VListItem>
                        </VList>
                      </VMenu>
                    </IconBtn>
                  </template>
                </VListItem>
              </div>
            </template>
          </VVirtualScroll>
        </VList>
      </VInfiniteScroll>

      <VCardText v-else class="download-history-empty flex-grow-1">
        <VIcon class="download-history-empty__icon" icon="mdi-download-off-outline" size="30" />
        <div class="download-history-empty__headline">
          {{ t('dialog.downloadHistory.noData') }}
        </div>
        <div class="download-history-empty__description">
          {{ t('dialog.downloadHistory.noDataHint') }}
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.download-history-dialog {
  block-size: 100%;
  overflow: hidden !important;
}

.download-history-dialog__scroll {
  flex: 1 1 0;
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.download-history-dialog__content {
  overflow: visible !important;
}

.download-history-item {
  min-block-size: 7rem;
  padding-block: 0.5rem !important;
}

.download-history-item__image {
  flex: none;
}

.download-history-item__title {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
}

.download-history-item__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.download-history-item__torrent {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  white-space: normal;
}

.download-history-item__meta {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)) !important;
  opacity: 1;
}

.download-history-item__date {
  font-size: 0.75rem;
  line-height: 1.3;
}

.download-history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-block-size: 13rem;
  padding-block: 2.5rem !important;
  padding-inline: 1.5rem !important;
  text-align: center;
}

.download-history-empty__icon {
  color: rgb(var(--v-theme-primary));
}

.download-history-empty__headline {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1rem;
  font-weight: 600;
}

.download-history-empty__description {
  max-inline-size: 22rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

@media (width <= 600px) {
  .download-history-item {
    min-block-size: 6.5rem;
  }

  .download-history-item__image {
    block-size: 84px !important;
    inline-size: 56px !important;
  }
}
</style>
