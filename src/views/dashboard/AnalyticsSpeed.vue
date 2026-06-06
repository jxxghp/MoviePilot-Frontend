<script setup lang="ts">
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import type { DownloaderInfo } from '@/api/types'
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

// 显示项
const infoItems = ref([
  {
    avatar: '',
    title: '',
    amount: '',
  },
])

// 调用API查询下载器数据
async function loadDownloaderInfo() {
  if (!props.allowRefresh) {
    return
  }

  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader')

    downloadInfo.value = res
    infoItems.value = [
      {
        avatar: 'mdi-cloud-upload',
        title: t('dashboard.speed.totalUpload'),
        amount: formatFileSize(res.upload_size),
      },
      {
        avatar: 'mdi-download-box',
        title: t('dashboard.speed.totalDownload'),
        amount: formatFileSize(res.download_size),
      },
      {
        avatar: 'mdi-content-save',
        title: t('dashboard.speed.freeSpace'),
        amount: formatFileSize(res.free_space),
      },
    ]
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
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props" class="dashboard-work-card">
        <VCardItem>
          <VCardTitle>{{ t('dashboard.realTimeSpeed') }}</VCardTitle>
        </VCardItem>

        <VCardText class="dashboard-work-content pt-4">
          <div>
            <p class="text-h5 me-2">↑{{ formatFileSize(downloadInfo.upload_speed) }}/s</p>
            <p class="text-h4 me-2">↓{{ formatFileSize(downloadInfo.download_speed) }}/s</p>
          </div>
          <VList class="card-list mt-9">
            <VListItem v-for="item in infoItems" :key="item.title">
              <template #prepend>
                <VIcon rounded :icon="item.avatar" />
              </template>

              <VListItemTitle class="text-sm font-weight-medium mb-1">
                {{ item.title }}
              </VListItemTitle>

              <template #append>
                <div>
                  <h6 class="text-sm font-weight-medium mb-2">
                    {{ item.amount }}
                  </h6>
                </div>
              </template>
            </VListItem>
          </VList>
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1rem;

  flex: 1 1 auto;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}
</style>
