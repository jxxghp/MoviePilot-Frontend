<script setup lang="ts">
import api from '@/api'
import type { MediaServerPlayItem, TmdbEpisode } from '@/api/types'
import type { PlayableEpisode } from '@/types/playback'
import MediaEpisodePickerDialog from '@/components/dialog/MediaEpisodePickerDialog.vue'
import noImage from '@images/no-image.jpeg'
import { useGlobalSettingsStore } from '@/stores'
import { useNativePageHeader } from '@/native/page'
import { getProxyImageUrl } from '@/utils/imageUtils'
import { getNativePlaybackArtworkURL, playMediaServerLibraryItem } from '@/utils/mediaPlayback'
import { useI18n } from 'vue-i18n'

/** 媒体库搜索支持的结果筛选类型。 */
type LibraryFilter = 'all' | '电视剧' | '音乐'

/** 媒体服务器提供的季、集与真实单集条目标识。 */
interface EpisodeMap {
  [season: number]: Record<number, string>
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const settings = useGlobalSettingsStore()

const searchText = ref('')
const activeFilter = ref<LibraryFilter>('all')
const results = ref<MediaServerPlayItem[]>([])
const loading = ref(false)
const failed = ref(false)
const brokenPosters = ref(new Set<string>())
const requestGeneration = ref(0)
const episodeDialog = ref(false)
const selectedSeries = ref<MediaServerPlayItem | null>(null)
const episodeMap = ref<EpisodeMap>({})
const selectedSeason = ref<number | null>(null)
const episodesLoading = ref(false)
const episodesFailed = ref(false)
const episodeMetadata = ref<Record<number, TmdbEpisode[]>>({})
let episodeGeneration = 0

const keyword = computed(() => route.query.query?.toString().trim() || '')
const seasons = computed(() =>
  Object.keys(episodeMap.value)
    .map(Number)
    .sort((left, right) => (left === 0 ? 1 : right === 0 ? -1 : left - right)),
)
const selectedEpisodes = computed(() => {
  if (selectedSeason.value === null) return []
  return Object.entries(episodeMap.value[selectedSeason.value] || {})
    .map(([episode, itemId]): PlayableEpisode => {
      const number = Number(episode)
      const metadata = episodeMetadata.value[selectedSeason.value!]?.find(item => item.episode_number === number)
      return {
        episode: number,
        itemId,
        name: metadata?.name,
        stillPath: metadata?.still_path,
        overview: metadata?.overview,
        airDate: metadata?.air_date,
        runtime: metadata?.runtime,
      }
    })
    .filter(item => Boolean(item.itemId))
    .sort((left, right) => left.episode - right.episode)
})
const seasonOptions = computed(() =>
  seasons.value.map(value => ({
    value,
    title: value === 0 ? t('media.specials') : t('media.seasonNumber', { number: value }),
  })),
)

/** 仅补充已选服务器对应系列的集元数据；旧后端或未匹配元数据时仍可按真实集号播放。 */
async function loadEpisodeMetadata(season: number) {
  const series = selectedSeries.value
  const itemId = series?.item_id || series?.id
  if (!itemId || !series?.server || episodeMetadata.value[season]) return
  const generation = episodeGeneration
  try {
    const metadata = await api.get<TmdbEpisode[]>('mediaserver/episode-metadata', {
      params: { itemid: String(itemId), server: series.server, season },
      feedback: 'silent',
    })
    if (generation === episodeGeneration) episodeMetadata.value[season] = metadata || []
  } catch {
    // 元数据属于可选展示，保留当前可播放映射，不改用标题猜测其它剧集。
  }
}

/** 切季只补充该季展示信息，不重新查询或替换媒体服务器的可播放条目标识。 */
function changeEpisodeSeason(season: number) {
  selectedSeason.value = season
  void loadEpisodeMetadata(season)
}

/** 与详情页采用相同的集海报尺寸和配置域名。 */
function episodeImage(path: string) {
  return `https://${settings.globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${path}`
}

/** 请求媒体服务器搜索当前关键词的电视剧和音乐单曲。 */
async function searchLibrary() {
  const query = keyword.value
  const generation = ++requestGeneration.value
  if (!query) {
    results.value = []
    loading.value = false
    failed.value = false
    return
  }
  loading.value = true
  failed.value = false
  try {
    const types = activeFilter.value === 'all' ? ['电视剧', '音乐'] : [activeFilter.value]
    const items = await api.get<MediaServerPlayItem[]>('mediaserver/search', {
      params: { keyword: query, type: types, limit: 40 },
      paramsSerializer: { indexes: null },
      feedback: 'silent',
    })
    if (generation === requestGeneration.value) results.value = items || []
  } catch (error) {
    console.error(error)
    if (generation === requestGeneration.value) {
      results.value = []
      failed.value = true
    }
  } finally {
    if (generation === requestGeneration.value) loading.value = false
  }
}

/** 提交输入框中的关键词并回到完整媒体库结果。 */
function submitSearch() {
  const query = searchText.value.trim()
  if (!query) return
  activeFilter.value = 'all'
  void router.replace({ path: '/media-library/search', query: { query } })
}

/** 为媒体服务器图片添加统一代理、缓存和缩略参数。 */
function posterSource(item: MediaServerPlayItem): string {
  const key = `${item.server || ''}:${item.item_id || item.id || item.title}`
  if (brokenPosters.value.has(key) || !item.image) return noImage
  return getProxyImageUrl(item.image, {
    useCache: settings.globalSettings.GLOBAL_IMAGE_CACHE,
    useCookies: item.use_cookies,
    maxWidth: 240,
    quality: 80,
  })
}

/** 图片失败后回退到项目内置占位海报。 */
function markPosterUnavailable(item: MediaServerPlayItem) {
  const key = `${item.server || ''}:${item.item_id || item.id || item.title}`
  brokenPosters.value = new Set(brokenPosters.value).add(key)
}

/** 电视剧先读取媒体服务器的已入库季集映射，再让用户选择准确单集。 */
async function openEpisodePicker(item: MediaServerPlayItem) {
  const generation = ++episodeGeneration
  selectedSeries.value = item
  episodeMap.value = {}
  selectedSeason.value = null
  episodeMetadata.value = {}
  episodesFailed.value = false
  episodeDialog.value = true
  const itemId = item.item_id || item.id
  if (!itemId || !item.server) {
    episodesFailed.value = true
    return
  }
  episodesLoading.value = true
  try {
    const data = await api.get<EpisodeMap>('mediaserver/episodes', {
      params: { itemid: String(itemId), server: item.server },
      feedback: 'silent',
    })
    if (generation !== episodeGeneration) return
    episodeMap.value = data || {}
    selectedSeason.value = seasons.value[0] ?? null
    episodesFailed.value = seasons.value.length === 0
    if (selectedSeason.value !== null) void loadEpisodeMetadata(selectedSeason.value)
  } catch (error) {
    console.error(error)
    if (generation === episodeGeneration) episodesFailed.value = true
  } finally {
    if (generation === episodeGeneration) episodesLoading.value = false
  }
}

/** 选择媒体库命中的音乐单曲后直接打开 App 原生音频播放器。 */
function playTrack(item: MediaServerPlayItem) {
  const itemId = item.item_id || item.id
  if (!itemId || !item.server) return
  const queue = results.value
    .filter(track => track.type === '音乐' && (track.item_id || track.id) && track.server)
    .map(track => ({
      itemId: String(track.item_id || track.id),
      title: track.title,
      server: track.server,
      ...(getNativePlaybackArtworkURL(track.image, track.use_cookies)
        ? { artworkURL: getNativePlaybackArtworkURL(track.image, track.use_cookies) }
        : {}),
    }))
  playMediaServerLibraryItem(
    String(itemId),
    item.title,
    item.server,
    getNativePlaybackArtworkURL(item.image, item.use_cookies),
    queue,
  )
}

/** 按所选季集条目打开原生视频播放器，并将服务器来源一并传给后端。 */
function playEpisode(item: PlayableEpisode) {
  const series = selectedSeries.value
  const season = selectedSeason.value
  if (!series || !series.server || season === null) return
  const label = `S${String(season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
  episodeDialog.value = false
  playMediaServerLibraryItem(
    item.itemId,
    `${series.title} · ${label}${item.name ? ` · ${item.name}` : ''}`,
    series.server,
  )
}

/** 选择电视剧时显示剧集清单；音乐条目则立即开始播放。 */
function openResult(item: MediaServerPlayItem) {
  if (item.type === '电视剧') void openEpisodePicker(item)
  else playTrack(item)
}

watch(
  keyword,
  value => {
    searchText.value = value
  },
  { immediate: true },
)
watch([keyword, activeFilter], searchLibrary, { immediate: true })
watch(episodeDialog, visible => {
  if (!visible) episodeGeneration++
})
onUnmounted(() => {
  episodeGeneration++
})

useNativePageHeader({ title: () => t('dialog.searchBar.mediaLibrary') })
</script>

<template>
  <main class="library-search-page app-surface">
    <header class="library-search-header">
      <form class="library-search-form" role="search" @submit.prevent="submitSearch">
        <VTextField
          v-model="searchText"
          :aria-label="t('dialog.searchBar.searchPlaceholder')"
          :placeholder="t('dialog.searchBar.searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          clearable
        />
        <VBtn icon="mdi-magnify" color="primary" variant="tonal" :aria-label="t('common.search')" type="submit" />
      </form>
      <div class="library-search-filters" role="group" :aria-label="t('dialog.searchBar.mediaLibrary')">
        <VBtnToggle v-model="activeFilter" mandatory density="comfortable" divided>
          <VBtn value="all">{{ t('common.all') }}</VBtn>
          <VBtn value="电视剧">{{ t('mediaType.tv') }}</VBtn>
          <VBtn value="音乐">{{ t('mediaType.music') }}</VBtn>
        </VBtnToggle>
      </div>
    </header>

    <section class="library-search-results" aria-live="polite">
      <LoadingBanner v-if="loading" class="py-8" />
      <div v-else-if="results.length" class="library-result-list">
        <button
          v-for="item in results"
          :key="`${item.server}:${item.item_id || item.id}`"
          class="library-result-row"
          type="button"
          :aria-label="`${item.title}, ${item.type}`"
          @click="openResult(item)"
        >
          <img
            class="library-result-poster"
            :src="posterSource(item)"
            :alt="item.title"
            loading="lazy"
            @error="markPosterUnavailable(item)"
          />
          <span class="library-result-copy">
            <span class="library-result-title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="library-result-subtitle">{{ item.subtitle }}</span>
            <span class="library-result-meta">
              <span>{{ item.type }}</span>
              <span v-if="item.year">{{ item.year }}</span>
              <span v-if="item.server">{{ item.server }}</span>
            </span>
          </span>
          <VIcon
            class="library-result-action"
            :icon="item.type === '电视剧' ? 'mdi-chevron-right' : 'mdi-play-circle-outline'"
            size="24"
            aria-hidden="true"
          />
        </button>
      </div>
      <VAlert v-else-if="failed" type="error" variant="tonal" density="compact">
        {{ t('common.requestFailed') }}
      </VAlert>
      <div v-else-if="!loading" class="library-search-empty">
        <VIcon icon="mdi-movie-open-outline" size="28" aria-hidden="true" />
        <span>{{ t('common.noData') }}</span>
      </div>
    </section>

    <MediaEpisodePickerDialog
      v-model="episodeDialog"
      :season="selectedSeason"
      :seasons="seasonOptions"
      :episodes="selectedEpisodes"
      :loading="episodesLoading"
      :failed="episodesFailed"
      :image-source="episodeImage"
      @update:season="changeEpisodeSeason"
      @play="playEpisode"
    />
  </main>
</template>

<style scoped>
.library-search-page {
  max-inline-size: 48rem;
  margin-block: 0.5rem 1.5rem;
  margin-inline: auto;
  padding: 1.25rem;
  border-radius: var(--app-surface-radius);
  color: var(--mp-fg);
}

.library-search-header {
  display: grid;
  gap: 1rem;
  padding-block-end: 1rem;
}

.library-search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 2.75rem;
  align-items: center;
  gap: 0.5rem;
}

.library-search-filters {
  display: flex;
  overflow-x: auto;
  padding-block: 0.125rem;
}

.library-result-list {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.library-result-row {
  display: grid;
  grid-template-columns: 3.75rem minmax(0, 1fr) 1.5rem;
  align-items: center;
  gap: 0.875rem;
  inline-size: 100%;
  min-block-size: 6.25rem;
  padding: 0.75rem 0.25rem;
  border: 0;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: transparent;
  color: inherit;
  text-align: start;
  cursor: pointer;
}

.library-result-row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.library-result-poster {
  inline-size: 3.75rem;
  aspect-ratio: 2 / 3;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  object-fit: cover;
}

.library-result-copy {
  display: grid;
  min-inline-size: 0;
  gap: 0.25rem;
}

.library-result-title,
.library-result-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-result-title {
  font-size: 0.975rem;
  font-weight: 600;
}

.library-result-subtitle,
.library-result-meta {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.75rem;
}

.library-result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.library-result-action {
  color: rgb(var(--v-theme-on-surface-variant));
}

.library-search-empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 3rem 1rem;
  color: rgb(var(--v-theme-on-surface-variant));
}
</style>
