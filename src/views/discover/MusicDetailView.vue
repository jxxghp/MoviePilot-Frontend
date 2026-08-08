<script lang="ts" setup>
import api from '@/api'
import type { MediaInfo, MusicAlbumInfo } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import MusicArtistSlideView from '@/views/discover/MusicArtistSlideView.vue'
import MusicDetailLayout from '@/views/discover/MusicDetailLayout.vue'
import MusicTrackList from '@/components/music/MusicTrackList.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { getMediaSubscribeId, useMediaSubscribe } from '@/composables/useMediaSubscribe'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import {
  buildMusicAlbumRoute,
  buildMusicArtistRoute,
  buildMusicResourceRoute,
  formatMusicDuration,
  getMusicArtistLinks,
} from '@/utils/music'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  // MusicBrainz 单曲 ID
  mediaid: String,
  // 音乐元数据来源
  source: {
    type: String,
    default: 'musicbrainz',
  },
})

const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

const isRefreshed = ref(false)
const music = ref<MediaInfo>()
const album = ref<MusicAlbumInfo>()
const isSubscribed = ref(false)

// 可点击跳转的艺术家
const artistLinks = computed(() => getMusicArtistLinks(music.value))

// 关联浏览统一以首个艺术家为入口，MusicBrainz 的主署名艺术家排在最前
const primaryArtistId = computed(() => artistLinks.value.find(artist => artist.id)?.id)

// 头部属性行，只展示 MusicBrainz 实际返回的字段
const attributes = computed(() => {
  const values: string[] = []
  if (music.value?.category) values.push(music.value.category)
  const releaseDate = music.value?.release_date || music.value?.year?.toString()
  if (releaseDate) values.push(releaseDate)
  const duration = formatMusicDuration(music.value?.duration)
  if (duration) values.push(duration)
  return values
})

// 专辑内除当前单曲外仍然展示完整曲目，方便对照曲序
const albumTracks = computed(() => album.value?.tracks ?? [])

function getSubscribeStatusKey() {
  return `${getMediaSubscribeId(music.value)}::all`
}

const subscribeActions = useMediaSubscribe({
  media: () => music.value,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  getSubscribeStatusKey,
})

/** 加载单曲详情，并按所属专辑补全曲目列表。 */
async function loadMusicDetail() {
  if (!props.source || !props.mediaid) return
  isRefreshed.value = false
  album.value = undefined
  try {
    music.value = await api.post('music/recognize', {
      source: props.source,
      media_id: props.mediaid,
    })
  } catch (error) {
    console.error(error)
    music.value = undefined
  } finally {
    isRefreshed.value = true
  }
  // 订阅只保存来源和 ID，专辑订阅同样会进入本页，识别为专辑后改由专辑详情页承载
  if (music.value?.music_type === 'album' && music.value.media_id) {
    router.replace(buildMusicAlbumRoute(music.value.media_id, music.value.title, props.source))
    return
  }
  await Promise.all([loadAlbum(), checkSubscribeStatus()])
}

/** 加载所属专辑，用于展示专辑信息和专辑内的其它音乐。 */
async function loadAlbum() {
  const albumId = music.value?.album_id
  if (!albumId) return
  try {
    album.value = await api.get(`music/album/${albumId}`, { params: { source: props.source } })
  } catch (error) {
    console.error(error)
  }
}

/** 查询订阅状态，决定心形图标是实心还是空心。 */
async function checkSubscribeStatus() {
  if (!canSubscribe.value || !music.value?.media_id) return
  try {
    isSubscribed.value = await subscribeActions.checkSubscribe(null)
  } catch (error) {
    console.error(error)
  }
}

/** 进入站点资源精确搜索。 */
function goResource() {
  if (!music.value) return
  const target = buildMusicResourceRoute(music.value)
  if (target) router.push(target)
}

/** 打开所属专辑详情页。 */
function goAlbum() {
  if (!music.value?.album_id) return
  router.push(buildMusicAlbumRoute(music.value.album_id, music.value.album, props.source))
}

/** 打开艺术家详情页。 */
function goArtist(artistId?: string, name?: string) {
  if (!artistId) return
  router.push(buildMusicArtistRoute(artistId, name, props.source))
}

watch(() => [props.source, props.mediaid], loadMusicDetail, { immediate: true })
</script>

