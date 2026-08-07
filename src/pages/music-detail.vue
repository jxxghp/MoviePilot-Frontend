<script setup lang="ts">
import api from '@/api'
import type { ApiResponse, MediaInfo } from '@/api/types'
import { buildMusicResourceRoute, getMusicKey } from '@/utils/music'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const loading = ref(false)
const subscribing = ref(false)
const imageError = ref(false)
const music = ref<MediaInfo>()

const source = computed(() => route.query.source?.toString() || '')
const mediaId = computed(() => route.query.mediaid?.toString() || '')

/** 加载路由指定的音乐详情。 */
async function loadMusicDetail() {
  if (!source.value || !mediaId.value) return
  loading.value = true
  imageError.value = false
  try {
    music.value = await api.post('music/recognize', {
      source: source.value,
      media_id: mediaId.value,
    })
  } catch (error) {
    console.error(error)
    music.value = undefined
  } finally {
    loading.value = false
  }
}

/** 从详情页进入现有站点资源搜索。 */
function searchResources() {
  if (!music.value) return
  const target = buildMusicResourceRoute(music.value)
  if (target) router.push(target)
}

/** 从详情页创建音乐订阅，后端会以发行封面写入订阅海报。 */
async function subscribeMusic() {
  if (!music.value?.source || !music.value.media_id || subscribing.value) return
  subscribing.value = true
  try {
    const result = (await api.post('subscribe/', {
      name: music.value.title,
      year: music.value.year?.toString(),
      type: '音乐',
      media_source: music.value.source,
      media_id: music.value.media_id,
    })) as ApiResponse<{ id?: number }>
    if (result.success) toast.success(t('music.subscribeSuccess'))
    else toast.error(result.message || t('common.failed'))
  } catch (error) {
    console.error(error)
    toast.error(t('common.failed'))
  } finally {
    subscribing.value = false
  }
}

/** 将秒数格式化为详情页使用的分钟和秒。 */
function formatDuration(seconds?: number) {
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

watch([source, mediaId], loadMusicDetail, { immediate: true })
</script>

<template>
  <div class="music-detail-page">
    <VBtn variant="text" prepend-icon="mdi-arrow-left" class="mb-3" @click="router.back()">
      {{ t('music.back') }}
    </VBtn>

    <VSkeletonLoader v-if="loading" type="image, article, actions" />
    <NoDataFound v-else-if="!music" :title="t('music.noResults')" />
    <VCard v-else :key="getMusicKey(music)" class="overflow-hidden">
      <VRow no-gutters>
        <VCol cols="12" md="4" lg="3">
          <VImg
            v-if="(music.cover_url || music.poster_path) && !imageError"
            :src="music.cover_url || music.poster_path"
            aspect-ratio="1"
            cover
            @error="imageError = true"
          />
          <VSheet v-else aspect-ratio="1" class="music-detail-cover d-flex align-center justify-center">
            <VIcon icon="mdi-album" size="96" color="medium-emphasis" />
          </VSheet>
        </VCol>
        <VCol cols="12" md="8" lg="9">
          <VCardItem class="pa-6">
            <VCardTitle class="text-h4 text-wrap">{{ music.title }}</VCardTitle>
            <VCardSubtitle class="text-h6 mt-2">
              {{ music.artist || music.artists?.join(' / ') || t('common.unknown') }}
            </VCardSubtitle>
          </VCardItem>
          <VCardText class="px-6 pb-6">
            <VList bg-color="transparent" density="compact">
              <VListItem v-if="music.album" :title="t('music.album')" :subtitle="music.album" />
              <VListItem v-if="music.album_artist" :title="t('music.albumArtist')" :subtitle="music.album_artist" />
              <VListItem v-if="music.release_date || music.year" :title="t('music.releaseDate')" :subtitle="music.release_date || music.year?.toString()" />
              <VListItem v-if="music.duration" :title="t('music.duration')" :subtitle="formatDuration(music.duration)" />
              <VListItem v-if="music.isrc" title="ISRC" :subtitle="music.isrc" />
              <VListItem v-if="music.category" :title="t('music.category')" :subtitle="music.category" />
              <VListItem v-if="music.listen_count" :title="t('music.listenCount')" :subtitle="music.listen_count.toLocaleString()" />
            </VList>
          </VCardText>
          <VCardActions class="px-6 pb-6 ga-3">
            <VBtn color="primary" variant="tonal" prepend-icon="mdi-magnify" @click="searchResources">
              {{ t('music.searchResources') }}
            </VBtn>
            <VBtn
              color="primary"
              variant="tonal"
              prepend-icon="mdi-rss"
              :loading="subscribing"
              @click="subscribeMusic"
            >
              {{ t('music.subscribe') }}
            </VBtn>
          </VCardActions>
        </VCol>
      </VRow>
    </VCard>
  </div>
</template>

<style scoped>
.music-detail-page {
  max-width: 1200px;
  margin-inline: auto;
}

.music-detail-cover {
  min-block-size: 280px;
}
</style>
