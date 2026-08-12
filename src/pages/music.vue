<script setup lang="ts">
import api from '@/api'
import type { MediaDataSource, MediaInfo } from '@/api/types'
import MusicCard from '@/components/cards/MusicCard.vue'
import { useI18n } from 'vue-i18n'
import { parseMediaDataSources } from '@/utils/mediaId'
import { getMusicKey } from '@/utils/music'

const { t } = useI18n()
const route = useRoute()

const loading = ref(false)
const searched = ref(false)
const results = ref<MediaInfo[]>([])

// 搜索入口统一在全局搜索，本页只消费路由关键词
const query = computed(() => route.query.query?.toString().trim() || '')
const mediaSources = computed(() => parseMediaDataSources(route.query.media_source))

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
    const params: Record<string, string | number | MediaDataSource[]> = {
      title: query.value,
      type: 'music',
      count: 30,
    }
    if (mediaSources.value.length > 0) params.media_source = mediaSources.value
    results.value =
      (await api.get('media/search', {
        params,
        paramsSerializer: { indexes: null },
      })) || []
  } catch (error) {
    console.error(error)
    results.value = []
  } finally {
    loading.value = false
  }
}

watch([query, mediaSources], searchMusic, { immediate: true })
</script>

<template>
  <div class="music-search-page">
    <VPageContentTitle :title="query || t('music.title')" />

    <LoadingBanner v-if="loading" class="mt-12" />
    <VRow v-else-if="results.length" class="music-results">
      <VCol v-for="item in results" :key="getMusicKey(item)" cols="12" md="6" lg="4" class="music-result-col">
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

@media (width <= 600px) {
  .music-search-page {
    padding-inline: 0.5rem;
  }

  .music-results {
    margin-block: -0.375rem;
  }

  .music-result-col {
    padding-block: 0.375rem;
  }
}
</style>
