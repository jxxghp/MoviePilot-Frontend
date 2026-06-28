<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))
const TorrentMoreSourcesDialog = defineAsyncComponent(() => import('../dialog/TorrentMoreSourcesDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
  more: Array as PropType<Context[]>,
  width: String,
  height: String,
})

// 种子信息
const torrent = ref(props.torrent?.torrent_info)

// 媒体信息
const media = ref(props.torrent?.media_info)

// 识别元数据
const meta = ref(props.torrent?.meta_info)

// 当前下载项
const downloadItem = ref(props.torrent)

// 站点图标
const siteIcons = ref<Record<number, string>>({})

const isDownloaded = computed(() => Boolean(torrent.value?.enclosure && downloadedTorrentMap[torrent.value.enclosure]))

// 添加下载成功
function addDownloadSuccess(url: string) {
  markTorrentDownloaded(url)
}

// 添加下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 查询站点图标
async function getSiteIcon(site: number | undefined) {
  if (!site) return

  try {
    siteIcons.value[site] = await getCachedSiteIcon(site, async () => {
      try {
        const response = await api.get(`site/icon/${site}`)

        return response?.data?.icon || ''
      } catch (error) {
        console.error(error)
        return ''
      }
    })
  } catch (error) {
    console.error(error)
    siteIcons.value[site] = ''
  }
}

