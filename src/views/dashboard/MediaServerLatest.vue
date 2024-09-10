<script setup lang="ts">
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
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API查询
async function loadLatest(server: string) {
  try {
    latestList.value[server] = await api.get('mediaserver/latest', { params: { server } })
  } catch (e) {
    console.log(e)
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
  <VHover v-for="(data, name) in latestList">
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
</template>
