<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import PosterCard from '@/components/cards/PosterCard.vue'

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
    console.log('加载媒体服务器设置失败:', error)
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
    console.log(`加载媒体服务器 "${server}" 的最近入库失败:`, e)
  }
}

onMounted(async () => {
  await loadMediaServerSetting()
  for (const server of mediaServers.value) {
    loadLatest(server.name)
  }
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
            <VCardTitle>最近添加 - {{ name }}</VCardTitle>
          </VCardItem>

          <div class="grid gap-4 grid-media-card mx-3 mb-3" tabindex="0">
            <PosterCard v-for="item in data" :key="item.id" :media="item" />
          </div>
        </VCard>
      </template>
    </VHover>
  </div>
</template>
