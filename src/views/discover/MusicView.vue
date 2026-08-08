<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// 探索模式：对齐 ListenBrainz 官方的热门统计与新发行两个入口
const mode = ref<'chart' | 'fresh'>('chart')

// 热门榜单实体：官方统计页面的热门单曲与热门专辑
const entity = ref('recording')

// 热门榜单周期，取值与官方统计页面一致
const rangeName = ref('this_month')

// 热门榜单排序
const sortBy = ref('listen_count.desc')

// 新发行排序，取值与官方新发行页面一致
const freshSort = ref('release_date')

// 新发行时间窗口天数，官方上限为 90 天
const freshDays = ref(14)

// 新发行是否包含已发行、即将发行
const freshScope = ref<'all' | 'past' | 'future'>('all')

const coverFilter = ref('all')
const minListenCount = ref(0)
const currentKey = ref(0)

const modeOptions = computed(() => ({
  chart: t('music.filter.modeChart'),
  fresh: t('music.filter.modeFresh'),
}))

const entityOptions = computed(() => ({
  recording: t('music.filter.entityRecording'),
  album: t('music.filter.entityAlbum'),
}))

const rangeOptions = computed(() => ({
  this_week: t('music.filter.thisWeek'),
  this_month: t('music.filter.thisMonth'),
  this_year: t('music.filter.thisYear'),
  week: t('music.filter.lastWeek'),
  month: t('music.filter.lastMonth'),
  quarter: t('music.filter.lastQuarter'),
  half_yearly: t('music.filter.lastHalfYear'),
  year: t('music.filter.lastYear'),
  all_time: t('music.filter.allTime'),
}))

const sortOptions = computed(() => ({
  'listen_count.desc': t('music.filter.mostListened'),
  'listen_count.asc': t('music.filter.leastListened'),
}))

const freshSortOptions = computed(() => ({
  release_date: t('music.filter.sortReleaseDate'),
  artist_credit_name: t('music.filter.sortArtist'),
  release_name: t('music.filter.sortReleaseName'),
}))

const freshDaysOptions = computed(() => [
  { value: 7, title: t('music.filter.daysValue', { days: 7 }) },
  { value: 14, title: t('music.filter.daysValue', { days: 14 }) },
  { value: 30, title: t('music.filter.daysValue', { days: 30 }) },
  { value: 60, title: t('music.filter.daysValue', { days: 60 }) },
  { value: 90, title: t('music.filter.daysValue', { days: 90 }) },
])

const freshScopeOptions = computed(() => ({
  all: t('music.filter.all'),
  past: t('music.filter.released'),
  future: t('music.filter.upcoming'),
}))

const filterParams = computed(() => {
  const params: Record<string, unknown> = {
    count: 30,
    mode: mode.value,
    with_cover: coverFilter.value === 'with_cover',
  }
  if (mode.value === 'fresh') {
    params.sort = freshSort.value
    params.days = freshDays.value
    params.past = freshScope.value !== 'future'
    params.future = freshScope.value !== 'past'
    return params
  }
  params.entity = entity.value
  params.range_name = rangeName.value
  params.sort_by = sortBy.value
  params.min_listen_count = Math.max(0, minListenCount.value || 0)
  return params
})

watch([mode, entity, rangeName, sortBy, freshSort, freshDays, freshScope, coverFilter, minListenCount], () => {
  currentKey.value++
})
</script>

<template>
  <div class="px-3 music-explore-filters">
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <VLabel>{{ t('music.filter.mode') }}</VLabel>
      <VChipGroup v-model="mode" mandatory>
        <VChip v-for="(label, value) in modeOptions" :key="value" :value="value" filter tile>
          {{ label }}
        </VChip>
      </VChipGroup>
    </div>

    <template v-if="mode === 'chart'">
      <div class="d-flex flex-wrap align-center ga-3 mb-2">
        <VLabel>{{ t('music.filter.entity') }}</VLabel>
        <VChipGroup v-model="entity" mandatory>
          <VChip v-for="(label, value) in entityOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
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
    </template>

    <template v-else>
      <div class="d-flex flex-wrap align-center ga-3 mb-2">
        <VLabel>{{ t('music.filter.sort') }}</VLabel>
        <VChipGroup v-model="freshSort" mandatory>
          <VChip v-for="(label, value) in freshSortOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
      <div class="d-flex flex-wrap align-center ga-3 mb-2">
        <VLabel>{{ t('music.filter.scope') }}</VLabel>
        <VChipGroup v-model="freshScope" mandatory>
          <VChip v-for="(label, value) in freshScopeOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
        <VSelect
          v-model="freshDays"
          :items="freshDaysOptions"
          :label="t('music.filter.days')"
          density="compact"
          variant="outlined"
          hide-details
          class="music-days-filter"
        />
      </div>
    </template>

    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <VLabel>{{ t('music.filter.cover') }}</VLabel>
      <VChipGroup v-model="coverFilter" mandatory>
        <VChip value="all" filter tile>{{ t('music.filter.all') }}</VChip>
        <VChip value="with_cover" filter tile>{{ t('music.filter.withCover') }}</VChip>
      </VChipGroup>
      <VTextField
        v-if="mode === 'chart'"
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

.music-days-filter {
  max-inline-size: 10rem;
}
</style>
