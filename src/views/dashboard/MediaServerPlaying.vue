<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 继续播放列表
const playingList = ref<MediaServerPlayItem[]>([])

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API查询
async function loadPlayingList(server: string) {
  try {
    const result: MediaServerPlayItem[] = await api.get('mediaserver/playing', { params: { server } })
    if (result && result.length > 0) {
      // 不存在时添加
      for (const item of result) {
        const index = playingList.value.findIndex(i => i.id === item.id)
        if (index === -1) {
          playingList.value.push(item)
        }
      }
    }
  } catch (e) {
    console.log(e)
  }
}

// 加载数据
async function loadData() {
  await loadMediaServerSetting()
  const enabledServers = mediaServers.value.filter(server => server.enabled)
  for (const server of enabledServers) {
    loadPlayingList(server.name)
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
  <VCard v-if="playingList.length > 0" class="dashboard-media-card">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.playing') }}</VCardTitle>
    </VCardItem>

    <div class="px-5 pb-3">
      <ProgressiveCardGrid
        class="dashboard-media-grid"
        :items="playingList"
        :get-item-key="item => item.id || item.link || item.title"
        :min-item-width="240"
        :estimated-item-height="160"
        tabindex="0"
      >
        <template #default="{ item }">
          <BackdropCard :media="item" height="10rem" />
        </template>
      </ProgressiveCardGrid>
    </div>
  </VCard>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-media-grid {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-media-grid :deep(.progressive-card-grid__track) {
  min-block-size: 100%;
}
</style>
