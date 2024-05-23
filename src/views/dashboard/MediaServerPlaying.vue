<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'

// 继续播放列表
const playingList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadPlayingList() {
  try {
    playingList.value = await api.get('mediaserver/playing')
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadPlayingList()
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
          <VCardTitle>继续观看</VCardTitle>
        </VCardItem>

        <div v-if="playingList.length > 0" class="grid gap-4 grid-backdrop-card mx-3" tabindex="0">
          <BackdropCard v-for="data in playingList" :key="data.id" :media="data" height="10rem" />
        </div>
      </VCard>
    </template>
  </VHover>
</template>
