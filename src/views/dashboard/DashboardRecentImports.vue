<script setup lang="ts">
import api from '@/api'
import type { TransferHistory } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 最近成功整理入库的记录。
const recentImports = ref<TransferHistory[]>([])

/** 查询最近成功整理的媒体记录。 */
async function loadRecentImports() {
  try {
    const response: { data?: { list?: TransferHistory[] } } = await api.get('history/transfer', {
      params: { page: 1, count: 5, status: true },
    })
    recentImports.value = response.data?.list ?? []
  } catch (error) {
    console.error(error)
  }
}

/** 返回经过后端图片代理的海报地址。 */
function getPosterUrl(item: TransferHistory) {
  if (!item.image) return noImage

  return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(item.image)}`
}

/** 组合媒体类型、季集和文件大小作为记录副标题。 */
function getImportMeta(item: TransferHistory) {
  const values = [item.type, item.seasons, item.episodes]
  const fileSize = Number(item.src_fileitem?.size ?? 0)
  if (fileSize > 0) values.push(formatFileSize(fileSize))

  return values.filter(Boolean).join(' · ')
}

onMounted(loadRecentImports)
onActivated(loadRecentImports)
</script>

<template>
  <VCard class="dashboard-list-card dashboard-grid-fill">
    <VCardItem class="dashboard-card-heading">
      <VCardTitle>{{ t('dashboard.recentImports') }}</VCardTitle>
      <template #append>
        <VBtn size="small" variant="outlined" to="/history">{{ t('dashboard.viewAll') }}</VBtn>
      </template>
    </VCardItem>

    <VCardText class="recent-import-list">
      <div v-for="item in recentImports" :key="item.id" class="recent-import-item">
        <VImg :src="getPosterUrl(item)" :alt="item.title" class="recent-import-poster" cover />
        <div class="recent-import-copy">
          <div class="recent-import-title">{{ item.title }}<span v-if="item.year"> ({{ item.year }})</span></div>
          <div class="recent-import-meta">{{ getImportMeta(item) }}</div>
        </div>
        <div class="recent-import-time">
          {{ item.date ? formatDateDifference(item.date) : '' }}
          <VIcon icon="mdi-check-circle" color="success" size="16" />
        </div>
      </div>

      <div v-if="recentImports.length === 0" class="recent-import-empty text-medium-emphasis">
        <VIcon icon="mdi-movie-open-plus-outline" size="32" />
        <span>{{ t('dashboard.noRecentImports') }}</span>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-list-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 350px;
}

.dashboard-card-heading {
  padding-block: 0.9rem 0.55rem;
}

.recent-import-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  padding-block-start: 0.25rem;
}

.recent-import-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  min-block-size: 62px;
  padding-block: 0.4rem;
}

.recent-import-item + .recent-import-item {
  border-block-start: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7));
}

.recent-import-poster {
  border-radius: 6px;
  block-size: 54px;
  inline-size: 40px;
}

.recent-import-copy {
  min-inline-size: 0;
}

.recent-import-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-meta,
.recent-import-time {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
}

.recent-import-meta {
  overflow: hidden;
  margin-block-start: 0.2rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-import-time {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

.recent-import-empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
