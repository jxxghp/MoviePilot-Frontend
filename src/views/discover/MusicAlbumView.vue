<script lang="ts" setup>
import api from '@/api'
import type { MediaDataSource, MediaInfo, MusicAlbumInfo } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import MusicArtistSlideView from '@/views/discover/MusicArtistSlideView.vue'
import MusicDetailLayout from '@/views/discover/MusicDetailLayout.vue'
import MusicTrackList from '@/components/music/MusicTrackList.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { getMediaSubscribeId, useMediaSubscribe } from '@/composables/useMediaSubscribe'
import { useMusicSiteSearch } from '@/composables/useMusicSiteSearch'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import {
  buildMusicArtistRoute,
  buildMusicResourceRoute,
  formatMusicDuration,
  getMusicArtistLinks,
  getMusicSourceLabel,
} from '@/utils/music'

const { t } = useI18n()
const router = useRouter()

const props = defineProps<{
  // 音乐数据源原生专辑 ID
  mediaId?: string
  // 音乐元数据来源
  mediaSource?: MediaDataSource
}>()

const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

const isRefreshed = ref(false)
const album = ref<MusicAlbumInfo>()
const isSubscribed = ref(false)

// 可点击跳转的艺术家
const artistLinks = computed(() => getMusicArtistLinks(album.value))

// 关联浏览统一以首个艺术家为入口
const supportsArtistBrowsing = computed(() => props.mediaSource === 'musicbrainz' || props.mediaSource === 'theaudiodb')
const primaryArtistId = computed(() =>
  supportsArtistBrowsing.value ? artistLinks.value.find(artist => artist.id)?.id : undefined,
)
const sourceLabel = computed(() => getMusicSourceLabel(props.mediaSource, t))
const encodedMediaSource = computed(() => (props.mediaSource ? encodeURIComponent(props.mediaSource) : ''))

// 专辑订阅复用影视订阅链，年份需要按订阅表的字符串格式传递
const albumMedia = computed<MediaInfo | undefined>(() => {
  if (!album.value) return undefined
  return {
    ...album.value,
    type: '音乐',
    year: album.value.year?.toString(),
  } as MediaInfo
})

const attributes = computed(() => {
  const values: string[] = []
  if (album.value?.metadata_category) values.push(album.value.metadata_category)
  if (album.value?.release_date) values.push(album.value.release_date)
  if (album.value?.total_tracks) values.push(t('music.trackCount', { count: album.value.total_tracks }))
  const duration = formatMusicDuration(album.value?.duration)
  if (duration) values.push(duration)
  return values
})

function getSubscribeStatusKey() {
  return `${getMediaSubscribeId(albumMedia.value)}::all`
}

const subscribeActions = useMediaSubscribe({
  media: () => albumMedia.value,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  getSubscribeStatusKey,
})

const { openMusicSiteSearch } = useMusicSiteSearch(sites =>
  album.value ? buildMusicResourceRoute(album.value, sites) : undefined,
)

/** 加载专辑详情、曲目列表和发行版本。 */
async function loadAlbumDetail() {
  if (!props.mediaSource || !props.mediaId) {
    album.value = undefined
    isRefreshed.value = true
    return
  }
  isRefreshed.value = false
  try {
    album.value = await api.get(`music/album/${props.mediaId}`, { params: { media_source: props.mediaSource } })
  } catch (error) {
    console.error(error)
    album.value = undefined
  } finally {
    isRefreshed.value = true
  }
  await checkSubscribeStatus()
}

/** 查询订阅状态，决定心形图标是实心还是空心。 */
async function checkSubscribeStatus() {
  if (!canSubscribe.value || !album.value?.media_id) return
  try {
    isSubscribed.value = await subscribeActions.checkSubscribe(null)
  } catch (error) {
    console.error(error)
  }
}

/** 打开艺术家详情页。 */
function goArtist(artistId?: string, name?: string) {
  if (!artistId || !props.mediaSource) return
  router.push(buildMusicArtistRoute(artistId, name, props.mediaSource))
}

/** 返回发行版本的介质与地区说明。 */
function getReleaseSubtitle(release: NonNullable<MusicAlbumInfo['releases']>[number]) {
  return [release.formats?.join(' + '), release.country, release.packaging, release.status].filter(Boolean).join(' · ')
}

