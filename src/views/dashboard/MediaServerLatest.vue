<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PosterCard from '@/components/cards/PosterCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 最近入库列表
const latestList = ref<{ [key: string]: MediaServerPlayItem[] }>({})

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const response: { data: { value: MediaServerConf[] } } = await api.get('system/setting/MediaServers')
    mediaServers.value = response.data?.value ?? []
  } catch (error) {
    console.log(t('dashboard.errors.loadMediaServer'), error)
  }
}

// 调用API查询最近入库
async function loadLatest(server: string) {
  try {
    const response: MediaServerPlayItem[] = await api.get('mediaserver/latest', { params: { server } })
    // 仅在有数据时赋值
    if (response && response.length > 0) {
      latestList.value[server] = response
    }
  } catch (e) {
    console.log(t('dashboard.errors.loadLatest', { server }), e)
  }
}

// 加载数据
async function loadData() {
  await loadMediaServerSetting()
  const enabledServers = mediaServers.value.filter(server => server.enabled)
  for (const server of enabledServers) {
    loadLatest(server.name)
  }
}

onMounted(() => {
  loadData()
})

onActivated(() => {
  loadData()
})
</script>

<template>
  <div class="dashboard-media-stack" :class="{ 'dashboard-grid-fill': Object.keys(latestList).length > 0 }">
    <VCard v-for="(data, name) in latestList" :key="name" class="dashboard-work-card dashboard-media-card">
      <VCardItem>
        <VCardTitle>{{ t('dashboard.latest') }} - {{ name }}</VCardTitle>
      </VCardItem>

      <div class="dashboard-media-content px-5 pb-3">
        <ProgressiveCardGrid
          class="dashboard-media-grid"
          :items="data"
          :get-item-key="item => item.id || item.link || item.title"
          :min-item-width="144"
          :item-aspect-ratio="1.5"
          tabindex="0"
        >
          <template #default="{ item }">
            <PosterCard :media="item" />
          </template>
        </ProgressiveCardGrid>
      </div>
    </VCard>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-media-stack {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-stack > .dashboard-media-card {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-grid {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-media-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: auto;
}

.dashboard-media-content::-webkit-scrollbar {
  display: none;
}
</style>
