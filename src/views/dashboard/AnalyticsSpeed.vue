<script setup lang="ts">
import api from '@/api'
import type { DownloaderInfo } from '@/api/types'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

// 下载器信息
const downloadInfo = ref<DownloaderInfo>({
  // 下载速度
  download_speed: 0,

  // 上传速度
  upload_speed: 0,

  // 下载量
  download_size: 0,

  // 上传量
  upload_size: 0,

  // 剩余空间
  free_space: 0,
})

const animatedUploadSpeed = useAnimatedDashboardNumber(computed(() => downloadInfo.value.upload_speed), {
  duration: 520,
})

const animatedDownloadSpeed = useAnimatedDashboardNumber(computed(() => downloadInfo.value.download_speed), {
  duration: 520,
})

const animatedUploadSize = useAnimatedDashboardNumber(computed(() => downloadInfo.value.upload_size), {
  delay: 80,
  duration: 760,
})

const animatedDownloadSize = useAnimatedDashboardNumber(computed(() => downloadInfo.value.download_size), {
  delay: 130,
  duration: 760,
})

const animatedFreeSpace = useAnimatedDashboardNumber(computed(() => downloadInfo.value.free_space), {
  delay: 180,
  duration: 760,
})

const uploadSpeedText = computed(() => `${formatDashboardFileSize(animatedUploadSpeed.value, 2, downloadInfo.value.upload_speed)}/s`)
const downloadSpeedText = computed(() => `${formatDashboardFileSize(animatedDownloadSpeed.value, 2, downloadInfo.value.download_speed)}/s`)

// 显示项
const infoItems = computed(() => [
  {
    avatar: 'mdi-cloud-upload',
    title: t('dashboard.speed.totalUpload'),
    amount: formatDashboardFileSize(animatedUploadSize.value, 2, downloadInfo.value.upload_size),
  },
  {
    avatar: 'mdi-download-box',
    title: t('dashboard.speed.totalDownload'),
    amount: formatDashboardFileSize(animatedDownloadSize.value, 2, downloadInfo.value.download_size),
  },
  {
    avatar: 'mdi-content-save',
    title: t('dashboard.speed.freeSpace'),
    amount: formatDashboardFileSize(animatedFreeSpace.value, 2, downloadInfo.value.free_space),
  },
])

// 调用API查询下载器数据
async function loadDownloaderInfo() {
  if (!props.allowRefresh) {
    return
  }

  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader')

    downloadInfo.value = {
      download_speed: Number(res.download_speed) || 0,
      upload_speed: Number(res.upload_speed) || 0,
      download_size: Number(res.download_size) || 0,
      upload_size: Number(res.upload_size) || 0,
      free_space: Number(res.free_space) || 0,
    }
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
const { loading } = useDataRefresh(
  'analytics-speed',
  loadDownloaderInfo,
  3000, // 3秒间隔
  true // 立即执行
)
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.realTimeSpeed') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <div class="dashboard-speed-overview">
        <div class="dashboard-speed-rate">
          <VIcon icon="mdi-arrow-up" color="primary" size="26" />
          <strong class="dashboard-speed-number">{{ uploadSpeedText }}</strong>
          <span>{{ t('dashboard.uploadSpeed') }}</span>
        </div>
        <div class="dashboard-speed-rate">
          <VIcon icon="mdi-arrow-down" color="primary" size="26" />
          <strong class="dashboard-speed-number">{{ downloadSpeedText }}</strong>
          <span>{{ t('dashboard.downloadSpeed') }}</span>
        </div>
      </div>
      <VDivider class="my-3" />
      <VList class="card-list">
        <VListItem v-for="item in infoItems" :key="item.title">
          <template #prepend>
            <VIcon rounded :icon="item.avatar" />
          </template>

          <VListItemTitle class="text-sm font-weight-medium mb-1">
            {{ item.title }}
          </VListItemTitle>

          <template #append>
            <div>
              <h6 class="dashboard-speed-number text-sm font-weight-medium mb-2">
                {{ item.amount }}
              </h6>
            </div>
          </template>
        </VListItem>
      </VList>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-work-card {
  display: flex;
  flex-direction: column;
  block-size: auto;
  min-block-size: 0;
}

.card-list {
  --v-card-list-gap: 0.15rem;

  flex: 1 1 auto;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
}

.dashboard-speed-number {
  font-variant-numeric: tabular-nums;
}

.dashboard-speed-overview {
  display: grid;
  gap: 0.6rem;
}

.dashboard-speed-rate {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
}

.dashboard-speed-rate strong {
  font-size: 1.35rem;
  line-height: 1.5;
}

.dashboard-speed-rate span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
}

</style>
