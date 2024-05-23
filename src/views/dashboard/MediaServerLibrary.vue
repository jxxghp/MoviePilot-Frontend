<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem } from '@/api/types'
import LibraryCard from '@/components/cards/LibraryCard.vue'

// 媒体库列表
const libraryList = ref<MediaServerPlayItem[]>([])

// 调用API查询
async function loadLibrary() {
  try {
    libraryList.value = await api.get('mediaserver/library')
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadLibrary()
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
          <VCardTitle >我的媒体库</VCardTitle>
        </VCardItem>

        <div v-if="libraryList.length > 0" class="grid gap-4 grid-backdrop-card mx-3" tabindex="0">
          <LibraryCard v-for="data in libraryList" :key="data.id" :media="data" height="10rem" />
        </div>
      </VCard>
    </template>
  </VHover>
</template>
