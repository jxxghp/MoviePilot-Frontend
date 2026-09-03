<script lang="ts" setup>
import type { MediaInfo } from '@/api/types'
import { useGlobalSettingsStore, useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useMediaSubscribe } from '@/composables/useMediaSubscribe'
import { getCachedMediaSubscribeStatus } from '@/utils/mediaStatusCache'
import { useMusicSiteSearch } from '@/composables/useMusicSiteSearch'
import {
  buildMusicAlbumRoute,
  buildMusicArtistRoute,
  buildMusicDetailRoute,
  buildMusicResourceRoute,
  formatMusicDuration,
  formatMusicAudioSpecs,
  getMusicArtistLinks,
  getMusicKey,
  getMusicSourceLabel,
} from '@/utils/music'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  music: Object as PropType<MediaInfo>,
})

const userStore = useUserStore()
const globalSettingsStore = useGlobalSettingsStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))
const isActionableMedia = computed(() => props.music?.music_type !== 'artist')

// 封面加载失败后改用专辑占位图标
const imageLoadError = ref(false)

// 当前订阅状态
const isSubscribed = ref(false)

// 可点击跳转的艺术家
const artistLinks = computed(() => getMusicArtistLinks(props.music))
const sourceLabel = computed(() => getMusicSourceLabel(props.music?.media_source, t))
const sourceMeta = computed(() => {
  const sources: Record<string, { color: string; icon: string }> = {
    musicbrainz: { color: '#eb743b', icon: 'mdi-music-circle' },
    theaudiodb: { color: '#35a7a0', icon: 'mdi-music-box-multiple' },
    doubanmusic: { color: '#00b51d', icon: 'mdi-music-circle' },
  }
  return sources[props.music?.media_source || 'musicbrainz'] || { color: 'primary', icon: 'mdi-database-outline' }
})

// 音乐实体标签和图标
const entityMeta = computed(() => {
  const entities = {
    album: { icon: 'mdi-album', label: t('music.entityAlbum') },
    artist: { icon: 'mdi-account-music', label: t('music.entityArtist') },
    recording: { icon: 'mdi-music-note', label: t('music.entityRecording') },
  }
  return entities[props.music?.music_type || 'recording']
})

// 卡片只展示标准音乐模型中已映射的稳定字段
const metaItems = computed(() => {
  const items: { hideOnNarrow?: boolean; icon: string; label: string }[] = []
  const category = props.music?.metadata_category || props.music?.album_type
  if (category) items.push({ hideOnNarrow: true, icon: 'mdi-label-outline', label: category })
  const releaseDate = props.music?.release_date || props.music?.year?.toString()
  if (releaseDate) items.push({ icon: 'mdi-calendar-blank-outline', label: releaseDate })
  const duration = formatMusicDuration(props.music?.duration)
  if (duration) items.push({ icon: 'mdi-clock-outline', label: duration })
  const audioSpecs = formatMusicAudioSpecs(props.music)
  if (audioSpecs) items.push({ icon: 'mdi-waveform', label: audioSpecs })
  if (props.music?.track_number)
    items.push({
      hideOnNarrow: true,
      icon: 'mdi-counter',
      label: t('music.trackNumber', { number: props.music.track_number }),
    })
  if (props.music?.listen_count)
    items.push({
      hideOnNarrow: true,
      icon: 'mdi-chart-line',
      label: t('music.listenCountValue', { count: props.music.listen_count.toLocaleString() }),
    })
  return items
})

