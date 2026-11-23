<script lang="ts" setup>
import type { MusicArtistInfo } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { buildMusicArtistRoute, getMusicArtistSubtitle } from '@/utils/music'
import { useI18n } from 'vue-i18n'

const router = useRouter()
const globalSettingsStore = useGlobalSettingsStore()
const { t } = useI18n()

const props = defineProps({
  artist: Object as PropType<MusicArtistInfo>,
  width: String,
})

// 艺术家图片加载状态与失败回退
const isImageLoaded = ref(false)
const imageLoadError = ref(false)

const rawImageUrl = computed(() => props.artist?.image_url || props.artist?.poster_path || '')
const imageUrl = computed(() =>
  getDisplayImageUrl(rawImageUrl.value, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)
const showImage = computed(() => Boolean(imageUrl.value) && !imageLoadError.value)
const subtitle = computed(() => getMusicArtistSubtitle(props.artist))

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
                  <VAvatar
                    size="100"
                    class="music-artist-card-avatar"
                    :class="{ 'music-artist-card-avatar--loaded': showImage && isImageLoaded }"
                  >
                    <VImg
                      v-if="showImage"
                      :src="imageUrl"
                      cover
                      @load="isImageLoaded = true"
                      @error="imageLoadError = true"
                    />
                    <VIcon v-else icon="mdi-account-music" size="48" color="medium-emphasis" />
                  </VAvatar>
                </div>
                <div class="music-artist-card-kind text-caption">{{ t('person.artist') }}</div>
                <div class="music-artist-card-name w-full truncate text-center font-semibold">
                  {{ props.artist?.name }}
                </div>
                <div
                  class="music-artist-card-subtitle overflow-hidden whitespace-normal text-center text-sm text-ellipsis line-clamp-2"
                >
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

.music-artist-card {
  transition: background-color 0.2s ease;
}

.music-artist-card:hover {
  background-color: var(--mp-muted);
}

.music-artist-card-avatar {
  background: var(--mp-muted);
}

.music-artist-card-avatar--loaded {
  border: 1px solid var(--mp-border);
}

.music-artist-card-kind {
  color: var(--mp-faint);
}

.music-artist-card-name {
  color: var(--mp-fg);
}

.music-artist-card-subtitle {
  color: var(--mp-muted-fg);
}
</style>
