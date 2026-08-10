<script lang="ts" setup>
import type { PropType } from 'vue'
import type { Context } from '@/api/types'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { formatMusicDuration, getMusicAudioSpecItems } from '@/utils/music'

const { t } = useI18n()
const globalSettingsStore = useGlobalSettingsStore()

// 输入参数
const props = defineProps({
  context: Object as PropType<Context>,
})

// 音乐元数据使用 title，影视元数据使用 name，识别结果卡片统一兼容两种字段。
const recognizedName = computed(() => props.context?.meta_info?.name || props.context?.meta_info?.title)

// 是否为音乐识别结果
const isMusic = computed(() => props.context?.media_info?.type === '音乐' || props.context?.meta_info?.type === '音乐')

// 音乐封面加载失败时保留方形唱片占位，避免弹窗信息结构塌缩。
const musicCoverLoadError = ref(false)

// TMDB图片转换为w500大小
function getW500Image(url = '') {
  if (!url) return ''
  return url.replace('original', 'w500')
}

// 打开TMDB详情页面
function openTmdbPage(type: string, tmdbId: number) {
  if (!type || !tmdbId) return

  const url = `https://www.themoviedb.org/${type === '电影' ? 'movie' : 'tv'}/${tmdbId}`
  window.open(url, '_blank')
}

