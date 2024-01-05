<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'

// 媒体库列表
const libraryList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadLibrary() {
  try {
    libraryList.value = await api.get('mediaserver/library')
  }
  catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadLibrary()
})
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>我的媒体库</VCardTitle>
    </VCardItem>

    <VCardText class="pt-4" />
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1rem;
}
</style>
