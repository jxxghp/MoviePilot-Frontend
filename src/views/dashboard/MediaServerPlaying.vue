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
  <VCard>
    <VCardItem>
      <VCardTitle class="cursor-move">继续观看</VCardTitle>
    </VCardItem>

    <div v-if="playingList.length > 0" class="grid gap-4 grid-backdrop-card mx-3" tabindex="0">
      <BackdropCard v-for="data in playingList" :key="data.id" :media="data" height="10rem" />
    </div>
  </VCard>
</template>

<style lang="scss">
.grid-backdrop-card {
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  padding-block-end: 1rem;
}
</style>
