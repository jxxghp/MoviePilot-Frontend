<script setup lang="ts">
import MediaCardListView from '@/views/discover/MediaCardListView.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const currentKey = ref(0)
const currentYear = new Date().getFullYear()

const filterParams = reactive({
  sort: 'POPULARITY_DESC' as string | null,
  genre: null as string | null,
  format: null as string | null,
  season: null as string | null,
  season_year: null as number | null,
  status: null as string | null,
  country: null as string | null,
})

const sortItems = [
  { title: t('anilist.sortType.popularity'), value: 'POPULARITY_DESC' },
  { title: t('anilist.sortType.trending'), value: 'TRENDING_DESC' },
  { title: t('anilist.sortType.score'), value: 'SCORE_DESC' },
  { title: t('anilist.sortType.newest'), value: 'START_DATE_DESC' },
]

const genreItems = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
].map(value => ({ title: t(`anilist.genreType.${value.replaceAll(' ', '').replace('-', '').toLowerCase()}`), value }))

const formatItems = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'].map(value => ({
  title: t(`anilist.formatType.${value.toLowerCase()}`),
  value,
}))

const seasonItems = ['WINTER', 'SPRING', 'SUMMER', 'FALL'].map(value => ({
  title: t(`anilist.seasonType.${value.toLowerCase()}`),
  value,
}))

const statusItems = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED'].map(value => ({
  title: t(`anilist.statusType.${value.toLowerCase()}`),
  value,
}))

const countryItems = ['JP', 'CN', 'KR', 'TW'].map(value => ({
  title: t(`anilist.countryType.${value.toLowerCase()}`),
  value,
}))

const yearItems = Array.from({ length: 15 }, (_, index) => currentYear - index)

type AniListFilterKey = Exclude<keyof typeof filterParams, 'season_year'>

const filterGroups = [
  { key: 'sort', label: t('anilist.sort'), items: sortItems },
  { key: 'format', label: t('anilist.format'), items: formatItems },
  { key: 'genre', label: t('anilist.genre'), items: genreItems },
  { key: 'season', label: t('anilist.season'), items: seasonItems },
  { key: 'season_year', label: t('anilist.year'), items: yearItems.map(value => ({ title: value, value })) },
  { key: 'status', label: t('anilist.status'), items: statusItems },
  { key: 'country', label: t('anilist.country'), items: countryItems },
] as const

/** 将筛选 Chip 的选择值写入对应 AniList 查询参数。 */
function updateFilter(key: (typeof filterGroups)[number]['key'], value: unknown) {
  if (key === 'season_year') {
    filterParams.season_year = typeof value === 'number' ? value : null
    return
  }
  filterParams[key as AniListFilterKey] = typeof value === 'string' ? value : null
}

watch(filterParams, () => {
  if (!filterParams.sort) {
    filterParams.sort = 'POPULARITY_DESC'
  }
  currentKey.value++
})
</script>

<template>
  <div class="px-3">
    <div
      v-for="group in filterGroups"
      :key="group.key"
      class="flex justify-start align-center"
    >
      <div class="mr-5">
        <VLabel>{{ group.label }}</VLabel>
      </div>
      <VChipGroup :model-value="filterParams[group.key]" @update:model-value="updateFilter(group.key, $event)">
        <VChip
          v-for="item in group.items"
          :key="item.value"
          :color="filterParams[group.key as keyof typeof filterParams] == item.value ? 'primary' : ''"
          filter
          tile
          :value="item.value"
        >
          {{ item.title }}
        </VChip>
      </VChipGroup>
    </div>
  </div>

  <MediaCardListView :key="currentKey" apipath="anilist/discover" :params="filterParams" />
</template>
