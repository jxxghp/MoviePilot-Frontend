<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import type { SubtitleInfo } from '@/api/types'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedSubtitleMap, markSubtitleDownloaded } from '@/utils/subtitleDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useI18n } from 'vue-i18n'

const AddSubtitleDownloadDialog = defineAsyncComponent(() => import('../dialog/AddSubtitleDownloadDialog.vue'))

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  subtitle: Object as PropType<SubtitleInfo>,
  width: String,
})

// 字幕信息
const subtitle = ref(props.subtitle)

// 站点图标
const siteIcon = ref('')

const isDownloaded = computed(() => Boolean(subtitle.value?.enclosure && downloadedSubtitleMap[subtitle.value.enclosure]))

// 查询站点图标
async function getSiteIcon() {
  if (!subtitle.value?.site) {
    siteIcon.value = ''
    return
  }

  try {
    siteIcon.value = await getCachedSiteIcon(subtitle.value.site, async () => {
      try {
        const response = await api.get(`site/icon/${subtitle.value?.site}`)

        return response?.data?.icon || ''
      } catch (error) {
        console.error('Failed to load site icon:', error)
        return ''
      }
    })
  } catch (error) {
    console.error('Failed to load site icon:', error)
    siteIcon.value = ''
  }
}

// 添加字幕下载成功
function addDownloadSuccess(url: string) {
  markSubtitleDownloaded(url)
}

// 添加字幕下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 询问并下载字幕
async function handleAddDownload() {
  openSharedDialog(
    AddSubtitleDownloadDialog,
    {
      title: subtitle.value?.title,
      subtitle: subtitle.value,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

// 打开字幕详情页面
function openSubtitleDetail() {
  if (!subtitle.value?.page_url) return
  window.open(subtitle.value.page_url, '_blank')
}

// 打开字幕举报页面
function openReportPage() {
  if (!subtitle.value?.report_url) return
  window.open(subtitle.value.report_url, '_blank')
}

watch(
  () => props.subtitle,
  value => {
    subtitle.value = value
    getSiteIcon()
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="subtitle-card-hover-area h-full">
    <VCard
      :width="props.width || '100%'"
      :variant="isDownloaded ? 'outlined' : 'flat'"
      @click="handleAddDownload"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden subtitle-card"
      :class="{ 'border-success border-2 opacity-85': isDownloaded }"
      hover
    >
      <VCardItem class="pt-3 pb-0">
        <div class="d-flex justify-space-between align-center flex-wrap gap-2 mb-2">
          <div class="d-flex align-center min-w-0">
            <VImg
              v-if="siteIcon"
              :src="siteIcon"
              :alt="subtitle?.site_name"
              class="mr-2 rounded"
              width="20"
              height="20"
            />
            <VAvatar v-else size="20" class="mr-2 text-caption bg-surface-variant" color="surface-variant">
              {{ subtitle?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span class="font-weight-bold text-body-2 text-truncate">{{ subtitle?.site_name }}</span>
          </div>

          <div class="d-flex align-center gap-2">
            <VChip v-if="subtitle?.season_episode" size="x-small" color="secondary" variant="tonal" class="rounded-sm">
              {{ subtitle.season_episode }}
            </VChip>
            <VChip v-if="subtitle?.language" size="x-small" color="info" variant="tonal" class="rounded-sm">
              <VImg
                v-if="subtitle?.language_icon"
                :src="subtitle.language_icon"
                :alt="subtitle.language"
                width="14"
                height="14"
                class="me-1"
              />
              {{ subtitle.language }}
            </VChip>
            <VChip v-if="isDownloaded" size="x-small" color="success" variant="tonal" class="rounded-sm">
              {{ t('dialog.addSubtitleDownload.downloaded') }}
            </VChip>
          </div>
        </div>
      </VCardItem>

      <VCardText class="d-flex flex-column flex-grow-1 pa-3 overflow-hidden">
        <div class="text-subtitle-2 text-high-emphasis font-weight-medium mb-2 break-all" :title="subtitle?.title">
          {{ subtitle?.title }}
        </div>

        <div
          v-if="subtitle?.description"
          class="text-body-2 text-medium-emphasis mb-2 break-all"
          :title="subtitle?.description"
        >
          {{ subtitle.description }}
        </div>

        <div class="d-flex flex-wrap align-center gap-2 mb-2">
          <span v-if="subtitle?.pubdate || subtitle?.date_elapsed" class="d-flex align-center text-sm text-medium-emphasis">
            <VIcon size="small" color="grey" icon="mdi-clock-outline" class="me-1"></VIcon>
            {{ subtitle?.date_elapsed || formatDateDifference(subtitle.pubdate || '') }}
          </span>
          <span v-if="subtitle?.grabs !== undefined" class="d-flex align-center text-sm text-medium-emphasis">
            <VIcon size="small" color="primary" icon="mdi-download-outline" class="me-1"></VIcon>
            {{ subtitle.grabs }}
          </span>
          <span v-if="subtitle?.uploader" class="d-flex align-center text-sm text-medium-emphasis">
            <VIcon size="small" color="grey" icon="mdi-account-outline" class="me-1"></VIcon>
            {{ subtitle.uploader }}
          </span>
        </div>

        <div class="d-flex flex-wrap gap-1">
          <VChip v-if="subtitle?.torrent_id" size="x-small" variant="tonal" class="rounded-sm">
            TID {{ subtitle.torrent_id }}
          </VChip>
          <VChip v-if="subtitle?.subtitle_id" size="x-small" variant="tonal" class="rounded-sm">
            SID {{ subtitle.subtitle_id }}
          </VChip>
        </div>
      </VCardText>

      <VCardActions class="border-t border-opacity-10 mt-auto pa-2">
        <VChip v-if="subtitle?.size" color="primary" size="x-small" variant="elevated" class="rounded-sm">
          {{ formatFileSize(subtitle.size) }}
        </VChip>
        <VSpacer />
        <VBtn v-if="subtitle?.report_url" icon size="small" variant="text" color="warning" @click.stop="openReportPage">
          <VIcon icon="mdi-alert-outline"></VIcon>
        </VBtn>
        <VBtn v-if="subtitle?.page_url" icon size="small" variant="text" color="primary" @click.stop="openSubtitleDetail">
          <VIcon icon="mdi-information-outline"></VIcon>
        </VBtn>
      </VCardActions>
    </VCard>
  </div>
</template>

<style scoped>
.subtitle-card-hover-area {
  inline-size: 100%;
}

.subtitle-card {
  border: var(--app-card-light-border);
}

.subtitle-card-hover-area:hover .subtitle-card {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
}
</style>
