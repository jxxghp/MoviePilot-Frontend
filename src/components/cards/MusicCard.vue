<script lang="ts" setup>
import type { MediaInfo } from '@/api/types'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { getMediaSubscribeId, useMediaSubscribe } from '@/composables/useMediaSubscribe'
import { getCachedMediaSubscribeStatus } from '@/utils/mediaStatusCache'
import {
  buildMusicAlbumRoute,
  buildMusicArtistRoute,
  buildMusicDetailRoute,
  buildMusicResourceRoute,
  formatMusicDuration,
  getMusicArtistLinks,
} from '@/utils/music'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  music: Object as PropType<MediaInfo>,
})

const userStore = useUserStore()
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

// 封面加载失败后改用专辑占位图标
const imageLoadError = ref(false)

// 当前订阅状态
const isSubscribed = ref(false)

// 可点击跳转的艺术家
const artistLinks = computed(() => getMusicArtistLinks(props.music))

// 卡片上展示的元数据标签，只保留 MusicBrainz 实际返回的字段
const metaChips = computed(() => {
  const chips: string[] = []
  const category = props.music?.category || props.music?.album_type
  if (category) chips.push(category)
  const releaseDate = props.music?.release_date || props.music?.year?.toString()
  if (releaseDate) chips.push(releaseDate)
  const duration = formatMusicDuration(props.music?.duration)
  if (duration) chips.push(duration)
  if (props.music?.track_number) chips.push(t('music.trackNumber', { number: props.music.track_number }))
  if (props.music?.listen_count)
    chips.push(t('music.listenCountValue', { count: props.music.listen_count.toLocaleString() }))
  return chips
})

const coverUrl = computed(() => props.music?.cover_url || props.music?.poster_path || '')

function getSubscribeStatusKey() {
  return `${getMediaSubscribeId(props.music)}::all`
}

const subscribeActions = useMediaSubscribe({
  media: () => props.music,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  getSubscribeStatusKey,
})

/** 查询当前音乐是否已订阅，用于决定心形图标是实心还是空心。 */
async function checkSubscribeStatus() {
  if (!canSubscribe.value || !props.music?.media_id) return
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
  if (!props.music?.album_id) return
  router.push(buildMusicAlbumRoute(props.music.album_id, props.music.album, props.music.source))
}

/** 打开艺术家详情页。 */
function goArtist(artistId?: string, name?: string) {
  if (!artistId) return
  router.push(buildMusicArtistRoute(artistId, name, props.music?.source))
}

/** 使用音乐元数据身份进入站点资源精确搜索页。 */
function goResource() {
  if (!props.music) return
  const target = buildMusicResourceRoute(props.music)
  if (target) router.push(target)
}

watch(() => props.music?.media_id, checkSubscribeStatus)

onMounted(checkSubscribeStatus)
</script>

<template>
  <VCard class="music-card h-100 cursor-pointer" @click="goDetail">
    <div class="d-flex pa-4 ga-4">
      <VImg
        v-if="coverUrl && !imageLoadError"
        :src="coverUrl"
        width="104"
        height="104"
        cover
        rounded="lg"
        class="flex-grow-0 music-card-cover"
        @error="imageLoadError = true"
      />
      <VSheet v-else width="104" height="104" rounded="lg" class="d-flex align-center justify-center flex-grow-0">
        <VIcon icon="mdi-album" size="48" color="medium-emphasis" />
      </VSheet>

      <div class="music-card-body flex-grow-1">
        <div class="d-flex align-start ga-2">
          <div class="music-card-title text-h6">{{ props.music?.title }}</div>
          <VChip v-if="props.music?.version" size="x-small" variant="tonal" class="flex-grow-0 mt-1">
            {{ props.music.version }}
          </VChip>
        </div>

        <div class="text-body-2 text-medium-emphasis music-card-artists">
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

        <div v-if="props.music?.album" class="text-caption text-medium-emphasis mt-1 music-card-album">
          {{ t('music.album') }}：
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

        <div class="d-flex flex-wrap ga-2 mt-3">
          <VChip v-for="chip in metaChips" :key="chip" size="small" variant="tonal">{{ chip }}</VChip>
        </div>
      </div>

      <div class="music-card-actions d-flex flex-column align-center ga-1">
        <IconBtn
          v-if="canSubscribe"
          :icon="isSubscribed ? 'mdi-heart' : 'mdi-heart-outline'"
          :color="isSubscribed ? 'error' : 'medium-emphasis'"
          :aria-label="isSubscribed ? t('music.unsubscribe') : t('music.subscribe')"
          @click.stop="subscribeActions.handleSubscribe()"
        />
        <IconBtn
          v-if="canSearch"
          icon="mdi-magnify"
          color="medium-emphasis"
          :aria-label="t('music.searchResources')"
          @click.stop="goResource"
        />
      </div>
    </div>
  </VCard>
</template>

<style scoped>
.music-card-body {
  min-inline-size: 0;
}

.music-card-title {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.music-card-artists,
.music-card-album {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-card-link {
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  text-decoration: none;
}

.music-card-link:hover {
  text-decoration: underline;
}

.music-card-actions {
  flex: 0 0 auto;
}
</style>
