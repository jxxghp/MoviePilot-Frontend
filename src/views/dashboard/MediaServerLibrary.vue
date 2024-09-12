<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerLibrary } from '@/api/types'
import LibraryCard from '@/components/cards/LibraryCard.vue'

// 媒体库列表
const libraryList = ref<MediaServerLibrary[]>([])

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
async function loadLibrary(server: string) {
  try {
    const result: MediaServerLibrary[] = await api.get('mediaserver/library', {
      params: { server: server, hidden: true },
    })
    if (result && result.length > 0) {
      libraryList.value = libraryList.value.concat(result)
    }
  } catch (e) {
    console.log(e)
  }
}

onMounted(async () => {
  await loadMediaServerSetting()
  for (const server of mediaServers.value) {
    loadLibrary(server.name)
  }
})
</script>

<template>
  <VHover v-if="libraryList.length > 0">
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>我的媒体库</VCardTitle>
        </VCardItem>
        <div class="grid gap-4 grid-backdrop-card mx-3" tabindex="0">
          <LibraryCard v-for="item in libraryList" :key="item.id" :media="item" height="10rem" />
        </div>
      </VCard>
    </template>
  </VHover>
</template>
