<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'
import PosterCard from '@/components/cards/PosterCard.vue'

// 最近入库列表
const latestList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadLatest() {
  try {
    latestList.value = await api.get('mediaserver/latest')
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadLatest()
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
          <VCardTitle >最近添加</VCardTitle>
        </VCardItem>

        <div v-if="latestList.length > 0" class="grid gap-4 grid-media-card mx-3 mb-3" tabindex="0">
          <PosterCard v-for="data in latestList" :key="data.id" :media="data" />
        </div>
      </VCard>
    </template>
  </VHover>
</template>