// 音乐封面优先使用方形封面，仅 W500 图片处理对TMDB类 URL 生效
const rawMusicCover = computed(() =>
  getW500Image(props.context?.media_info?.cover_url || props.context?.media_info?.poster_path || ''),
)
const musicCover = computed(() =>
  getDisplayImageUrl(rawMusicCover.value, globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)

// 影视识别海报与音乐封面使用同一全局图片缓存开关。
const mediaPoster = computed(() =>
  getDisplayImageUrl(
    getW500Image(props.context?.media_info?.poster_path || ''),
    globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
  ),
)

// 音乐艺术家优先使用标准识别结果，远端未命中时回退到文件标签。
const musicArtist = computed(() => {
  const mediaInfo = props.context?.media_info
  const metaInfo = props.context?.meta_info
  return (
    mediaInfo?.artist || mediaInfo?.artists?.join(' / ') || metaInfo?.artist || metaInfo?.artists?.join(' / ') || ''
  )
})

// 专辑艺术家只在与歌曲艺术家不同时单独展示。
const musicAlbumArtist = computed(() => {
  const albumArtist = props.context?.media_info?.album_artist || props.context?.meta_info?.album_artist
  return albumArtist && albumArtist !== musicArtist.value ? albumArtist : ''
})

// 音乐专辑优先使用标准识别结果，远端未命中时回退到文件标签。
const musicAlbum = computed(() => props.context?.media_info?.album || props.context?.meta_info?.album || '')

// 音乐实体类型转换为面向用户的本地化名称。
const musicTypeLabel = computed(() => {
  const labels = {
    album: t('music.entityAlbum'),
    artist: t('music.entityArtist'),
    recording: t('music.entityRecording'),
  }
  const musicType = props.context?.media_info?.music_type
  return musicType ? labels[musicType] : ''
})

// 音乐标题下方汇总发行时间、时长和曲序，信息密度与影视识别结果保持一致。
const musicSummary = computed(() => {
  const mediaInfo = props.context?.media_info
  const metaInfo = props.context?.meta_info
  const values: string[] = []
  const releaseDate = mediaInfo?.release_date || mediaInfo?.year || metaInfo?.year
  if (releaseDate) values.push(String(releaseDate))
  const duration = formatMusicDuration(mediaInfo?.duration || metaInfo?.duration)
  if (duration) values.push(duration)
  const trackNumber = mediaInfo?.track_number || metaInfo?.track_number
  const totalTracks = mediaInfo?.total_tracks || metaInfo?.total_tracks
  if (trackNumber) {
    const track = totalTracks ? `${trackNumber}/${totalTracks}` : String(trackNumber)
    values.push(`${t('music.track')} ${track}`)
  }
  return values.join(' · ')
})

// 本地文件实际参数优先，资源标题识别场景回退到标准音乐信息。
const musicAudioChips = computed(() => {
  const metaInfo = props.context?.meta_info
  const mediaInfo = props.context?.media_info
  return getMusicAudioSpecItems({
    audio_format: metaInfo?.audio_format || mediaInfo?.audio_format,
    bit_depth: metaInfo?.bit_depth || mediaInfo?.bit_depth,
    sample_rate: metaInfo?.sample_rate || mediaInfo?.sample_rate,
    bitrate: metaInfo?.bitrate || mediaInfo?.bitrate,
  })
})

// 音乐详情外链
const musicLink = computed(() => props.context?.media_info?.detail_link || '')

// 打开音乐详情外链
function openMusicDetail() {
  if (musicLink.value) window.open(musicLink.value, '_blank')
}

watch(musicCover, () => {
  musicCoverLoadError.value = false
})
</script>

<template>
  <div v-show="context">
    <VCol>
      <div v-if="recognizedName" class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
        <div v-if="isMusic" class="ma-auto recognized-music-cover">
          <VImg
            v-if="musicCover && !musicCoverLoadError"
            width="10rem"
            aspect-ratio="1"
            class="object-cover rounded-lg ring-1 ring-gray-500"
            :src="musicCover"
            cover
            eager
            @error="musicCoverLoadError = true"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover" />
              </div>
            </template>
          </VImg>
          <VSheet
            v-else
            width="10rem"
            height="10rem"
            rounded="lg"
            class="d-flex align-center justify-center music-cover-placeholder"
          >
            <VIcon icon="mdi-album" size="64" color="medium-emphasis" />
          </VSheet>
        </div>
        <div v-else-if="mediaPoster" class="ma-auto">
          <VImg
            width="10rem"
            aspect-ratio="2/3"
            class="object-cover aspect-w-2 aspect-h-3 rounded-lg ring-1 ring-gray-500"
            :src="mediaPoster"
            cover
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>
        </div>
        <div class="flex-grow">
          <VCardItem class="pb-1">
            <div class="text-center text-md-left text-h6 font-weight-bold line-clamp-2 overflow-hidden text-ellipsis">
              {{ context?.media_info?.title || recognizedName }}
              <span v-if="context?.meta_info?.season_episode" class="text-sm text-medium-emphasis align-top">
                {{ context?.meta_info?.season_episode }}
              </span>
            </div>
            <div v-if="isMusic" class="music-recognition-summary text-center text-md-left">
              <div v-if="musicArtist" class="text-body-1 font-weight-medium text-high-emphasis">
                {{ musicArtist }}
              </div>
              <div v-if="musicAlbum" class="text-body-2 text-medium-emphasis">
                {{ t('music.album') }}：{{ musicAlbum }}
              </div>
              <div v-if="musicAlbumArtist" class="text-body-2 text-medium-emphasis">
                {{ t('music.albumArtist') }}：{{ musicAlbumArtist }}
              </div>
              <div v-if="musicSummary" class="text-body-2 text-medium-emphasis">
                {{ musicSummary }}
              </div>
            </div>
            <VCardSubtitle v-else class="text-center text-md-left">
              {{ context?.media_info?.year || context?.meta_info?.year }}
            </VCardSubtitle>
          </VCardItem>

          <VCardText
            v-if="context?.media_info?.overview"
            class="line-clamp-4 overflow-hidden text-ellipsis text-center text-md-left ..."
          >
            {{ context?.media_info?.overview }}
          </VCardText>

          <VCardItem class="text-center text-md-left">
            <!-- 类型 -->
            <VChip
              v-if="context?.media_info?.type || context?.meta_info?.type"
              variant="elevated"
              class="me-1 mb-1 text-white bg-blue-500"
            >
              {{ context?.media_info?.type || context?.meta_info?.type }}
            </VChip>
            <!-- 音乐实体类型 -->
            <VChip
              v-if="isMusic && context?.media_info?.music_type"
              variant="elevated"
              class="me-1 mb-1 text-white bg-blue-500"
            >
              {{ musicTypeLabel }}
            </VChip>
            <!-- 音乐分类 -->
            <VChip
              v-if="isMusic && (context?.media_info?.category || context?.media_info?.album_type)"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ context?.media_info?.category || context?.media_info?.album_type }}
            </VChip>
            <!-- 风格 -->
            <VChip
              v-for="genre in isMusic ? context?.media_info?.genres : []"
              :key="genre"
              variant="elevated"
              class="me-1 mb-1 text-white bg-purple-500"
            >
              {{ genre }}
            </VChip>
            <!-- 音频技术参数 -->
            <VChip
              v-for="audioChip in isMusic ? musicAudioChips : []"
              :key="audioChip"
              variant="elevated"
              class="me-1 mb-1 text-white bg-orange-500"
            >
              {{ audioChip }}
            </VChip>
            <!-- ISRC -->
            <VChip
              v-if="isMusic && context?.media_info?.isrc"
              variant="elevated"
              class="me-1 mb-1 text-white bg-red-500"
            >
              {{ context?.media_info?.isrc }}
            </VChip>
            <!-- MusicBrainz 外链 -->
            <VChip
              v-if="isMusic && musicLink"
              variant="elevated"
              class="me-1 mb-1 text-white bg-green-500"
              @click="openMusicDetail"
            >
              详情
            </VChip>
            <!-- 二级分类 -->
            <VChip
              v-if="!isMusic && context?.media_info?.category"
              variant="elevated"
              class="me-1 mb-1 text-white bg-blue-500"
            >
              {{ context?.media_info?.category }}
            </VChip>
            <!-- TMDBID -->
            <VChip
              v-if="!isMusic && context?.media_info?.tmdb_id"
              variant="elevated"
              class="me-1 mb-1 text-white bg-green-500"
              @click="openTmdbPage(context?.media_info?.type || '', context?.media_info?.tmdb_id)"
            >
              {{ context?.media_info?.tmdb_id }}
            </VChip>
            <!-- meta_info（音乐不显示影视资源信息） -->
            <template v-if="!isMusic">
              <VChip
                v-if="context?.meta_info?.web_source"
                variant="elevated"
                class="me-1 mb-1 text-white bg-purple-500"
              >
                {{ context?.meta_info?.web_source }}
              </VChip>
              <VChip v-if="context?.meta_info?.edition" variant="elevated" class="me-1 mb-1 text-white bg-red-500">
                {{ context?.meta_info?.edition }}
              </VChip>
              <VChip v-if="context?.meta_info?.resource_pix" variant="elevated" class="me-1 mb-1 text-white bg-red-500">
                {{ context?.meta_info?.resource_pix }}
              </VChip>
              <VChip
                v-if="context?.meta_info?.video_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ context?.meta_info?.video_encode }}
              </VChip>
              <VChip
                v-if="context?.meta_info?.audio_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ context?.meta_info?.audio_encode }}
              </VChip>
              <VChip
                v-if="context?.meta_info?.resource_team"
                variant="elevated"
                class="me-1 mb-1 text-white bg-cyan-500"
              >
                {{ context?.meta_info?.resource_team }}
              </VChip>
            </template>
          </VCardItem>
        </div>
      </div>
      <VAlert v-if="!recognizedName" icon="mdi-alert-circle-outline"> 识别失败，无法识别到有效信息！ </VAlert>
    </VCol>
    <VExpansionPanels v-show="!isNullOrEmptyObject(context?.meta_info.apply_words)">
      <VExpansionPanel>
        <VExpansionPanelTitle> 识别词应用详情 </VExpansionPanelTitle>
        <VExpansionPanelText>
          <VChip variant="elevated" class="me-1 mb-1 break-all" color="primary">
            {{ context?.meta_info.org_string }}
          </VChip>
          <VChip
            v-for="(val, key) in context?.meta_info.apply_words"
            :key="key"
            :val="val"
            variant="outlined"
            color="info"
            class="me-1 mb-1 break-all"
          >
            {{ val }}
          </VChip>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>

<style scoped>
.recognized-music-cover {
  flex: 0 0 auto;
}

.music-cover-placeholder {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.music-recognition-summary {
  display: grid;
  gap: 0.2rem;
  margin-block-start: 0.35rem;
}
</style>
