<script lang="ts" setup>
import api, { isApiBusinessFailure } from '@/api'
import type { MusicArtistInfo } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { buildMusicArtistRoute, getMusicArtistSubtitle } from '@/utils/music'

const router = useRouter()
const globalSettingsStore = useGlobalSettingsStore()

const props = defineProps({
  artist: Object as PropType<MusicArtistInfo>,
  width: String,
})

const artistImageRequests = new Map<string, Promise<string>>()

// 艺术家图片加载失败后回退到占位图标
const imageLoadError = ref(false)
const resolvedImageUrl = ref('')

const rawImageUrl = computed(() => props.artist?.image_url || props.artist?.poster_path || resolvedImageUrl.value)
const imageUrl = computed(() =>
  getDisplayImageUrl(rawImageUrl.value, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)
const showImage = computed(() => Boolean(imageUrl.value) && !imageLoadError.value)
const subtitle = computed(() => getMusicArtistSubtitle(props.artist))

/** 搜索摘要通常不含图片；按稳定艺人身份懒加载一次详情。 */
async function resolveMissingArtistImage() {
  imageLoadError.value = false
  resolvedImageUrl.value = ''
  const artist = props.artist
  if (artist?.image_url || artist?.poster_path || !artist?.media_source || !artist.media_id) return

  const key = `${artist.media_source}:${artist.media_id}`
  let request = artistImageRequests.get(key)
  if (!request) {
    request = api
      .get<MusicArtistInfo>(`music/artist/${encodeURIComponent(artist.media_id)}`, {
        params: { media_source: artist.media_source },
        feedback: 'silent',
      })
      .then(detail => detail?.image_url || detail?.poster_path || '')
      .catch(error => {
        if (!isApiBusinessFailure(error)) console.error(error)
        return ''
      })
    artistImageRequests.set(key, request)
  }
  const image = await request
  if (`${props.artist?.media_source}:${props.artist?.media_id}` === key) resolvedImageUrl.value = image
}

watch(
  () => [props.artist?.media_source, props.artist?.media_id, props.artist?.image_url, props.artist?.poster_path],
  resolveMissingArtistImage,
  { immediate: true },
)

/** 打开艺术家详情页。 */
function goArtistDetail() {
  if (!props.artist?.media_id || !props.artist.media_source) return
  router.push(buildMusicArtistRoute(props.artist.media_id, props.artist.name, props.artist.media_source))
}
</script>

<template>
  <VHover>
    <template #default="hover">
      <div v-bind="hover.props" class="music-artist-card-hover-area">
        <VCard
          :width="props.width"
          class="app-hover-lift-card"
          :class="{ 'app-hover-lift-card--hovering': hover.isHovering }"
          @click.stop="goArtistDetail"
        >
          <div class="music-artist-card relative cursor-pointer">
            <div style="padding-block-end: 150%">
              <div class="absolute inset-0 flex h-full w-full flex-col items-center p-2">
                <div class="relative mt-2 mb-4 flex h-1/2 w-full justify-center">
                  <VAvatar size="100" class="music-artist-card-avatar">
                    <VImg v-if="showImage" :src="imageUrl" cover @error="imageLoadError = true" />
                    <VIcon v-else icon="mdi-account-music" size="48" color="medium-emphasis" />
                  </VAvatar>
                </div>
                <div class="w-full truncate text-center font-bold">{{ props.artist?.name }}</div>
                <div class="overflow-hidden whitespace-normal text-center text-sm text-ellipsis line-clamp-2">
                  {{ subtitle }}
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
.music-artist-card-hover-area {
  inline-size: 100%;
}

.music-artist-card-avatar {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.music-artist-card {
  background-image: linear-gradient(45deg, rgba(var(--v-theme-background), 0.3), rgba(var(--v-theme-surface), 0.3) 60%);
}
</style>
