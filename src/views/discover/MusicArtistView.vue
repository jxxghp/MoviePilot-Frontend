<script lang="ts" setup>
import api from '@/api'
import type { MediaDataSource, MusicArtistInfo } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import MusicArtistSlideView from '@/views/discover/MusicArtistSlideView.vue'
import MusicDetailLayout from '@/views/discover/MusicDetailLayout.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { useMusicSiteSearch } from '@/composables/useMusicSiteSearch'
import { getMusicSourceLabel } from '@/utils/music'

const { t } = useI18n()

const props = defineProps<{
  // 音乐数据源原生艺术家 ID
  mediaId?: string
  // 音乐元数据来源
  mediaSource?: MediaDataSource
}>()

const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))

const isRefreshed = ref(false)
const artist = ref<MusicArtistInfo>()
const sourceLabel = computed(() => getMusicSourceLabel(props.mediaSource, t))
const encodedMediaSource = computed(() => (props.mediaSource ? encodeURIComponent(props.mediaSource) : ''))

const { openMusicSiteSearch } = useMusicSiteSearch(sites => {
  if (!artist.value?.name) return undefined
  return {
    path: '/resource',
    query: {
      keyword: artist.value.name,
      type: '音乐',
      title: artist.value.name,
      area: 'title',
      result_type: 'torrent',
      sites: sites.join(','),
    },
  }
})

// 艺术家作品按 MusicBrainz 的 Release Group 主类型分区展示
const albumSections = computed(() => [
  { type: 'album', title: t('music.albums') },
  { type: 'ep', title: t('music.eps') },
  { type: 'single', title: t('music.singles') },
])

const attributes = computed(() => {
  const values: string[] = []
  if (artist.value?.artist_type) values.push(artist.value.artist_type)
  const area = artist.value?.area || artist.value?.country
  if (area) values.push(area)
  if (artist.value?.life_span) values.push(artist.value.life_span)
  return values
})

/** 加载艺术家详情。 */
async function loadArtistDetail() {
  if (!props.mediaSource || !props.mediaId) {
    artist.value = undefined
    isRefreshed.value = true
    return
  }
  isRefreshed.value = false
  try {
    artist.value = await api.get(`music/artist/${props.mediaId}`, { params: { media_source: props.mediaSource } })
  } catch (error) {
    console.error(error)
    artist.value = undefined
  } finally {
    isRefreshed.value = true
  }
}

/** 返回指定专辑类型的浏览列表路由。 */
function getAlbumsBrowseRoute(albumType: string, title: string) {
  if (!props.mediaSource) return ''
  return `/browse/music/artist/${props.mediaId}/albums?media_source=${encodeURIComponent(props.mediaSource)}&title=${encodeURIComponent(title)}&album_type=${albumType}`
}

watch(() => [props.mediaSource, props.mediaId], loadArtistDetail, { immediate: true })
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <MusicDetailLayout
    v-else-if="artist"
    :cover="artist.image_url || artist.poster_path"
    :title="artist.name"
    :attributes="attributes"
    rounded
  >
    <template #subtitle>
      <span v-if="artist.disambiguation">{{ artist.disambiguation }}</span>
      <span v-else-if="artist.sort_name && artist.sort_name !== artist.name">{{ artist.sort_name }}</span>
    </template>

    <template #actions>
      <VBtn v-if="canSearch" variant="tonal" color="primary" prepend-icon="mdi-magnify" @click="openMusicSiteSearch">
        {{ t('music.searchResources') }}
      </VBtn>
    </template>

    <template #facts>
      <div v-if="artist.artist_type" class="music-fact">
        <span>{{ t('music.artistType') }}</span>
        <span class="music-fact-value">{{ artist.artist_type }}</span>
      </div>
      <div v-if="artist.gender" class="music-fact">
        <span>{{ t('music.gender') }}</span>
        <span class="music-fact-value">{{ artist.gender }}</span>
      </div>
      <div v-if="artist.area || artist.country" class="music-fact">
        <span>{{ t('music.area') }}</span>
        <span class="music-fact-value">{{ artist.area || artist.country }}</span>
      </div>
      <div v-if="artist.life_span" class="music-fact">
        <span>{{ t('music.lifeSpan') }}</span>
        <span class="music-fact-value">{{ artist.life_span }}</span>
      </div>
      <div v-if="artist.aliases?.length" class="music-fact">
        <span>{{ t('music.aliases') }}</span>
        <span class="music-fact-value">{{ artist.aliases.slice(0, 6).join('、') }}</span>
      </div>
      <div class="music-fact music-fact--last">
        <span>{{ sourceLabel }} ID</span>
        <span class="music-fact-value music-fact-id">{{ artist.media_id }}</span>
      </div>
    </template>

    <template #body>
      <div v-if="artist.genres?.length" class="d-flex flex-wrap ga-2">
        <VChip v-for="genre in artist.genres.slice(0, 12)" :key="genre" size="small" variant="tonal">
          {{ genre }}
        </VChip>
      </div>
      <div class="d-flex flex-wrap ga-2 mt-4">
        <a
          v-if="artist.detail_link"
          :href="artist.detail_link"
          target="_blank"
          rel="noopener noreferrer"
          class="music-external-link"
        >
          <VIcon icon="mdi-link" />
          <span class="ms-1">{{ sourceLabel }}</span>
        </a>
        <a
          v-for="(link, name) in artist.external_links || {}"
          :key="name"
          :href="link"
          target="_blank"
          rel="noopener noreferrer"
          class="music-external-link"
        >
          <VIcon icon="mdi-open-in-new" />
          <span class="ms-1">{{ name }}</span>
        </a>
      </div>
    </template>

    <div v-for="section in albumSections" :key="section.type" class="music-section">
      <MediaCardSlideView
        :apipath="`music/artist/${props.mediaId}/albums?media_source=${encodedMediaSource}&album_type=${section.type}`"
        :linkurl="getAlbumsBrowseRoute(section.type, section.title)"
        :title="section.title"
      />
    </div>

    <div v-if="props.mediaSource === 'musicbrainz'" class="music-section">
      <MusicArtistSlideView
        :apipath="`music/artist/${props.mediaId}/related?media_source=musicbrainz`"
        :title="t('music.relatedArtists')"
      />
    </div>
  </MusicDetailLayout>
  <NoDataFound
    v-else
    error-code="404"
    :error-title="t('music.artistNotFound')"
    :error-description="t('error.networkError')"
  >
    <template #button>
      <VBtn prepend-icon="mdi-refresh" variant="tonal" @click="loadArtistDetail">{{ t('common.retry') }}</VBtn>
    </template>
  </NoDataFound>
</template>

<style scoped>
.music-fact {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-block: 0.5rem;
  padding-inline: 1rem;
}

.music-fact--last {
  border-block-end: 0;
}

.music-fact-value {
  font-weight: 400;
  text-align: end;
  overflow-wrap: anywhere;
}

.music-fact-id {
  font-size: 0.75rem;
}

.music-external-link {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 9999px;
  font-size: 0.875rem;
  padding-block: 0.25rem;
  padding-inline: 0.75rem;
  text-decoration: none;
}

.music-section {
  margin-block-start: 2rem;
}
</style>
