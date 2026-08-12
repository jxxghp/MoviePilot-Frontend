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
    media_source: 'musicbrainz',
    with_cover: coverFilter.value === 'with_cover',
  }
  params.mode = mode.value
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
  return params
})

watch([mode, entity, rangeName, sortBy, freshSort, freshDays, freshScope, coverFilter], () => {
  currentKey.value++
})
</script>

<template>
  <div class="px-3 music-explore-filters">
    <div class="music-filter-row">
      <VLabel class="music-filter-label">{{ t('music.filter.mode') }}</VLabel>
      <VChipGroup v-model="mode" mandatory class="music-filter-chips">
        <VChip v-for="(label, value) in modeOptions" :key="value" :value="value" filter tile>
          {{ label }}
        </VChip>
      </VChipGroup>
    </div>

    <template v-if="mode === 'chart'">
      <div class="music-filter-row">
        <VLabel class="music-filter-label">{{ t('music.filter.entity') }}</VLabel>
        <VChipGroup v-model="entity" mandatory class="music-filter-chips">
          <VChip v-for="(label, value) in entityOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
      <div class="music-filter-row">
        <VLabel class="music-filter-label">{{ t('music.filter.period') }}</VLabel>
        <VChipGroup v-model="rangeName" mandatory class="music-filter-chips">
          <VChip v-for="(label, value) in rangeOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
      <div class="music-filter-row">
        <VLabel class="music-filter-label">{{ t('music.filter.sort') }}</VLabel>
        <VChipGroup v-model="sortBy" mandatory class="music-filter-chips">
          <VChip v-for="(label, value) in sortOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
    </template>

    <template v-else>
      <div class="music-filter-row">
        <VLabel class="music-filter-label">{{ t('music.filter.sort') }}</VLabel>
        <VChipGroup v-model="freshSort" mandatory class="music-filter-chips">
          <VChip v-for="(label, value) in freshSortOptions" :key="value" :value="value" filter tile>
            {{ label }}
          </VChip>
        </VChipGroup>
      </div>
      <div class="music-filter-row">
        <VLabel class="music-filter-label">{{ t('music.filter.scope') }}</VLabel>
        <VChipGroup v-model="freshScope" mandatory class="music-filter-chips">
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

    <div class="music-filter-row">
      <VLabel class="music-filter-label">{{ t('music.filter.cover') }}</VLabel>
      <VChipGroup v-model="coverFilter" mandatory class="music-filter-chips">
        <VChip value="all" filter tile>{{ t('music.filter.all') }}</VChip>
        <VChip value="with_cover" filter tile>{{ t('music.filter.withCover') }}</VChip>
      </VChipGroup>
    </div>
  </div>
  <MediaCardListView :key="currentKey" apipath="music/explore" :params="filterParams" />
</template>

<style scoped>
.music-filter-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-block-end: 0.5rem;
}

.music-filter-label {
  flex: 0 0 auto;
}

/* 周期等筛选项在小屏幕下允许左右滑动，但不换行 */
.music-filter-chips {
  flex: 1 1 0%;
  min-inline-size: 0;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.music-filter-chips::-webkit-scrollbar {
  display: none;
}

.music-filter-chips :deep(.v-chip) {
  flex: 0 0 auto;
}

.music-days-filter {
  flex: 0 0 auto;
  max-inline-size: 10rem;
}
</style>