watch(() => [props.mediaSource, props.mediaId], loadAlbumDetail, { immediate: true })
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <MusicDetailLayout
    v-else-if="album"
    :cover="album.cover_url || album.poster_path"
    :title="album.title"
    :attributes="attributes"
  >
    <template #subtitle>
      <template v-if="artistLinks.length">
        <template v-for="(artist, index) in artistLinks" :key="`${artist.name}-${index}`">
          <span v-if="index > 0"> / </span>
          <a
            v-if="artist.id"
            class="music-link"
            role="link"
            tabindex="0"
            @click="goArtist(artist.id, artist.name)"
            @keydown.enter="goArtist(artist.id, artist.name)"
            >{{ artist.name }}</a
          >
          <span v-else>{{ artist.name }}</span>
        </template>
      </template>
      <span v-else>{{ t('common.unknown') }}</span>
    </template>

    <template #actions>
      <VBtn v-if="canSearch" variant="tonal" color="primary" prepend-icon="mdi-magnify" @click="openMusicSiteSearch">
        {{ t('music.searchResources') }}
      </VBtn>
      <VBtn
        v-if="canSubscribe"
        variant="tonal"
        :color="isSubscribed ? 'error' : 'primary'"
        :prepend-icon="isSubscribed ? 'mdi-heart' : 'mdi-heart-outline'"
        @click="subscribeActions.handleSubscribe()"
      >
        {{ isSubscribed ? t('music.unsubscribe') : t('music.subscribe') }}
      </VBtn>
    </template>

    <template #facts>
      <div v-if="album.rating" class="music-ratings">
        <VRating :model-value="album.rating" density="compact" length="10" class="ma-2" readonly />
      </div>
      <div v-if="album.album_type" class="music-fact">
        <span>{{ t('music.albumType') }}</span>
        <span class="music-fact-value">{{ album.metadata_category || album.album_type }}</span>
      </div>
      <div v-if="album.release_date" class="music-fact">
        <span>{{ t('music.releaseDate') }}</span>
        <span class="music-fact-value">{{ album.release_date }}</span>
      </div>
      <div v-if="album.total_tracks" class="music-fact">
        <span>{{ t('music.trackTotal') }}</span>
        <span class="music-fact-value">{{ album.total_tracks }}</span>
      </div>
      <div v-if="album.duration" class="music-fact">
        <span>{{ t('music.duration') }}</span>
        <span class="music-fact-value">{{ formatMusicDuration(album.duration) }}</span>
      </div>
      <div v-if="album.rating_votes" class="music-fact">
        <span>{{ t('music.ratingVotes') }}</span>
        <span class="music-fact-value">{{ album.rating_votes }}</span>
      </div>
      <div class="music-fact music-fact--last">
        <span>{{ sourceLabel }} ID</span>
        <span class="music-fact-value music-fact-id">{{ album.media_id }}</span>
      </div>
    </template>

    <template #body>
      <div v-if="album.genres?.length" class="d-flex flex-wrap ga-2">
        <VChip v-for="genre in album.genres.slice(0, 12)" :key="genre" size="small" variant="tonal">
          {{ genre }}
        </VChip>
      </div>
      <div v-if="album.detail_link" class="mt-4">
        <a :href="album.detail_link" target="_blank" rel="noopener noreferrer" class="music-external-link">
          <VIcon icon="mdi-link" />
          <span class="ms-1">{{ sourceLabel }}</span>
        </a>
      </div>
      <template v-if="album.tracks?.length">
        <h2 class="music-section-title">{{ t('music.tracks') }}</h2>
        <MusicTrackList :tracks="album.tracks" hide-artists />
      </template>
      <template v-if="album.releases?.length">
        <h2 class="music-section-title">{{ t('music.releases') }}</h2>
        <VList density="compact" bg-color="transparent">
          <VListItem v-for="release in album.releases" :key="release.media_id">
            <VListItemTitle>{{ release.title }}</VListItemTitle>
            <VListItemSubtitle class="text-caption">{{ getReleaseSubtitle(release) }}</VListItemSubtitle>
            <template #append>
              <div class="d-flex align-center ga-3">
                <span v-if="release.track_count" class="text-caption text-medium-emphasis">
                  {{ t('music.trackCount', { count: release.track_count }) }}
                </span>
                <span class="text-caption text-medium-emphasis">{{ release.date }}</span>
              </div>
            </template>
          </VListItem>
        </VList>
      </template>
    </template>

    <div v-if="primaryArtistId && props.mediaSource" class="music-section">
      <MediaCardSlideView
        :apipath="`music/artist/${primaryArtistId}/albums?media_source=${encodedMediaSource}`"
        :linkurl="`/browse/music/artist/${primaryArtistId}/albums?media_source=${encodedMediaSource}&title=${encodeURIComponent(t('music.artistAlbums'))}`"
        :title="t('music.artistAlbums')"
      />
    </div>

    <div v-if="primaryArtistId && props.mediaSource === 'musicbrainz'" class="music-section">
      <MusicArtistSlideView
        :apipath="`music/artist/${primaryArtistId}/related?media_source=musicbrainz`"
        :title="t('music.relatedArtists')"
      />
    </div>

    <div v-if="props.mediaSource === 'doubanmusic'" class="music-section">
      <MediaCardSlideView
        :apipath="`music/album/${props.mediaId}/related?media_source=doubanmusic`"
        :linkurl="`/browse/music/album/${props.mediaId}/related?media_source=doubanmusic&title=${encodeURIComponent(t('music.relatedAlbums'))}`"
        :title="t('music.relatedAlbums')"
      />
    </div>
  </MusicDetailLayout>
  <NoDataFound
    v-else
    error-code="404"
    :error-title="t('music.albumNotFound')"
    :error-description="t('error.networkError')"
  >
    <template #button>
      <VBtn prepend-icon="mdi-refresh" variant="tonal" @click="loadAlbumDetail">{{ t('common.retry') }}</VBtn>
    </template>
  </NoDataFound>
</template>

<style scoped>
.music-link {
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  text-decoration: none;
}

.music-link:hover {
  text-decoration: underline;
}

.music-ratings {
  display: flex;
  align-items: center;
  justify-content: center;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-block: 0.5rem;
}

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

.music-section-title {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.75rem;
  margin: 0;
  padding-block: 1rem;
}
</style>
