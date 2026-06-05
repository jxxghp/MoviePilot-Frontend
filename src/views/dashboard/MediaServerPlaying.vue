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
  <VHover v-if="playingList.length > 0">
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>{{ t('dashboard.playing') }}</VCardTitle>
        </VCardItem>

        <div class="dashboard-card-grid-wrap">
          <ProgressiveCardGrid
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
  </VHover>
</template>

<style scoped>
.dashboard-card-grid-wrap {
  /* 用内边距提供卡片留白，避免 100% 宽度网格叠加横向外边距后在 iOS 小屏溢出。 */
  padding: 0 0.75rem 0.75rem;
}
</style>
