<script setup lang="ts">
import api from '@/api'
import type { MediaInfo } from '@/api/types'
import MusicCard from '@/components/cards/MusicCard.vue'
import { useI18n } from 'vue-i18n'
import { getMusicKey } from '@/utils/music'

const { t } = useI18n()
const route = useRoute()

const loading = ref(false)
const searched = ref(false)
const results = ref<MediaInfo[]>([])

// 搜索入口统一在全局搜索，本页只消费路由关键词
const query = computed(() => route.query.query?.toString().trim() || '')

/** 调用统一音乐元数据接口搜索候选。 */
async function searchMusic() {
  if (!query.value) {
    results.value = []
    searched.value = false
    return
  }

  loading.value = true
  searched.value = true
  try {
    results.value = (await api.get('media/search', { params: { title: query.value, type: 'music', count: 30 } })) || []
  } catch (error) {
    console.error(error)
    results.value = []
  } finally {
    loading.value = false
  }
}

watch(query, searchMusic, { immediate: true })
</script>

<template>
  <div class="music-search-page">
    <VPageContentTitle :title="query || t('music.title')" />

    <VSkeletonLoader v-if="loading" type="card, card, card" />
    <VRow v-else-if="results.length">
      <VCol v-for="item in results" :key="getMusicKey(item)" cols="12" md="6" xl="4">
        <MusicCard :music="item" />
      </VCol>
    </VRow>
    <NoDataFound v-else-if="searched" :error-title="t('music.noResults')" />
    <NoDataFound v-else :error-title="t('music.title')" :error-description="t('music.searchFromGlobal')" />
  </div>
</template>

<style scoped>
.music-search-page {
  max-width: 1440px;
  margin-inline: auto;
}
</style>
