<script setup lang="ts">
import api from '@/api'
import type { MediaStatistic } from '@/api/types'

const statistics = ref([
  {
    title: '',
    stats: '',
    icon: '',
    color: '',
  },
])

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic')

    statistics.value = [
      {
        title: '电影',
        stats: res.movie_count.toLocaleString(),
        icon: 'mdi-movie-roll',
        color: 'primary',
      },
      {
        title: '电视剧',
        stats: res.tv_count.toLocaleString(),
        icon: 'mdi-television-box',
        color: 'success',
      },
      {
        title: '剧集',
        stats: res.episode_count.toLocaleString(),
        icon: 'mdi-television-classic',
        color: 'warning',
      },
      {
        title: '用户',
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
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>媒体统计</VCardTitle>
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
