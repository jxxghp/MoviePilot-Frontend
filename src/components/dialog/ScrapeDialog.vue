<script lang="ts" setup>
import api from '@/api'
import type { FileItem, ManualScrapeOptions, MediaDataSource, MediaInfo, MusicEntityType } from '@/api/types'
import { useGlobalSettingsStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { isMusicMediaSource, isValidMediaSourceId } from '@/utils/mediaId'
import { useMediaSources } from '@/composables/useMediaSources'

interface ScrapeEpisodeGroup {
  id: string
  name: string
  group_count: number
  episode_count: number
}

interface EpisodeGroupOption {
  title: string
  subtitle: string
  value: string | null
}

const { t } = useI18n()

const props = defineProps({
  items: {
    type: Array as PropType<FileItem[]>,
    default: () => [],
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'scrape', options: ManualScrapeOptions): void
  (event: 'update:modelValue', value: boolean): void
}>()

const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const mediaSourceItems = getMediaSourceItems()

const globalSettingsStore = useGlobalSettingsStore()
const mediaType = ref('')
const mediaSource = ref<MediaDataSource>(getDefaultMediaSource())
const mediaId = ref<string | null>(null)
const musicType = ref<Exclude<MusicEntityType, 'artist'>>('recording')
const mediaSelectorDialog = ref(false)
const isMusicSelection = computed(() => mediaType.value === '音乐' || isMusicMediaSource(mediaSource.value))
const canSelectEpisodeGroup = computed(
  () => mediaType.value === '电视剧' && mediaSource.value === 'themoviedb',
)
// 四个可见输入项时每行放置两个字段。
const hasFourInputFields = computed(() => isMusicSelection.value || canSelectEpisodeGroup.value)
const episodeGroup = ref<string | null>(null)
const episodeGroups = ref<ScrapeEpisodeGroup[]>([])
const episodeGroupLoading = ref(false)
let episodeGroupQueryTimer: ReturnType<typeof setTimeout> | undefined
let episodeGroupRequestId = 0

// 剧集组选项与手动整理保持相同的名称、季数和集数信息。
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => [
  {
    title: t('dialog.reorganize.defaultEpisodeGroup'),
    subtitle: t('dialog.reorganize.defaultEpisodeGroupHint'),
    value: null,
  },
  ...episodeGroups.value.map(group => ({
    title: group.name,
    subtitle: `${t('dialog.reorganize.seasonCount', { count: group.group_count })} • ${t(
      'dialog.reorganize.episodeCount',
      { count: group.episode_count },
    )}`,
    value: group.id,
  })),
])

// 为剧集组菜单保留手动整理界面中的副标题布局。
function episodeGroupItemProps(item: EpisodeGroupOption) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

// 查询 TMDB 电视剧的全部剧集组，并丢弃已经过期的响应。
async function getEpisodeGroups(tmdbId: number) {
  const requestId = ++episodeGroupRequestId
  episodeGroupLoading.value = true
  try {
    const groups = await api.get<ScrapeEpisodeGroup[]>(`media/groups/${tmdbId}`)
    if (requestId === episodeGroupRequestId) episodeGroups.value = groups
  } catch (error) {
    console.error('查询手动刮削剧集组失败:', error)
    if (requestId === episodeGroupRequestId) episodeGroups.value = []
  } finally {
    if (requestId === episodeGroupRequestId) episodeGroupLoading.value = false
  }
}

// 媒体身份变化时清空旧选择，并按手动整理的节奏延迟查询 TMDB 剧集组。
watch([mediaId, mediaType, mediaSource], ([id, type, source]) => {
  episodeGroup.value = null
  episodeGroups.value = []
  episodeGroupLoading.value = false
  episodeGroupRequestId += 1
  if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)

  const normalizedTmdbId = Number(id)
  if (
    type !== '电视剧' ||
    source !== 'themoviedb' ||
    !Number.isInteger(normalizedTmdbId) ||
    normalizedTmdbId <= 0
  ) {
    return
  }

  episodeGroupQueryTimer = setTimeout(() => {
    void getEpisodeGroups(normalizedTmdbId)
  }, 400)
})

onBeforeUnmount(() => {
  if (episodeGroupQueryTimer) clearTimeout(episodeGroupQueryTimer)
  episodeGroupRequestId += 1
})

const mediaSearchHint = computed(() => {
  if (props.items.length !== 1) return ''
  const path = props.items[0]?.path || ''
  const name = path.split(/[\\/]/).filter(Boolean).at(-1) || ''
  return props.items[0]?.type === 'dir' ? name : name.replace(/\.[^.]+$/, '')
})

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogSubtitle = computed(() => {
  if (props.items.length > 1) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.items.length })
  }
  return t('dialog.reorganize.singleItemTitle', { path: props.items[0]?.path ?? '' })
})

const mediaIdLabel = computed(() => {
  const labels: Partial<Record<MediaDataSource, string>> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
    musicbrainz: 'MusicBrainz ID',
    theaudiodb: 'TheAudioDB ID',
    doubanmusic: t('dialog.reorganize.doubanId'),
  }
  return labels[mediaSource.value] ?? t('dialog.reorganize.mediaId')
})

const canSubmit = computed(() => {
  const normalizedMediaId = mediaId.value?.trim()
  return isValidMediaSourceId(normalizedMediaId, mediaSource.value)
})