// 询问并添加下载
async function handleAddDownload(item: Context | null = null) {
  if (item && !isNullOrEmptyObject(item)) {
    downloadItem.value = item
  }
  // 打开下载对话框
  openSharedDialog(
    AddDownloadDialog,
    {
      title: `${downloadItem.value?.media_info?.title_year || downloadItem.value?.meta_info?.name} ${
        downloadItem.value?.meta_info?.season_episode
      }`,
      media: downloadItem.value?.media_info,
      torrent: downloadItem.value?.torrent_info,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

// 打开种子详情页面
function openTorrentDetail(item: Context | null = null) {
  if (item && !isNullOrEmptyObject(item) && !isNullOrEmptyObject(item.torrent_info)) {
    window.open(item.torrent_info.page_url, '_blank')
    return
  }
  window.open(torrent.value?.page_url, '_blank')
}

// 下载种子文件
async function downloadTorrentFile() {
  window.open(torrent.value?.enclosure, '_blank')
}

// 获取优惠类型样式
function getPromotionClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'bg-success'
  if (downloadVolumeFactor === 0) return 'bg-success'
  else if (downloadVolumeFactor < 1) return 'bg-orange'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'bg-purple'
  else return ''
}

// 打开更多来源对话框
async function openMoreTorrentsDialog() {
  props.more?.forEach(t => {
    return getSiteIcon(t.torrent_info?.site)
  })
  openSharedDialog(
    TorrentMoreSourcesDialog,
    {
      items: props.more || [],
      siteIcons: siteIcons.value,
    },
    {
      download: handleAddDownload,
      detail: openTorrentDetail,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

watch(
  () => props.torrent,
  value => {
    torrent.value = value?.torrent_info
    media.value = value?.media_info
    meta.value = value?.meta_info
    downloadItem.value = value
    getSiteIcon(value?.torrent_info?.site)
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
  <div class="torrent-card-hover-area h-full">
    <VCard
      :width="props.width || '100%'"
      :variant="isDownloaded ? 'outlined' : 'flat'"
      @click="handleAddDownload(props.torrent)"
      class="app-hover-lift-card h-full cursor-pointer d-flex flex-column overflow-hidden torrent-card"
      :class="{ 'border-success border-2 opacity-85': isDownloaded }"
      hover
    >
      <!-- 优惠标签 -->
      <div
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        class="discount-banner text-white px-2 py-1 text-sm font-weight-bold rounded-bl-lg"
        :class="getPromotionClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
      >
        {{ torrent?.volume_factor }}
      </div>

      <!-- 媒体标题 -->
      <VCardItem class="pt-3 pb-0">
        <div class="d-flex flex-row flex-wrap justify-start align-center mb-2 pr-8">
          <span class="text-h6 font-weight-bold me-2">
            {{ media?.title ?? meta?.name }}
          </span>
          <VChip
            v-if="meta?.season_episode"
            class="chip-season rounded-sm font-weight-bold"
            variant="elevated"
            size="small"
          >
            {{ meta?.season_episode }}
          </VChip>
        </div>

        <!-- 站点信息条 -->
        <div class="d-flex justify-space-between align-center flex-wrap">
          <div class="d-flex align-center">
            <VImg
              v-if="siteIcons[torrent?.site || 0]"
              :src="siteIcons[torrent?.site || 0]"
              :alt="torrent?.site_name"
              class="mr-2 rounded"
              width="20"
              height="20"
            />
            <VAvatar v-else size="20" class="mr-2 text-caption bg-surface-variant" color="surface-variant">
              {{ torrent?.site_name?.substring(0, 1) }}
            </VAvatar>
            <span class="font-weight-bold text-body-2">{{ torrent?.site_name }}</span>
          </div>

          <div class="d-flex align-center gap-3">
            <span v-if="torrent?.seeders" class="d-flex align-center font-weight-bold">
              <VIcon size="small" color="success" icon="mdi-arrow-up" class="mr-1"></VIcon>
              {{ torrent?.seeders }}
            </span>
            <span v-if="torrent?.peers" class="d-flex align-center font-weight-bold">
              <VIcon size="small" color="warning" icon="mdi-arrow-down" class="mr-1"></VIcon>
              {{ torrent?.peers }}
            </span>
          </div>
        </div>
      </VCardItem>

      <!-- 种子内容 -->
      <VCardText class="d-flex flex-column flex-grow-1 pa-3 overflow-hidden">
        <!-- 种子标题 -->
        <div class="text-subtitle-2 text-high-emphasis font-weight-medium mb-1 break-all" :title="torrent?.title">
          {{ torrent?.title }}
        </div>

        <!-- 种子描述 -->
        <div
          v-if="meta?.subtitle || torrent?.description"
          class="text-body-2 text-medium-emphasis mb-2 break-all"
          :title="meta?.subtitle || torrent?.description"
        >
          {{ meta?.subtitle || torrent?.description }}
        </div>

        <!-- 发布时间 -->
        <div v-if="torrent?.pubdate" class="d-flex align-center justify-start mb-2">
          <VIcon size="small" color="grey" icon="mdi-clock-outline" class="me-1"></VIcon>
          <span class="text-sm text-medium-emphasis">{{ formatDateDifference(torrent.pubdate) }}</span>
        </div>

        <!-- 资源标签区 -->
        <div class="d-flex flex-wrap gap-1 mb-2">
          <!-- 流媒体平台 -->
          <VChip v-if="meta?.web_source" class="chip-web-source rounded-sm" size="x-small" variant="elevated">
            {{ meta?.web_source }}
          </VChip>

          <!-- 版本标签 -->
          <VChip v-if="meta?.edition" class="chip-edition rounded-sm" size="x-small" variant="elevated">
            {{ meta?.edition }}
          </VChip>

          <!-- 分辨率标签 -->
          <VChip v-if="meta?.resource_pix" class="chip-resolution rounded-sm" size="x-small" variant="elevated">
            {{ meta?.resource_pix }}
          </VChip>

          <!-- 编码标签 -->
          <VChip v-if="meta?.video_encode" class="chip-codec rounded-sm" size="x-small" variant="elevated">
            {{ meta?.video_encode }}
          </VChip>

          <!-- 制作组标签 -->
          <VChip v-if="meta?.resource_team" class="chip-team rounded-sm" size="x-small" variant="elevated">
            {{ meta?.resource_team }}
          </VChip>

          <!-- 其他标签 -->
          <VChip
            v-for="(label, index) in torrent?.labels"
            :key="index"
            class="chip-label rounded-sm"
            size="x-small"
            variant="elevated"
          >
            {{ label }}
          </VChip>

          <!-- 特殊标签 -->
          <VChip v-if="torrent?.hit_and_run" class="chip-hr rounded-sm" size="x-small" variant="elevated">H&R</VChip>
          <VChip v-if="torrent?.freedate_diff" class="chip-expire rounded-sm" size="x-small" variant="elevated">
            {{ torrent?.freedate_diff }}
          </VChip>
        </div>
      </VCardText>

      <!-- 卡片底部信息 -->
      <VCardActions class="border-t border-opacity-10 mt-auto pa-2">
        <div v-if="props.more && props.more.length > 0">
          <VBtn
            variant="text"
            color="primary"
            size="small"
            class="pa-1 d-flex align-center"
            @click.stop="openMoreTorrentsDialog"
          >
            <VIcon icon="mdi-chevron-down" size="small" class="mr-1"></VIcon>
            更多来源 ({{ props.more.length }})
          </VBtn>
        </div>

        <VSpacer />

        <!-- 体积和详情按钮并排 -->
        <div class="d-flex align-center">
          <VChip v-if="torrent?.size" color="primary" size="x-small" variant="elevated" class="rounded-sm mr-2">
            {{ formatFileSize(torrent.size) }}
          </VChip>
          <VBtn icon size="small" variant="text" color="primary" @click.stop="openTorrentDetail()">
            <VIcon icon="mdi-information-outline"></VIcon>
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </div>
</template>

<style scoped>
.discount-banner {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.torrent-card-hover-area {
  inline-size: 100%;
}

/* 卡片悬停效果 */
.torrent-card {
  border: var(--app-card-light-border);
}

.torrent-card-hover-area:hover .torrent-card {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
}

/* 优惠标签样式 */
.bg-success {
  background-color: #4caf50;
}

.bg-orange {
  background-color: #ff5722;
}

.bg-purple {
  background-color: #9c27b0;
}

.chip-season {
  background-color: #3f51b5;
  color: white;
}

.chip-web-source {
  background-color: #8000ff;
  color: white;
}

.chip-edition {
  background-color: #f44336;
  color: white;
}

.chip-resolution {
  background-color: #7b1fa2;
  color: white;
}

.chip-codec {
  background-color: #ff9800;
  color: white;
}

.chip-team {
  background-color: #00897b;
  color: white;
}

.chip-label {
  background-color: #5c6bc0;
  color: white;
}

.chip-hr {
  background-color: #212121;
  color: white;
}

.chip-expire {
  background-color: #7e57c2;
  color: white;
}

.chip-free {
  background-color: #4caf50;
  color: white;
}

.chip-discount {
  background-color: #ff5722;
  color: white;
}

.chip-bonus {
  background-color: #9c27b0;
  color: white;
}
</style>
