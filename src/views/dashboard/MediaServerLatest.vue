<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'

// 最近入库列表
const latestList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadLatest() {
  try {
    latestList.value = await api.get('mediaserver/latest')
  }
  catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadLatest()
})
</script>

<template>
  <VCard>
    <VCardItem>
      <VCardTitle>最近添加</VCardTitle>
    </VCardItem>

    <VCardText class="pt-4" />
  </VCard>
</template>

<style lang="scss" scoped>
.card-list {
  --v-card-list-gap: 1rem;
}
</style>
