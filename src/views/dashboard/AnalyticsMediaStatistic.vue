<script setup lang="ts">
import api from '@/api'
import type { MediaStatistic } from '@/api/types'
import { formatDashboardCount, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const movieCount = ref(0)
const tvCount = ref(0)
const episodeCount = ref<number | null>(null)
const userCount = ref(0)

const animatedMovieCount = useAnimatedDashboardNumber(movieCount, {
  duration: 720,
})

const animatedTvCount = useAnimatedDashboardNumber(tvCount, {
  delay: 60,
  duration: 720,
})

const animatedEpisodeCount = useAnimatedDashboardNumber(computed(() => episodeCount.value ?? 0), {
  delay: 120,
  duration: 720,
})

const animatedUserCount = useAnimatedDashboardNumber(userCount, {
  delay: 180,
  duration: 720,
})

const statistics = computed(() => [
  {
    title: t('mediaType.movie'),
    stats: formatDashboardCount(animatedMovieCount.value),
    icon: 'mdi-movie-roll',
    color: 'primary',
  },
  {
    title: t('mediaType.tv'),
    stats: formatDashboardCount(animatedTvCount.value),
    icon: 'mdi-television-box',
    color: 'success',
  },
  {
    title: t('dashboard.episodes'),
    stats: episodeCount.value == null ? t('common.notFetched') : formatDashboardCount(animatedEpisodeCount.value),
    icon: 'mdi-television-classic',
    color: 'warning',
  },
  {
    title: t('dashboard.users'),
    stats: formatDashboardCount(animatedUserCount.value),
    icon: 'mdi-account',
    color: 'info',
  },
])

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic')

    movieCount.value = Number(res.movie_count) || 0
    tvCount.value = Number(res.tv_count) || 0
    episodeCount.value = res.episode_count == null ? null : Number(res.episode_count) || 0
    userCount.value = Number(res.user_count) || 0
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
  <VCard class="dashboard-summary-card">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.mediaStatistic') }}</VCardTitle>
    </VCardItem>

    <VCardText>
      <VRow>
        <VCol v-for="item in statistics" :key="item.title" cols="6" sm="3">
          <div class="d-flex align-center">
            <div class="me-3">
              <VAvatar :color="item.color" rounded size="42" class="elevation-1">
                <VIcon size="24" :icon="item.icon" />
              </VAvatar>
            </div>

            <div class="d-flex flex-column">
              <span class="text-caption">
                {{ item.title }}
              </span>
              <span class="dashboard-number text-h6">{{ item.stats }}</span>
            </div>
          </div>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style lang="scss" scoped>
.dashboard-number {
  font-variant-numeric: tabular-nums;
}
</style>
