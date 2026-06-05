<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  <div>
    <VHover v-for="(data, name) in latestList" :key="name">
      <template #default="hover">
        <VCard v-bind="hover.props">
          <VCardItem>
            <template #append>
              <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
            </template>
            <VCardTitle>{{ t('dashboard.latest') }} - {{ name }}</VCardTitle>
          </VCardItem>

          <div class="dashboard-card-grid-wrap">
            <ProgressiveCardGrid
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
      </template>
    </VHover>
  </div>
</template>

<style scoped>
.dashboard-card-grid-wrap {
  /* 用内边距提供卡片留白，避免 100% 宽度网格叠加横向外边距后在 iOS 小屏溢出。 */
  padding: 0 0.75rem 0.75rem;
}
</style>