const rawCoverUrl = computed(() => props.music?.cover_url || props.music?.poster_path || '')
const coverUrl = computed(() =>
  getDisplayImageUrl(rawCoverUrl.value, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)
const showCover = computed(() => Boolean(coverUrl.value) && !imageLoadError.value)

/** 生成订阅状态缓存键。 */
function getSubscribeStatusKey() {
  return `${props.music ? getMusicKey(props.music) : ''}::all`
}

const subscribeActions = useMediaSubscribe({
  media: () => props.music,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  getSubscribeStatusKey,
})

const { openMusicSiteSearch } = useMusicSiteSearch(sites =>
  props.music ? buildMusicResourceRoute(props.music, sites) : undefined,
)

/** 查询当前音乐是否已订阅，用于决定心形图标是实心还是空心。 */
async function checkSubscribeStatus() {
  if (!isActionableMedia.value || !canSubscribe.value || !props.music?.media_id) return
  try {
    isSubscribed.value = await getCachedMediaSubscribeStatus(getSubscribeStatusKey(), () =>
      subscribeActions.checkSubscribe(null),
    )
  } catch (error) {
    console.error(error)
  }
}

/** 打开音乐详情页。 */
function goDetail() {
  if (!props.music) return
  router.push(buildMusicDetailRoute(props.music))
}

/** 打开所属专辑详情页。 */
function goAlbum() {
  if (!props.music?.album_id || !props.music.media_source) return
  router.push(buildMusicAlbumRoute(props.music.album_id, props.music.album, props.music.media_source))
}

/** 打开艺术家详情页。 */
function goArtist(artistId?: string, name?: string) {
  if (!artistId || !props.music?.media_source) return
  router.push(buildMusicArtistRoute(artistId, name, props.music.media_source))
}

watch(
  () => coverUrl.value,
  () => {
    imageLoadError.value = false
  },
)

watch(() => props.music?.media_id, checkSubscribeStatus)

onMounted(checkSubscribeStatus)
</script>

<template>
  <VHover>
    <template #default="hover">
      <div v-bind="hover.props" class="music-card-hover-area h-100">
        <VCard
          class="music-card app-hover-lift-card h-100 cursor-pointer"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
          @click="goDetail"
        >
          <div class="music-card-content">
            <div class="music-card-cover-column">
              <div class="music-card-cover-shell">
                <VImg v-if="showCover" :src="coverUrl" cover class="music-card-cover" @error="imageLoadError = true">
                  <template #placeholder>
                    <VSkeletonLoader class="h-100" />
                  </template>
                </VImg>
                <VIcon v-else :icon="entityMeta.icon" size="44" color="medium-emphasis" />

                <VChip :prepend-icon="entityMeta.icon" size="x-small" variant="flat" class="music-card-entity">
                  {{ entityMeta.label }}
                </VChip>
              </div>
              <div class="music-card-source-row">
                <VChip
                  data-testid="music-source"
                  :color="sourceMeta.color"
                  :prepend-icon="sourceMeta.icon"
                  class="music-card-source"
                  size="x-small"
                  variant="tonal"
                >
                  {{ sourceLabel }}
                </VChip>
              </div>
            </div>

            <div class="music-card-body">
              <div class="music-card-heading">
                <div class="music-card-title" :title="props.music?.title">{{ props.music?.title }}</div>
                <VChip
                  v-if="props.music?.version"
                  :title="props.music.version"
                  size="x-small"
                  variant="tonal"
                  class="music-card-version"
                >
                  {{ props.music.version }}
                </VChip>
              </div>

              <div v-if="props.music?.music_type !== 'artist'" class="music-card-supporting text-medium-emphasis">
                <VIcon icon="mdi-account-music" size="16" />
                <div class="music-card-artists">
                  <template v-if="artistLinks.length">
                    <template v-for="(artist, index) in artistLinks" :key="`${artist.name}-${index}`">
                      <span v-if="index > 0"> / </span>
                      <a
                        v-if="artist.id"
                        class="music-card-link"
                        role="link"
                        tabindex="0"
                        @click.stop="goArtist(artist.id, artist.name)"
                        @keydown.enter.stop="goArtist(artist.id, artist.name)"
                        >{{ artist.name }}</a
                      >
                      <span v-else>{{ artist.name }}</span>
                    </template>
                  </template>
                  <span v-else>{{ t('common.unknown') }}</span>
                </div>
              </div>

              <div
                v-if="props.music?.album && props.music?.music_type !== 'album'"
                class="music-card-supporting text-medium-emphasis"
              >
                <VIcon icon="mdi-album" size="16" />
                <div class="music-card-album">
                  <span>{{ t('music.album') }}：</span>
                  <a
                    v-if="props.music.album_id"
                    class="music-card-link"
                    role="link"
                    tabindex="0"
                    @click.stop="goAlbum"
                    @keydown.enter.stop="goAlbum"
                    >{{ props.music.album }}</a
                  >
                  <span v-else>{{ props.music.album }}</span>
                </div>
              </div>

              <div class="music-card-footer">
                <div class="music-card-meta">
                  <VChip
                    v-for="item in metaItems"
                    :key="`${item.icon}-${item.label}`"
                    :prepend-icon="item.icon"
                    :class="{ 'music-card-meta-item--narrow-optional': item.hideOnNarrow }"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ item.label }}
                  </VChip>
                </div>

                <div class="music-card-actions">
                  <IconBtn
                    v-if="canSubscribe && isActionableMedia"
                    :icon="isSubscribed ? 'mdi-heart' : 'mdi-heart-outline'"
                    :color="isSubscribed ? 'error' : 'medium-emphasis'"
                    :aria-label="isSubscribed ? t('music.unsubscribe') : t('music.subscribe')"
                    :title="isSubscribed ? t('music.unsubscribe') : t('music.subscribe')"
                    size="small"
                    variant="tonal"
                    @click.stop="subscribeActions.handleSubscribe()"
                  />
                  <IconBtn
                    v-if="canSearch && isActionableMedia"
                    icon="mdi-magnify"
                    color="primary"
                    :aria-label="t('music.searchResources')"
                    :title="t('music.searchResources')"
                    size="small"
                    variant="tonal"
                    @click.stop="openMusicSiteSearch"
                  />
                </div>
              </div>
            </div>
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
.music-card-hover-area {
  inline-size: 100%;
}

