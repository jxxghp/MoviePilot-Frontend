<script lang="ts" setup>
import type { MediaInfo } from '@/api/types'
import { buildMusicDetailRoute, formatMusicDuration, getMusicArtistLinks } from '@/utils/music'

const { t } = useI18n()
const router = useRouter()

const props = defineProps({
  // 专辑内的音乐列表
  tracks: {
    type: Array as PropType<MediaInfo[]>,
    default: () => [],
  },
  // 当前正在浏览的音乐 ID，用于高亮所在曲目
  activeMediaId: String,
  // 隐藏艺术家列，专辑内艺术家一致时无需重复展示
  hideArtists: {
    type: Boolean,
    default: false,
  },
})

// 按碟号分组，多碟专辑需要分别展示碟片标题
const discs = computed(() => {
  const groups = new Map<number, MediaInfo[]>()
  props.tracks.forEach(track => {
    const disc = track.disc_number || 1
    const existing = groups.get(disc)
    if (existing) existing.push(track)
    else groups.set(disc, [track])
  })
  return [...groups.entries()].map(([disc, tracks]) => ({ disc, tracks }))
})

const showDiscTitles = computed(() => discs.value.length > 1)

/** 打开曲目对应的音乐详情页。 */
function goTrack(track: MediaInfo) {
  if (!track.media_id) return
  router.push(buildMusicDetailRoute(track))
}

/** 返回曲目上展示的艺术家文本。 */
function getTrackArtists(track: MediaInfo) {
  return getMusicArtistLinks(track)
    .map(artist => artist.name)
    .join(' / ')
}
</script>

<template>
  <div class="music-track-list">
    <div v-for="group in discs" :key="group.disc">
      <div v-if="showDiscTitles" class="music-track-disc text-caption text-medium-emphasis">
        {{ t('music.discNumber', { number: group.disc }) }}
      </div>
      <VList density="compact" bg-color="transparent">
        <VListItem
          v-for="track in group.tracks"
          :key="track.media_id || track.title"
          class="music-track-item"
          :class="{ 'music-track-item--active': track.media_id === props.activeMediaId }"
          @click="goTrack(track)"
        >
          <template #prepend>
            <span class="music-track-number text-caption text-medium-emphasis">
              {{ track.track_number || '-' }}
            </span>
          </template>
          <VListItemTitle class="music-track-title">{{ track.title }}</VListItemTitle>
          <VListItemSubtitle v-if="!props.hideArtists && getTrackArtists(track)" class="text-caption">
            {{ getTrackArtists(track) }}
          </VListItemSubtitle>
          <template #append>
            <span class="text-caption text-medium-emphasis">{{ formatMusicDuration(track.duration) }}</span>
          </template>
        </VListItem>
      </VList>
    </div>
  </div>
</template>

<style scoped>
.music-track-disc {
  font-weight: 700;
  margin-block-start: 0.75rem;
  text-transform: uppercase;
}

.music-track-item {
  border-radius: var(--app-control-radius);
  cursor: pointer;
}

.music-track-item--active {
  background: rgba(var(--v-theme-primary), 0.12);
}

.music-track-number {
  display: inline-block;
  inline-size: 2rem;
  text-align: end;
  margin-inline-end: 0.75rem;
}

.music-track-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