// 获取后台设置中的默认识别数据源，未知值兼容回退到 TheMovieDb。
function getDefaultMediaSource(): MediaDataSource {
  const configuredSource = globalSettingsStore.globalSettings.RECOGNIZE_SOURCE as MediaDataSource
  return mediaSourceItems.value.some(item => item.value === configuredSource) ? configuredSource : 'themoviedb'
}

// 将搜索结果媒体类型映射为手动刮削接口接受的类型名。
function resolveMediaType(type?: string) {
  const normalizedType = type?.trim().toLowerCase()
  if (['电影', 'movie'].includes(normalizedType ?? '')) return '电影'
  if (['电视剧', 'tv', 'series'].includes(normalizedType ?? '')) return '电视剧'
  if (['音乐', 'music'].includes(normalizedType ?? '')) return '音乐'
  return undefined
}

/** 按当前刮削来源校验原生媒体 ID。 */
function validateMediaId(value?: string | null) {
  return isValidMediaSourceId(value, mediaSource.value) || t('dialog.reorganize.mediaIdInvalid')
}

// 选择搜索结果后同步媒体类型，减少手动填写出错。
function handleMediaSelected(item: Pick<MediaInfo, 'type' | 'music_type'>) {
  mediaType.value = resolveMediaType(item.type) ?? mediaType.value
  if (item.music_type === 'recording' || item.music_type === 'album') {
    musicType.value = item.music_type
  }
}

// 关闭弹窗并通知共享弹窗 Host 回收当前实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}

// 提交本次手动刮削的请求级识别条件。
function submitScrape() {
  const normalizedMediaId = mediaId.value?.trim()
  const options: ManualScrapeOptions = {
    media_source: mediaSource.value,
    media_id: normalizedMediaId || undefined,
    type_name: mediaType.value || undefined,
  }
  if (episodeGroup.value) options.episode_group = episodeGroup.value
  if (isMusicSelection.value) options.music_type = musicType.value
  emit('scrape', options)
}

// 切换数据源时清空上一来源的原生 ID，避免错用同一编号。
watch(mediaSource, () => {
  mediaId.value = null
  mediaSelectorDialog.value = false
  if (isMusicMediaSource(mediaSource.value)) mediaType.value = '音乐'
  else musicType.value = 'recording'
})

watch(mediaType, type => {
  if (type === '音乐' && !isMusicMediaSource(mediaSource.value)) mediaSource.value = 'musicbrainz'
})
</script>

<template>
  <VDialog v-model="dialogVisible" max-width="45rem" scrollable>
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-auto-fix" class="me-2" />
        </template>
        <VCardTitle>{{ t('file.manualScrape') }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText class="pt-6">
        <VRow>
          <VCol cols="12" md="6">
            <VSelect
              v-model="mediaType"
              :label="t('dialog.reorganize.mediaType')"
              :items="[
                { title: t('dialog.reorganize.auto'), value: '' },
                { title: t('dialog.reorganize.movie'), value: '电影' },
                { title: t('dialog.reorganize.tv'), value: '电视剧' },
                { title: t('mediaType.music'), value: '音乐' },
              ]"
              :hint="t('dialog.reorganize.mediaTypeHint')"
              persistent-hint
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VSelect
              v-model="mediaSource"
              :items="mediaSourceItems"
              :label="t('dialog.reorganize.mediaSource')"
              :hint="t('dialog.reorganize.mediaSourceHint')"
              persistent-hint
              prepend-inner-icon="mdi-database-search"
            />
          </VCol>
          <VCol v-if="isMusicSelection" cols="12" md="6">
            <VSelect
              v-model="musicType"
              :label="t('dialog.reorganize.musicEntity')"
              :items="[
                { title: t('music.entityRecording'), value: 'recording' },
                { title: t('music.entityAlbum'), value: 'album' },
              ]"
              prepend-inner-icon="mdi-music-box-multiple"
            />
          </VCol>
          <VCol cols="12" :md="hasFourInputFields ? 6 : 12">
            <VTextField
              v-model="mediaId"
              :disabled="mediaType === ''"
              :label="mediaIdLabel"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[validateMediaId]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              @click:append-inner="mediaSelectorDialog = true"
            />
          </VCol>
          <VCol v-if="canSelectEpisodeGroup" cols="12" md="6">
            <VSelect
              v-model="episodeGroup"
              :items="episodeGroupOptions"
              item-title="title"
              item-value="value"
              :item-props="episodeGroupItemProps"
              :loading="episodeGroupLoading"
              :disabled="!mediaId"
              clearable
              :label="t('dialog.reorganize.episodeGroup')"
              :placeholder="t('dialog.reorganize.episodeGroupPlaceholder')"
              :hint="t('dialog.reorganize.episodeGroupHint')"
              persistent-hint
              prepend-inner-icon="mdi-view-list"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-auto-fix"
          class="px-5"
          :disabled="!canSubmit"
          @click="submitScrape"
        >
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>

    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-model="mediaId"
        :type="mediaSource"
        :music-types="isMusicSelection ? [musicType] : undefined"
        :initial-keyword="isMusicSelection ? mediaSearchHint : undefined"
        @close="mediaSelectorDialog = false"
        @select="handleMediaSelected"
      />
    </VDialog>
  </VDialog>
</template>
