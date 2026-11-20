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

/** 自动匹配拒绝的原因直接展示，触屏用户也能在候选列表中查看。 */
const label = computed(() =>
  ['title_mismatch', 'performance_mismatch', 'category_mismatch'].includes(props.context?.match_reason || '')
    ? reason.value
    : t(`torrent.musicMatch.${props.context?.match_reason === 'related_album' ? 'album' : 'candidate'}`),
)
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
    {{ label }}
    <VTooltip activator="parent" location="top">{{ reason }}</VTooltip>
  </VChip>
</template>
