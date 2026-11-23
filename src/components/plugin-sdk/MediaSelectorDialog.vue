<script setup lang="ts">
import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import type { MusicEntityType } from '@/api/types'
defineProps<{ mediaSource: string; keyword?: string; musicTypes?: MusicEntityType[] }>()
const emit = defineEmits(['select', 'close'])
</script>
<template>
  <VDialog :model-value="true" max-width="50rem" scrollable @update:model-value="!$event && emit('close')">
    <MediaIdSelector
      :type="mediaSource"
      :initial-keyword="keyword"
      :music-types="musicTypes"
      @select="emit('select', $event)"
      @close="emit('close')"
    />
  </VDialog>
</template>
