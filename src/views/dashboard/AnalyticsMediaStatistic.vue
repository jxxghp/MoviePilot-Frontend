<script setup lang="ts">
import api from '@/api'
import type { MediaStatistic } from '@/api/types'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const statistics = ref<{ [key: string]: string }[]>([])

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic')

    statistics.value = [
      {
        title: t('mediaType.movie'),
        stats: res.movie_count.toLocaleString(),
        icon: 'mdi-movie-roll',
        color: 'primary',
      },
      {
        title: t('mediaType.tv'),
        stats: res.tv_count.toLocaleString(),
        icon: 'mdi-television-box',
        color: 'success',
      },
      {
        title: t('dashboard.episodes'),
        stats: res.episode_count == null ? t('common.notFetched') : res.episode_count.toLocaleString(),
        icon: 'mdi-television-classic',
        color: 'warning',
      },
      {
        title: t('dashboard.users'),
        stats: res.user_count.toLocaleString(),
        icon: 'mdi-account',
        color: 'info',
      },
    ]
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
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props" class="dashboard-summary-card">
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
                  <span class="text-h6">{{ item.stats }}</span>
                </div>
              </div>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>
