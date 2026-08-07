<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const rangeName = ref('this_month')
const sortBy = ref('listen_count.desc')
const coverFilter = ref('all')
const minListenCount = ref(0)
const currentKey = ref(0)

const rangeOptions = computed(() => ({
  this_week: t('music.filter.thisWeek'),
  this_month: t('music.filter.thisMonth'),
  this_year: t('music.filter.thisYear'),
  all_time: t('music.filter.allTime'),
}))

const sortOptions = computed(() => ({
  'listen_count.desc': t('music.filter.mostListened'),
  'listen_count.asc': t('music.filter.leastListened'),
}))

const filterParams = computed(() => ({
  count: 30,
  range_name: rangeName.value,
  sort_by: sortBy.value,
  min_listen_count: Math.max(0, minListenCount.value || 0),
  with_cover: coverFilter.value === 'with_cover',
}))

watch([rangeName, sortBy, coverFilter, minListenCount], () => {
  currentKey.value++
})
</script>

<template>
  <div class="px-3 music-explore-filters">
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <VLabel>{{ t('music.filter.period') }}</VLabel>
      <VChipGroup v-model="rangeName" mandatory>
        <VChip v-for="(label, value) in rangeOptions" :key="value" :value="value" filter tile>
          {{ label }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <VLabel>{{ t('music.filter.sort') }}</VLabel>
      <VChipGroup v-model="sortBy" mandatory>
        <VChip v-for="(label, value) in sortOptions" :key="value" :value="value" filter tile>
          {{ label }}
        </VChip>
      </VChipGroup>
    </div>
    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <VLabel>{{ t('music.filter.cover') }}</VLabel>
      <VChipGroup v-model="coverFilter" mandatory>
        <VChip value="all" filter tile>{{ t('music.filter.all') }}</VChip>
        <VChip value="with_cover" filter tile>{{ t('music.filter.withCover') }}</VChip>
      </VChipGroup>
      <VTextField
        v-model.number="minListenCount"
        :label="t('music.filter.minListenCount')"
        type="number"
        min="0"
        density="compact"
        variant="outlined"
        hide-details
        class="music-listen-count-filter"
      />
    </div>
  </div>
  <MediaCardListView :key="currentKey" apipath="music/explore" :params="filterParams" />
</template>

<style scoped>
.music-listen-count-filter {
  max-inline-size: 14rem;
}
</style>