.music-card {
  min-block-size: 144px;
  overflow: hidden;
}

.music-card-content {
  display: grid;
  block-size: 100%;
  gap: 1rem;
  grid-template-columns: 112px minmax(0, 1fr);
  padding: 1rem;
}

.music-card-cover-column {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  inline-size: 112px;
  min-inline-size: 0;
}

.music-card-cover-shell {
  position: relative;
  display: flex;
  overflow: hidden;
  align-items: center;
  align-self: start;
  justify-content: center;
  aspect-ratio: 1;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  inline-size: 112px;
}

.music-card-cover {
  block-size: 100%;
  inline-size: 100%;
  transition: transform 0.3s ease;
}

.music-card.app-hover-lift-card--hovering .music-card-cover {
  transform: scale(1.035);
}

.music-card-entity {
  position: absolute;
  z-index: 1;
  background: rgba(var(--v-theme-surface), 0.88) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  inset-block-end: 0.5rem;
  inset-inline-start: 0.5rem;
  max-inline-size: calc(100% - 1rem);
}

.music-card-body {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
}

.music-card-source-row {
  display: flex;
  align-items: center;
  justify-content: center;
  min-block-size: 20px;
  min-inline-size: 0;
}

.music-card-source {
  max-inline-size: 100%;
  min-inline-size: 0;
}

.music-card-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.music-card-title {
  overflow: hidden;
  display: -webkit-box;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1rem;
  flex: 1 1 auto;
  font-weight: 600;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  letter-spacing: 0;
  line-height: 1.4;
  min-inline-size: 0;
}

.music-card-version {
  flex: 0 1 auto;
  margin-block-start: 0.125rem;
  max-inline-size: min(45%, 12rem);
  min-inline-size: 0;
}

.music-card-source :deep(.v-chip__content),
.music-card-version :deep(.v-chip__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-card-supporting {
  display: flex;
  align-items: center;
  font-size: 0.8125rem;
  gap: 0.375rem;
  line-height: 1.35;
  margin-block-start: 0.35rem;
}

.music-card-artists,
.music-card-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-card-link {
  color: inherit;
  cursor: pointer;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.2s ease;
}

.music-card-link:hover {
  color: rgb(var(--v-theme-primary));
}

.music-card-footer {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  margin-block-start: auto;
  padding-block-start: 0.65rem;
}

.music-card-meta,
.music-card-actions {
  display: flex;
  align-items: center;
}

.music-card-meta {
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-inline-size: 0;
}

.music-card-actions {
  flex: 0 0 auto;
  gap: 0.25rem;
}

@media (width <= 600px) {
  .music-card {
    min-block-size: 120px;
  }

  .music-card-content {
    gap: 0.75rem;
    grid-template-columns: 88px minmax(0, 1fr);
    padding: 0.75rem;
  }

  .music-card-cover-shell {
    inline-size: 88px;
  }

  .music-card-cover-column {
    inline-size: 88px;
  }

  .music-card-body {
    position: relative;
  }

  .music-card-heading {
    align-items: center;
    min-block-size: 40px;
    padding-inline-end: 5.5rem;
  }

  .music-card-entity {
    inset-block-end: 0.375rem;
    inset-inline-start: 0.375rem;
    max-inline-size: calc(100% - 0.75rem);
  }

  .music-card-footer {
    display: block;
    padding-block-start: 0.5rem;
  }

  .music-card-actions {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
  }

  .music-card-actions :deep(.v-btn) {
    block-size: 40px;
    inline-size: 40px;
  }
}

@media (width <= 360px) {
  .music-card-meta-item--narrow-optional {
    display: none;
  }
}
</style>
