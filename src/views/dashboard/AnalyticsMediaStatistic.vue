<script setup lang="ts">
import api from '@/api'
import type { MediaStatistic } from '@/api/types'
import { formatDashboardCount, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useDashboardSnapshot } from '@/composables/useDashboardSnapshot'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const { readSnapshot, writeSnapshot } = useDashboardSnapshot<MediaStatistic>('media-statistic-v1')
const currentSnapshot = readSnapshot()

const movieCount = ref(Number(currentSnapshot?.value.movie_count) || 0)
const tvCount = ref(Number(currentSnapshot?.value.tv_count) || 0)
const episodeCount = ref<number | null>(
  currentSnapshot?.value.episode_count == null ? null : Number(currentSnapshot.value.episode_count) || 0,
)
const musicCount = ref(Number(currentSnapshot?.value.music_count) || 0)
const movieCountMonth = ref(Number(currentSnapshot?.value.movie_count_month) || 0)
const tvCountMonth = ref(Number(currentSnapshot?.value.tv_count_month) || 0)
const episodeCountMonth = ref(Number(currentSnapshot?.value.episode_count_month) || 0)
const musicCountMonth = ref(Number(currentSnapshot?.value.music_count_month) || 0)
let statisticLoadId = 0

const animatedMovieCount = useAnimatedDashboardNumber(movieCount, {
  duration: 720,
})

const animatedTvCount = useAnimatedDashboardNumber(tvCount, {
  delay: 60,
  duration: 720,
})

const animatedEpisodeCount = useAnimatedDashboardNumber(
  computed(() => episodeCount.value ?? 0),
  {
    delay: 120,
    duration: 720,
  },
)

const animatedMusicCount = useAnimatedDashboardNumber(musicCount, {
  delay: 180,
  duration: 720,
})

const statistics = computed(() => [
  {
    title: t('mediaType.movie'),
    stats: formatDashboardCount(animatedMovieCount.value),
    icon: 'mdi-movie-roll',
    color: 'primary',
    addition: movieCountMonth.value,
  },
  {
    title: t('mediaType.tv'),
    stats: formatDashboardCount(animatedTvCount.value),
    icon: 'mdi-television-box',
    color: 'success',
    addition: tvCountMonth.value,
  },
  {
    title: t('dashboard.episodes'),
    stats: episodeCount.value == null ? t('common.notFetched') : formatDashboardCount(animatedEpisodeCount.value),
    icon: 'mdi-television-classic',
    color: 'warning',
    addition: episodeCountMonth.value,
  },
  {
    title: t('mediaType.music'),
    stats: formatDashboardCount(animatedMusicCount.value),
    icon: 'mdi-music-box-multiple',
    color: 'info',
    addition: musicCountMonth.value,
  },
])

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  const loadId = ++statisticLoadId
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic')
    if (loadId !== statisticLoadId) return

    const statistic: MediaStatistic = {
      movie_count: Number(res.movie_count) || 0,
      tv_count: Number(res.tv_count) || 0,
      episode_count: res.episode_count == null ? null : Number(res.episode_count) || 0,
      music_count: Number(res.music_count) || 0,
      movie_count_month: Number(res.movie_count_month) || 0,
      tv_count_month: Number(res.tv_count_month) || 0,
      episode_count_month: Number(res.episode_count_month) || 0,
      music_count_month: Number(res.music_count_month) || 0,
    }

    movieCount.value = statistic.movie_count
    tvCount.value = statistic.tv_count
    episodeCount.value = statistic.episode_count
    musicCount.value = statistic.music_count
    movieCountMonth.value = statistic.movie_count_month
    tvCountMonth.value = statistic.tv_count_month
    episodeCountMonth.value = statistic.episode_count_month
    musicCountMonth.value = statistic.music_count_month
    writeSnapshot(statistic)
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadMediaStatistic()
})

onActivated(() => {
  loadMediaStatistic()
})
</script>

<template>
  <VCard class="dashboard-summary-card dashboard-grid-fill">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.mediaStatistic') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-summary-content">
      <div class="dashboard-stat-grid">
        <div v-for="item in statistics" :key="item.title" class="dashboard-stat-item">
          <VAvatar :color="item.color" size="46" class="dashboard-stat-icon">
            <VIcon size="24" :icon="item.icon" />
          </VAvatar>
          <div class="dashboard-stat-copy">
            <span class="dashboard-stat-label">{{ item.title }}</span>
            <span class="dashboard-number">{{ item.stats }}</span>
            <span v-if="item.addition !== null" class="dashboard-stat-addition">
              {{ t('dashboard.monthlyAddition', { count: item.addition }) }}
            </span>
          </div>
        </div>
      </div>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-summary-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 160px;
}

.dashboard-summary-content {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-block-size: 0;
}

.dashboard-stat-grid {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-stat-item {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: 0.7rem;
  padding-inline: 1.1rem;
}

.dashboard-stat-item:first-child {
  padding-inline-start: 0;
}

.dashboard-stat-item + .dashboard-stat-item {
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.dashboard-stat-copy {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
}

.dashboard-stat-label,
.dashboard-stat-addition {
  font-size: 0.72rem;
}

.dashboard-stat-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dashboard-number {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

.dashboard-stat-addition {
  overflow: hidden;
  color: rgb(var(--v-theme-success));
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 740px) {
  .dashboard-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 1rem;
  }

  .dashboard-stat-item {
    padding-inline: 0.5rem;
  }

  .dashboard-stat-item:nth-child(odd) {
    border-inline-start: 0;
    padding-inline-start: 0;
  }
}
</style>
