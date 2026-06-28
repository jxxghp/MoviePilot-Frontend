<script lang="ts" setup>
import type { PropType } from 'vue'
import { formatFileSize, formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Context } from '@/api/types'
import { getCachedSiteIcon } from '@/utils/siteIconCache'
import { downloadedTorrentMap, markTorrentDownloaded } from '@/utils/torrentDownloadCache'
import { openSharedDialog } from '@/composables/useSharedDialog'

const AddDownloadDialog = defineAsyncComponent(() => import('../dialog/AddDownloadDialog.vue'))

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
})

// 种子信息
const torrent = ref(props.torrent?.torrent_info)

// 媒体信息
const media = ref(props.torrent?.media_info)

// 识别元数据
const meta = ref(props.torrent?.meta_info)

// 站点图标
const siteIcon = ref('')

const isDownloaded = computed(() => Boolean(torrent.value?.enclosure && downloadedTorrentMap[torrent.value.enclosure]))

// 查询站点图标
async function getSiteIcon() {
  if (!torrent?.value?.site) {
    return
  }

  try {
    siteIcon.value = await getCachedSiteIcon(torrent.value.site, async () => {
      try {
        const response = await api.get(`site/icon/${torrent.value?.site}`)

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

// 获取优惠类型样式
function getPromotionClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'bg-success'
  if (downloadVolumeFactor === 0) return 'bg-success'
  else if (downloadVolumeFactor < 1) return 'bg-orange'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'bg-purple'
  else return ''
}

// 获取优惠标签类
function getPromotionChipClass(downloadVolumeFactor: number | undefined, uploadVolumeFactor: number | undefined) {
  if (!downloadVolumeFactor) return 'chip-free'
  if (downloadVolumeFactor === 0) return 'chip-free'
  else if (downloadVolumeFactor < 1) return 'chip-discount'
  else if (uploadVolumeFactor !== undefined && uploadVolumeFactor > 1) return 'chip-bonus'
  else return ''
}

// 询问并添加下载
async function handleAddDownload() {
  // 打开下载对话框
  openSharedDialog(
    AddDownloadDialog,
    {
      title: `${media.value?.title_year || meta.value?.name} ${meta.value?.season_episode || ''}`,
      media: media.value,
      torrent: torrent.value,
    },
    {
      done: addDownloadSuccess,
      error: addDownloadError,
    },
    { closeOn: ['close', 'done', 'error'] },
  )
}

// 添加下载成功
function addDownloadSuccess(url: string) {
  markTorrentDownloaded(url)
}

// 添加下载失败
function addDownloadError(error: string) {
  console.error(error)
}

// 打开种子详情页面
function openTorrentDetail() {
  window.open(torrent.value?.page_url, '_blank')
}

watch(
  () => props.torrent,
  value => {
    torrent.value = value?.torrent_info
    media.value = value?.media_info
    meta.value = value?.meta_info
    getSiteIcon()
  },
  { immediate: true },
)
</script>

<template>
  <!-- Hover 命中区域保持静止，避免列表项上浮后底边反复触发 mouseleave。 -->
  <div class="torrent-item-hover-area w-100">
    <VListItem
      :value="props.torrent?.torrent_info?.enclosure"
      class="app-hover-lift-card pa-3 mb-2 rounded torrent-item overflow-hidden"
      :class="{ 'border-start border-success border-3 opacity-85': isDownloaded }"
      @click="handleAddDownload"
    >
      <!-- 优惠标签 -->
      <div
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        class="discount-banner text-white px-2 py-1 text-sm font-weight-bold rounded-bl-lg"
        :class="getPromotionClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
      >
        {{ torrent?.volume_factor }}
      </div>

      <template v-slot:prepend>
        <div class="d-flex flex-column align-center pr-3" :title="torrent?.site_name">
          <VImg
            v-if="siteIcon"
            :src="siteIcon"
            :alt="torrent?.site_name"
            class="rounded mb-1 site-icon"
            width="32"
            height="32"
          />
          <VAvatar
            v-else
            size="32"
            class="mb-1 text-caption bg-primary-lighten-4 text-primary font-weight-bold site-icon"
          >
            {{ torrent?.site_name?.substring(0, 1) }}
          </VAvatar>
        </div>
      </template>

      <VListItemTitle class="whitespace-normal">
        <div class="d-flex flex-row flex-wrap align-center mb-2">
          <span class="text-h6 font-weight-bold me-2">{{ media?.title ?? meta?.name }}</span>
          <VChip
            v-if="meta?.season_episode"
            class="chip-season rounded-sm font-weight-bold"
            variant="elevated"
            size="small"
          >
            {{ meta?.season_episode }}
          </VChip>
        </div>

        <div class="text-subtitle-2 font-weight-medium mb-2 break-all" :title="torrent?.title">
          {{ torrent?.title }}
        </div>

        <div
          class="text-body-2 text-medium-emphasis mb-2 break-all"
          :title="meta?.subtitle || torrent?.description || '暂无描述'"
        >
          {{ meta?.subtitle || torrent?.description || '暂无描述' }}
        </div>

        <!-- 发布时间 -->
        <div v-if="torrent?.pubdate" class="d-flex align-center mb-2">
          <VIcon size="small" color="grey" icon="mdi-clock-outline" class="me-1"></VIcon>
          <span class="text-sm text-medium-emphasis">{{ formatDateDifference(torrent.pubdate) }}</span>
        </div>

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
          <VChip v-if="torrent?.hit_and_run" class="chip-hr rounded-sm" size="x-small" variant="elevated"> H&R </VChip>
          <VChip v-if="torrent?.freedate_diff" class="chip-expire rounded-sm" size="x-small" variant="elevated">
            {{ torrent?.freedate_diff }}
          </VChip>
        </div>
      </VListItemTitle>

      <template v-slot:append>
        <div class="d-flex flex-column align-end gap-2">
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

          <div class="d-flex align-center">
            <VChip v-if="torrent?.size" color="primary" size="x-small" variant="elevated" class="rounded-sm mr-2">
              {{ formatFileSize(torrent.size) }}
            </VChip>

            <VBtn icon size="small" variant="text" color="primary" @click.stop="openTorrentDetail">
              <VIcon icon="mdi-information-outline"></VIcon>
            </VBtn>
          </div>
        </div>
      </template>
    </VListItem>
  </div>
</template>

<style scoped>
.discount-banner {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-end: 0;
}

.torrent-item-hover-area {
  inline-size: 100%;
}

.torrent-item {
  border: var(--app-card-light-border);
}

.torrent-item-hover-area:hover .torrent-item {
  border-color: rgba(var(--v-theme-primary), 0.3);
  transform: translate3d(0, -0.25rem, 0);
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

.site-icon {
  transition: transform 0.2s ease;
}

.site-icon:hover {
  transform: scale(1.1);
}
</style>