<template>
  <LoadingBanner v-if="!isRefreshed" class="mt-12" />
  <MusicDetailLayout
    v-else-if="music"
    :cover="music.cover_url || music.poster_path"
    :title="music.title"
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
      <VBtn v-if="canSearch" variant="tonal" color="primary" prepend-icon="mdi-magnify" @click="goResource">
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
      <div v-if="music.album" class="music-fact">
        <span>{{ t('music.album') }}</span>
        <span class="music-fact-value">
          <a v-if="music.album_id" class="music-link" role="link" tabindex="0" @click="goAlbum">{{ music.album }}</a>
          <span v-else>{{ music.album }}</span>
        </span>
      </div>
      <div v-if="music.album_artist" class="music-fact">
        <span>{{ t('music.albumArtist') }}</span>
        <span class="music-fact-value">{{ music.album_artist }}</span>
      </div>
      <div v-if="music.release_date || music.year" class="music-fact">
        <span>{{ t('music.releaseDate') }}</span>
        <span class="music-fact-value">{{ music.release_date || music.year }}</span>
      </div>
      <div v-if="music.duration" class="music-fact">
        <span>{{ t('music.duration') }}</span>
        <span class="music-fact-value">{{ formatMusicDuration(music.duration) }}</span>
      </div>
      <div v-if="music.track_number" class="music-fact">
        <span>{{ t('music.track') }}</span>
        <span class="music-fact-value">
          {{ music.disc_number ? `${music.disc_number}-${music.track_number}` : music.track_number }}
        </span>
      </div>
      <div v-if="music.isrc" class="music-fact">
        <span>ISRC</span>
        <span class="music-fact-value">{{ music.isrc }}</span>
      </div>
      <div v-if="music.listen_count" class="music-fact">
        <span>{{ t('music.listenCount') }}</span>
        <span class="music-fact-value">{{ music.listen_count.toLocaleString() }}</span>
      </div>
      <div class="music-fact music-fact--last">
        <span>MusicBrainz ID</span>
        <span class="music-fact-value music-fact-id">{{ music.media_id }}</span>
      </div>
    </template>

    <template #body>
      <div v-if="music.genres?.length" class="d-flex flex-wrap ga-2">
        <VChip v-for="genre in music.genres.slice(0, 12)" :key="genre" size="small" variant="tonal">
          {{ genre }}
        </VChip>
      </div>
      <div v-if="music.detail_link" class="mt-4">
        <a :href="music.detail_link" target="_blank" rel="noopener noreferrer" class="music-external-link">
          <VIcon icon="mdi-link" />
          <span class="ms-1">MusicBrainz</span>
        </a>
      </div>
    </template>

    <div v-if="albumTracks.length" class="music-section">
      <div class="slider-header">
        <RouterLink
          v-if="music.album_id"
          :to="buildMusicAlbumRoute(music.album_id, music.album, props.source)"
          class="slider-title"
        >
          <span>{{ t('music.albumTracks') }}</span>
          <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
        </RouterLink>
        <span v-else class="slider-title">{{ t('music.albumTracks') }}</span>
      </div>
      <MusicTrackList :tracks="albumTracks" :active-media-id="music.media_id" hide-artists />
    </div>

    <div v-if="primaryArtistId" class="music-section">
      <MusicArtistSlideView :apipath="`music/artist/${primaryArtistId}/related`" :title="t('music.relatedArtists')" />
    </div>

    <div v-if="primaryArtistId" class="music-section">
      <div class="slider-header">
        <RouterLink
          :to="buildMusicArtistRoute(primaryArtistId, artistLinks[0]?.name, props.source)"
          class="slider-title"
        >
          <span>{{ t('music.artistAlbums') }}</span>
          <VIcon icon="mdi-arrow-right-circle-outline" class="ms-1" />
        </RouterLink>
      </div>
      <MediaCardSlideView :apipath="`music/artist/${primaryArtistId}/albums`" />
    </div>
  </MusicDetailLayout>
  <NoDataFound v-else error-code="404" :error-title="t('music.noResults')" :error-description="t('error.networkError')">
    <template #button>
      <VBtn prepend-icon="mdi-refresh" variant="tonal" @click="loadMusicDetail">{{ t('common.retry') }}</VBtn>
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
