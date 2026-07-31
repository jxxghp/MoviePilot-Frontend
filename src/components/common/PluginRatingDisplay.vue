<script setup lang="ts">
interface Props {
  rating?: number
  count?: number
  iconSize?: number | string
  showCount?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  rating: 0,
  count: 0,
  iconSize: 16,
  showCount: true,
})

const displayRating = computed(() => {
  const normalizedRating = Number.isFinite(props.rating) ? props.rating : 0
  return Math.round(Math.min(5, Math.max(0, normalizedRating)) * 2) / 2
})

const starIcons = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const starValue = index + 1
    if (displayRating.value >= starValue) return 'mdi-star'
    if (displayRating.value >= starValue - 0.5) return 'mdi-star-half-full'
    return 'mdi-star-outline'
  }),
)
</script>

<template>
  <div class="plugin-rating-display" :aria-label="`${Number(props.rating || 0).toFixed(1)} / 5`">
    <span class="plugin-rating-display__stars" aria-hidden="true">
      <VIcon
        v-for="(icon, index) in starIcons"
        :key="index"
        :icon="icon"
        :size="props.iconSize"
        :color="icon === 'mdi-star-outline' ? undefined : 'warning'"
        :data-rating-icon="icon"
      />
    </span>
    <span class="plugin-rating-display__value">{{ Number(props.rating || 0).toFixed(1) }}</span>
    <span v-if="props.showCount" class="plugin-rating-display__count">({{ props.count || 0 }})</span>
  </div>
</template>

<style scoped>
.plugin-rating-display {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
}

.plugin-rating-display__stars {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 0;
}

.plugin-rating-display__value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-weight: 600;
}

.plugin-rating-display__count {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
