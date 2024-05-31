<script setup lang="ts">
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import type { DownloaderInfo } from '@/api/types'

// 定时器
let refreshTimer: NodeJS.Timeout | null = null

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
  try {
    const res: DownloaderInfo = await api.get('dashboard/downloader')

    downloadInfo.value = res
    infoItems.value = [
      {
        avatar: 'mdi-cloud-upload',
        title: '总上传量',
        amount: formatFileSize(res.upload_size),
      },
      {
        avatar: 'mdi-download-box',
        title: '总下载量',
        amount: formatFileSize(res.download_size),
      },
      {
        avatar: 'mdi-content-save',
        title: '磁盘剩余空间',
        amount: formatFileSize(res.free_space),
      },
    ]
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadDownloaderInfo()

  // 启动定时器
  refreshTimer = setInterval(() => {
    loadDownloaderInfo()
  }, 3000)
})

// 组件卸载时停止定时器
onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>实时速率</VCardTitle>
        </VCardItem>

        <VCardText class="pt-4">
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
}
</style>
