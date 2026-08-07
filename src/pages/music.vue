<script setup lang="ts">
import api from '@/api'
import type { ApiResponse, MediaInfo } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const query = ref('')
const loading = ref(false)
const searched = ref(false)
const results = ref<MediaInfo[]>([])
const subscribingIds = ref(new Set<string>())

if (route.query.query) {
  query.value = route.query.query.toString()
}

/** 返回音乐候选在列表中的稳定身份。 */
function getMusicKey(item: MediaInfo) {
  return `${item.source || 'music'}:${item.media_id || `${item.artist}-${item.title}-${item.album}`}`
}

/** 调用统一音乐元数据接口搜索候选。 */
async function searchMusic() {
  const keyword = query.value.trim()
  if (!keyword || loading.value) return

  loading.value = true
  searched.value = true
  try {
    results.value = (await api.get('music/search', { params: { query: keyword, count: 30 } })) || []
  } catch (error) {
    console.error(error)
    results.value = []
  } finally {
    loading.value = false
  }
}

/** 使用音乐元数据身份进入现有站点资源精确搜索页。 */
function searchResources(item: MediaInfo) {
  if (!item.source || !item.media_id) return
  router.push({
    path: '/resource',
    query: {
      keyword: `${item.source}:${item.media_id}`,
      type: '音乐',
      title: item.title,
      year: item.year,
      area: 'title',
      result_type: 'torrent',
    },
  })
}

/** 将选中的音乐目标写入现有订阅表和订阅调度流程。 */
async function subscribeMusic(item: MediaInfo) {
  if (!item.source || !item.media_id) return
  const key = getMusicKey(item)
  if (subscribingIds.value.has(key)) return

  subscribingIds.value = new Set(subscribingIds.value).add(key)
  try {
    const result = (await api.post('subscribe/', {
      name: item.title,
      year: item.year?.toString(),
      type: '音乐',
      media_source: item.source,
      media_id: item.media_id,
    })) as ApiResponse<{ id?: number }>
    if (result.success) {
      toast.success(t('music.subscribeSuccess'))
    } else {
      toast.error(result.message || t('common.failed'))
    }
  } catch (error) {
    console.error(error)
    toast.error(t('common.failed'))
  } finally {
    const nextIds = new Set(subscribingIds.value)
    nextIds.delete(key)
    subscribingIds.value = nextIds
  }
}

/** 将秒数格式化为音乐列表需要的短时长。 */
function formatDuration(seconds?: number) {
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

onMounted(() => {
  if (query.value) searchMusic()
})
</script>

<template>
  <div class="music-search-page">
    <VPageContentTitle :title="t('music.title')" />

    <VCard class="mb-6" variant="tonal">
      <VCardText>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ t('music.subtitle') }}</div>
        <div class="d-flex flex-column flex-sm-row ga-3">
          <VTextField
            v-model="query"
            :placeholder="t('music.searchPlaceholder')"
            prepend-inner-icon="mdi-music-note"
            variant="outlined"
            hide-details
            clearable
            autofocus
            @keyup.enter="searchMusic"
          />
          <VBtn color="primary" prepend-icon="mdi-magnify" :loading="loading" @click="searchMusic">
            {{ t('music.search') }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>

    <VRow v-if="results.length">
      <VCol v-for="item in results" :key="getMusicKey(item)" cols="12" md="6" xl="4">
        <VCard class="h-100">
          <div class="d-flex pa-4 ga-4">
            <VImg
              v-if="item.cover_url || item.poster_path"
              :src="item.cover_url || item.poster_path"
              width="104"
              height="104"
              cover
              rounded="lg"
              class="flex-grow-0"
            />
            <VSheet v-else width="104" height="104" rounded="lg" class="d-flex align-center justify-center flex-grow-0">
              <VIcon icon="mdi-album" size="48" color="medium-emphasis" />
            </VSheet>

            <div class="min-w-0 flex-grow-1">
              <div class="text-h6 text-truncate">{{ item.title }}</div>
              <div class="text-body-2 text-medium-emphasis text-truncate">
                {{ item.artist || item.artists?.join(' / ') || t('common.unknown') }}
              </div>
              <div v-if="item.album" class="text-caption text-medium-emphasis text-truncate mt-1">
                {{ t('music.album') }}：{{ item.album }}
              </div>
              <div class="d-flex flex-wrap ga-2 mt-3">
                <VChip v-if="item.year" size="small" variant="tonal">{{ item.year }}</VChip>
                <VChip v-if="item.duration" size="small" variant="tonal">{{ formatDuration(item.duration) }}</VChip>
                <VChip size="small" variant="tonal" color="primary">{{ t('music.source') }}</VChip>
              </div>
            </div>
          </div>

          <VCardActions class="px-4 pb-4 pt-0">
            <VBtn variant="tonal" prepend-icon="mdi-magnify" @click="searchResources(item)">
              {{ t('music.searchResources') }}
            </VBtn>
            <VSpacer />
            <VBtn
              color="primary"
              prepend-icon="mdi-rss"
              :loading="subscribingIds.has(getMusicKey(item))"
              @click="subscribeMusic(item)"
            >
              {{ t('music.subscribe') }}
            </VBtn>
          </VCardActions>
        </VCard>
      </VCol>
    </VRow>

    <NoDataFound v-else-if="searched && !loading" :title="t('music.noResults')" />
    <VSkeletonLoader v-else-if="loading" type="card, card, card" />
  </div>
</template>

<style scoped>
.music-search-page {
  max-width: 1440px;
  margin-inline: auto;
}

.min-w-0 {
  min-width: 0;
}
</style>
