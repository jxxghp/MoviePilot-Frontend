<script setup lang="ts">
import type { Context } from '@/api/types'
import { requiresMusicConfirmation } from '@/utils/music'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ context?: Context }>()
const { t, te } = useI18n()
const reason = computed(() => {
  const key = `torrent.musicMatch.${props.context?.match_reason}`
  return te(key) ? t(key) : t('torrent.musicMatch.candidate')
})
</script>

<template>
  <VChip
    v-if="requiresMusicConfirmation(props.context)"
    color="warning"
    size="small"
    variant="tonal"
    class="rounded-sm flex-shrink-0"
    data-testid="music-match-status"
    :prepend-icon="props.context?.match_reason === 'related_album' ? 'mdi-album' : 'mdi-help-circle-outline'"
    :aria-label="reason"
  >
    {{ t(`torrent.musicMatch.${props.context?.match_reason === 'related_album' ? 'album' : 'candidate'}`) }}
    <VTooltip activator="parent" location="top">{{ reason }}</VTooltip>
  </VChip>
</template>
