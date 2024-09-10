<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'

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
      playingList.value = playingList.value.concat(result)
    }
  } catch (e) {
    console.log(e)
  }
}

onMounted(async () => {
  await loadMediaServerSetting()
  for (const server of mediaServers.value) {
    loadPlayingList(server.name)
  }
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
          <VCardTitle>继续观看</VCardTitle>
        </VCardItem>

        <div class="grid gap-4 grid-backdrop-card mx-3" tabindex="0">
          <BackdropCard v-for="item in playingList" :key="item.id" :media="item" height="10rem" />
        </div>
      </VCard>
    </template>
  </VHover>
</template>
