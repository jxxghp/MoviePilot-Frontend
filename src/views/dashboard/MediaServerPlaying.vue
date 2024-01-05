<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'

// 继续播放列表
const playingList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadPlayingList() {
  try {
    playingList.value = await api.get('mediaserver/playing')
  }
  catch (e) {
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
      <VCardTitle>继续观看</VCardTitle>
    </VCardItem>

    <VCardText class="pt-4" />
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1rem;
}
</style>
