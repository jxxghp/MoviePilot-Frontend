<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { MediaDataSource, MusicAlbumInfo, MusicTransferCandidate } from '@/api/types'
import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { useMediaSources } from '@/composables/useMediaSources'
import { isMusicMediaSource } from '@/utils/mediaId'
import type { MusicAlbumSelection, MusicPreviewGroup } from './state'

const props = defineProps<{ group: MusicPreviewGroup; busy: boolean }>()
const emit = defineEmits<{ close: []; apply: [selection: MusicAlbumSelection] }>()
const { t } = useI18n()
const prefix = 'dialog.reorganize.musicPreview.'
const original = props.group.items.find(item => item.music?.file_role === 'audio')?.music
const source = ref<MediaDataSource>(
  original?.media_source && isMusicMediaSource(original.media_source) ? original.media_source : 'musicbrainz',
)
const albumId = ref(
  original?.musicbrainz_release_group_id ?? (original?.music_type === 'album' ? original.media_id : '') ?? '',
)
const album = ref<MusicAlbumInfo>()
const releaseId = ref('')
const releaseDraft = ref('')
const loading = ref(false)
const error = ref('')
let requestId = 0
const sources = useMediaSources().mediaSourceItems('music')
const sourceItems = computed(() => sources.value.filter(item => isMusicMediaSource(item.value)))
const keyword = computed(() =>
  [original?.album_artist || original?.artists?.[0], original?.album || original?.title].filter(Boolean).join(' '),
)
const candidates = computed(() =>
  props.group.items
    .flatMap(item => item.music?.candidates ?? [])
    .filter((item, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index)
    .slice(0, 5),
)
const editions = computed(() => {
  const items = (album.value?.releases ?? [])
    .filter(item => item.media_id)
    .map(item => ({
      value: item.media_id!,
      title: [
        item.title,
        item.date,
        item.country,
        item.formats?.join('/'),
        item.track_count ? t(prefix + 'trackCount', { count: item.track_count }) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    }))
  if (releaseId.value && !items.some(item => item.value === releaseId.value)) {
    items.unshift({
      value: releaseId.value,
      title: [album.value?.title, album.value?.release_date, releaseId.value].filter(Boolean).join(' · '),
    })
  }
  return items
})
const ready = computed(() =>
  Boolean(
    album.value?.tracks?.length &&
    album.value.media_id === albumId.value &&
    album.value.media_source === source.value &&
    (source.value !== 'musicbrainz' ||
      (releaseId.value && releaseDraft.value.trim().toLowerCase() === releaseId.value)),
  ),
)

/** 切换来源和专辑后废弃在途详情，旧响应不能重新启用确认按钮。 */
function resetAlbum() {
  requestId += 1
  album.value = undefined
  albumId.value = ''
  releaseId.value = ''
  releaseDraft.value = ''
  error.value = ''
  loading.value = false
}
watch(source, resetAlbum, { flush: 'sync' })

/** 读取选定发行的真实曲目；失败即清除可确认状态，不能沿用上一版详情。 */
async function loadAlbum(selectedRelease?: string) {
  const current = ++requestId
  loading.value = true
  error.value = ''
  const knownReleases = album.value?.releases
  album.value = undefined
  try {
    const result = await api.get<MusicAlbumInfo>(`music/album/${encodeURIComponent(albumId.value)}`, {
      params: {
        media_source: source.value,
        ...(selectedRelease ? { musicbrainz_release_id: selectedRelease } : {}),
      },
      feedback: 'silent',
    })
    if (current !== requestId) return
    if (
      result.media_source !== source.value ||
      result.media_id !== albumId.value ||
      !result.tracks?.length ||
      (selectedRelease && result.musicbrainz_release_id !== selectedRelease.toLowerCase())
    )
      throw new Error(t(prefix + 'editionUnavailable'))
    album.value = { ...result, releases: result.releases?.length ? result.releases : knownReleases }
    releaseId.value = result.musicbrainz_release_id ?? ''
    releaseDraft.value = releaseId.value
  } catch (cause) {
    if (current === requestId) error.value = getApiBusinessErrorMessage(cause) || t(prefix + 'editionUnavailable')
  } finally {
    if (current === requestId) loading.value = false
  }
}

/** 搜索结果使用来源原生专辑ID；候选只预填或读取详情，不直接执行整理。 */
function selectAlbum(item: { id: string }) {
  albumId.value = item.id
  void loadAlbum()
}

/** 只有候选明确给出发行组或专辑身份时才进入详情，录音ID不能冒充专辑。 */
function selectCandidate(candidate: MusicTransferCandidate) {
  const id = candidate.album_id || (candidate.music_type === 'album' ? candidate.media_id : '')
  if (!id) return
  source.value = candidate.media_source ?? 'musicbrainz'
  albumId.value = id
  void loadAlbum(source.value === 'musicbrainz' ? (candidate.release_id ?? undefined) : undefined)
}

/** 手动输入用于发行列表被来源截断的情况，必须先读取并核验曲目。 */
function readRelease() {
  const id = releaseDraft.value.trim().toLowerCase()
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) {
    error.value = t(prefix + 'releaseIdInvalid')
    return
  }
  void loadAlbum(id)
}

/** 确认的是已读取的专辑和具体发行，父组件随后对原文件范围重预览。 */
function apply() {
  if (!ready.value || loading.value || props.busy) return
  emit('apply', {
    media_source: source.value,
    media_id: albumId.value,
    ...(source.value === 'musicbrainz' ? { musicbrainz_release_id: releaseId.value } : {}),
  })
}
onMounted(() => {
  if (albumId.value) void loadAlbum(original?.musicbrainz_release_id ?? undefined)
})
onUnmounted(() => {
  requestId += 1
})
</script>

<template>
  <VDialog
    :model-value="true"
    max-width="760"
    scrollable
    :persistent="busy"
    @update:model-value="!busy && emit('close')"
  >
    <VCard :title="t(prefix + 'correctTitle')">
      <VCardText class="music-correction-body">
        <p class="text-body-2 mb-4">{{ t(prefix + 'scopeHint', { count: group.items.length }) }}</p>
        <VSelect
          v-model="source"
          :items="sourceItems"
          :label="t(prefix + 'source')"
          :disabled="busy || loading"
          hide-details
          class="mb-4"
        />
        <div v-if="!albumId">
          <div v-if="candidates.length" class="mb-4">
            <p class="text-caption mb-2">{{ t(prefix + 'candidates') }}</p>
            <VBtn
              v-for="(candidate, index) in candidates"
              :key="index"
              class="ma-1 music-candidate"
              variant="tonal"
              size="small"
              :disabled="!candidate.album_id && !(candidate.music_type === 'album' && candidate.media_id)"
              @click="selectCandidate(candidate)"
            >
              {{ [candidate.title, candidate.artist, candidate.year].filter(Boolean).join(' · ') }}
            </VBtn>
          </div>
          <MediaIdSelector :type="source" :music-types="['album']" :initial-keyword="keyword" @select="selectAlbum" />
        </div>
        <template v-else>
          <VBtn variant="text" prepend-icon="mdi-magnify" :disabled="busy" @click="resetAlbum">{{
            t(prefix + 'searchAgain')
          }}</VBtn>
          <VProgressLinear v-if="loading" indeterminate class="my-3" :aria-label="t('common.loading')" />
          <VAlert v-if="error" type="error" variant="tonal" class="my-3">{{ error }}</VAlert>
          <template v-if="album">
            <h3 class="text-h6 mt-3">{{ album.title }}</h3>
            <p class="text-body-2 mb-4">{{ album.artist || album.artists?.join(' / ') }} · {{ album.release_date }}</p>
            <VSelect
              v-if="source === 'musicbrainz'"
              :model-value="releaseId"
              :items="editions"
              :label="t(prefix + 'edition')"
              :disabled="busy || loading"
              @update:model-value="loadAlbum($event)"
            />
            <p class="text-caption mb-2">{{ t(prefix + 'tracksHint', { count: album.tracks?.length ?? 0 }) }}</p>
            <ol class="music-correction-tracks">
              <li v-for="(track, index) in album.tracks" :key="`${track.media_id}-${index}`">
                <span>{{ track.disc_number || 1 }}.{{ track.track_number || index + 1 }}</span>
                <span>{{ track.title }}</span
                ><span class="text-medium-emphasis">{{ track.artist || track.artists?.join(' / ') }}</span>
              </li>
            </ol>
          </template>
          <details v-if="source === 'musicbrainz'" class="mt-4">
            <summary>{{ t(prefix + 'otherEdition') }}</summary>
            <p class="text-caption my-2">{{ t(prefix + 'releaseIdHint') }}</p>
            <VTextField v-model="releaseDraft" :label="t(prefix + 'releaseId')" :disabled="busy || loading" />
            <VBtn variant="tonal" :disabled="busy || loading" @click="readRelease">{{
              t(prefix + 'readEdition')
            }}</VBtn>
          </details>
        </template>
      </VCardText>
      <VCardActions class="flex-wrap">
        <VBtn :disabled="busy" @click="emit('close')">{{ t('common.cancel') }}</VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" :disabled="!ready || loading || busy" :loading="busy" @click="apply">{{
          t(prefix + 'applyPreview')
        }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.music-correction-body {
  overflow-wrap: anywhere;
}
.music-correction-tracks {
  padding: 0;
  list-style: none;
  max-height: 280px;
  overflow-y: auto;
}
.music-correction-tracks li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.music-candidate {
  max-width: 100%;
  height: auto;
  min-height: 30px;
  white-space: normal;
}
</style>
