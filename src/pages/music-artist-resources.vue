<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api, { isApiBusinessFailure } from '@/api'
import type { Context, MediaDataSource, MediaInfo, MusicLibraryStatus } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useConfirm } from '@/composables/useConfirm'
import { isMediaDataSource } from '@/utils/mediaId'
import { requiresMusicConfirmation } from '@/utils/music'

type MatchState =
  'pending' | 'searching' | 'exact' | 'candidate' | 'unmatched' | 'error' | 'downloaded' | 'download_error'

interface DiscographyRow {
  key: string
  media: MediaInfo
  exists: boolean
  selected: boolean
  state: MatchState
  resources: Context[]
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const $toast = useToast()

const artistId = computed(() => route.query.artist_id?.toString().trim() || '')
const artistName = computed(() => route.query.artist?.toString().trim() || '')
const mediaSource = computed<MediaDataSource | undefined>(() => {
  const value = route.query.media_source?.toString()
  return isMediaDataSource(value) ? value : undefined
})
const sites = computed(() => route.query.sites?.toString() || '')

const rows = ref<DiscographyRow[]>([])
const loadingCatalog = ref(false)
const matching = ref(false)
const downloading = ref(false)
const matchCompleted = ref(0)
const sortDescending = ref(false)
const statusFilter = ref<'all' | 'available' | 'library' | 'exact' | 'candidate' | 'unmatched'>('all')

const excludedSecondaryTypes = new Set(['Compilation', 'Live', 'Remix', 'Soundtrack', 'DJ-mix', 'Mixtape/Street'])
const typeOrder: Record<string, number> = { Album: 0, EP: 1, Single: 2 }

const summary = computed(() => ({
  total: rows.value.length,
  library: rows.value.filter(item => item.exists).length,
  exact: rows.value.filter(item => item.state === 'exact' || item.state === 'downloaded').length,
  candidate: rows.value.filter(item => item.state === 'candidate').length,
  unmatched: rows.value.filter(item => item.state === 'unmatched' || item.state === 'error').length,
}))

const selectedRows = computed(() => rows.value.filter(item => item.selected && item.state === 'exact' && !item.exists))
const matchProgress = computed(() =>
  rows.value.length ? Math.round((matchCompleted.value / rows.value.length) * 100) : 0,
)

const visibleRows = computed(() => {
  const filtered = rows.value.filter(item => {
    if (statusFilter.value === 'available') return !item.exists
    if (statusFilter.value === 'library') return item.exists
    if (statusFilter.value === 'exact') return item.state === 'exact' || item.state === 'downloaded'
    if (statusFilter.value === 'candidate') return item.state === 'candidate'
    if (statusFilter.value === 'unmatched') return item.state === 'unmatched' || item.state === 'error'
    return true
  })
  return [...filtered].sort((left, right) => {
    const leftDate = left.media.release_date || `${left.media.year || '9999'}`
    const rightDate = right.media.release_date || `${right.media.year || '9999'}`
    const dateResult = leftDate.localeCompare(rightDate)
    if (dateResult) return sortDescending.value ? -dateResult : dateResult
    return (typeOrder[left.media.album_type || ''] ?? 9) - (typeOrder[right.media.album_type || ''] ?? 9)
  })
})

function stableKey(media: MediaInfo) {
  return `${media.media_source || ''}:${media.media_id || ''}`
}

function isOfficialDiscographyItem(media: MediaInfo) {
  return !media.secondary_types?.some(type => excludedSecondaryTypes.has(type))
}

async function fetchAllByType(albumType: 'album' | 'ep' | 'single') {
  const result: MediaInfo[] = []
  for (let page = 1; page <= 50; page += 1) {
    const batch =
      (await api.get<MediaInfo[]>(`music/artist/${artistId.value}/albums`, {
        params: { media_source: mediaSource.value, album_type: albumType, page, count: 100 },
        feedback: 'silent',
      })) || []
    result.push(...batch)
    if (batch.length < 100) break
  }
  return result
}

async function loadLibraryStatus(items: MediaInfo[]) {
  const statusMap = new Map<string, boolean>()
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100)
    const statuses =
      (await api.post<MusicLibraryStatus[]>('music/library/status', { items: batch }, { feedback: 'silent' })) || []
    statuses.forEach(status => statusMap.set(`${status.media_source}:${status.media_id}`, status.exists))
  }
  return statusMap
}

async function loadCatalog() {
  if (!artistId.value || !mediaSource.value) return
  loadingCatalog.value = true
  rows.value = []
  try {
    const groups = await Promise.all([fetchAllByType('album'), fetchAllByType('ep'), fetchAllByType('single')])
    const unique = new Map<string, MediaInfo>()
    groups
      .flat()
      .filter(isOfficialDiscographyItem)
      .forEach(media => unique.set(stableKey(media), media))
    const mediaItems = [...unique.values()].filter(media => media.media_source && media.media_id)
    const statusMap = await loadLibraryStatus(mediaItems)
    rows.value = mediaItems.map(media => ({
      key: stableKey(media),
      media,
      exists: statusMap.get(stableKey(media)) || false,
      selected: false,
      state: 'pending',
      resources: [],
    }))
    await matchResources()
  } catch (error) {
    console.error(error)
    $toast.error(t('music.discographyLoadFailed'))
  } finally {
    loadingCatalog.value = false
  }
}

async function matchRow(row: DiscographyRow) {
  row.state = 'searching'
  try {
    const resources =
      (await api.get<Context[]>(`search/media/${encodeURIComponent(row.media.media_id || '')}`, {
        params: {
          media_source: row.media.media_source,
          mtype: '音乐',
          music_type: 'album',
          title: row.media.title,
          year: row.media.year,
          area: 'title',
          sites: sites.value,
          include_candidates: true,
        },
        feedback: 'silent',
      })) || []
    row.resources = resources
    const exact = resources.filter(
      context => context.match_status !== 'candidate' && !requiresMusicConfirmation(context),
    )
    row.state = exact.length ? 'exact' : resources.length ? 'candidate' : 'unmatched'
    row.selected = !row.exists && row.state === 'exact'
  } catch (error) {
    if (isApiBusinessFailure(error)) row.state = 'unmatched'
    else {
      console.error(error)
      row.state = 'error'
    }
    row.selected = false
  } finally {
    matchCompleted.value += 1
  }
}

async function matchResources() {
  if (!rows.value.length || matching.value) return
  matching.value = true
  matchCompleted.value = 0
  rows.value.forEach(row => {
    row.state = 'pending'
    row.resources = []
    row.selected = false
  })
  const queue = [...rows.value]
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift()
      if (row) await matchRow(row)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker))
  } finally {
    matching.value = false
  }
}

function statusLabel(row: DiscographyRow) {
  if (row.exists) return t('music.statusInLibrary')
  return t(`music.resourceState.${row.state}`)
}

function statusColor(row: DiscographyRow) {
  if (row.exists) return 'success'
  if (row.state === 'exact' || row.state === 'downloaded') return 'primary'
  if (row.state === 'candidate') return 'warning'
  if (row.state === 'unmatched' || row.state === 'error' || row.state === 'download_error') return 'error'
  return 'secondary'
}

function openResources(row: DiscographyRow) {
  router.push({
    path: '/resource',
    query: {
      media_source: row.media.media_source,
      media_id: row.media.media_id,
      music_type: 'album',
      type: '音乐',
      title: row.media.title,
      year: row.media.year?.toString(),
      area: 'title',
      result_type: 'torrent',
      sites: sites.value,
    },
  })
}

function selectAllDownloadable() {
  rows.value.forEach(row => {
    row.selected = !row.exists && row.state === 'exact'
  })
}

async function batchDownload() {
  const targets = [...selectedRows.value]
  if (!targets.length) return
  const confirmed = await confirm({
    type: 'info',
    title: t('music.batchDownload'),
    content: t('music.batchDownloadConfirm', { count: targets.length }),
    confirmText: t('music.batchDownload'),
  })
  if (!confirmed) return
  downloading.value = true
  let succeeded = 0
  for (const row of targets) {
    const context = row.resources.find(item => item.match_status !== 'candidate' && !requiresMusicConfirmation(item))
    if (!context) continue
    try {
      await api.post(
        'download/',
        { media_in: row.media, torrent_in: context.torrent_info, downloader: null, save_path: null },
        { feedback: 'silent' },
      )
      row.state = 'downloaded'
      row.selected = false
      succeeded += 1
    } catch (error) {
      console.error(error)
      row.state = 'download_error'
      row.selected = false
    }
  }
  downloading.value = false
  $toast.success(t('music.batchDownloadResult', { success: succeeded, total: targets.length }))
}

watch(() => [artistId.value, mediaSource.value, sites.value], loadCatalog, { immediate: true })
</script>

<template>
  <div class="discography-page">
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
      <div>
        <VBtn variant="text" prepend-icon="mdi-arrow-left" class="px-0 mb-1" @click="router.back()">
          {{ t('common.back') }}
        </VBtn>
        <h1 class="text-h4 font-weight-bold">{{ artistName }} · {{ t('music.discographyResources') }}</h1>
        <p class="text-body-2 text-medium-emphasis mt-1">{{ t('music.discographyDescription') }}</p>
      </div>
      <div class="d-flex flex-wrap ga-2">
        <VBtn variant="tonal" prepend-icon="mdi-checkbox-multiple-marked-outline" @click="selectAllDownloadable">
          {{ t('music.selectDownloadable') }}
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="mdi-download-multiple"
          :disabled="!selectedRows.length"
          :loading="downloading"
          @click="batchDownload"
        >
          {{ t('music.batchDownload') }} ({{ selectedRows.length }})
        </VBtn>
      </div>
    </div>

    <VRow class="mb-3">
      <VCol
        v-for="item in [
          { label: t('music.officialWorks'), value: summary.total, color: 'secondary' },
          { label: t('music.statusInLibrary'), value: summary.library, color: 'success' },
          { label: t('music.resourceState.exact'), value: summary.exact, color: 'primary' },
          { label: t('music.resourceState.unmatched'), value: summary.unmatched, color: 'error' },
        ]"
        :key="item.label"
        cols="6"
        md="3"
      >
        <VCard variant="tonal" :color="item.color" class="summary-card">
          <VCardText
            ><div class="text-caption">{{ item.label }}</div>
            <div class="text-h5 font-weight-bold">{{ item.value }}</div></VCardText
          >
        </VCard>
      </VCol>
    </VRow>

    <VProgressLinear v-if="matching" :model-value="matchProgress" height="6" rounded color="primary" class="mb-3" />

    <VCard>
      <VCardText class="d-flex flex-wrap align-center ga-3">
        <VSelect
          v-model="statusFilter"
          :items="[
            { title: t('common.all'), value: 'all' },
            { title: t('music.notInLibrary'), value: 'available' },
            { title: t('music.statusInLibrary'), value: 'library' },
            { title: t('music.resourceState.exact'), value: 'exact' },
            { title: t('music.resourceState.candidate'), value: 'candidate' },
            { title: t('music.resourceState.unmatched'), value: 'unmatched' },
          ]"
          density="compact"
          hide-details
          max-width="240"
        />
        <VBtn
          variant="text"
          :prepend-icon="sortDescending ? 'mdi-sort-calendar-descending' : 'mdi-sort-calendar-ascending'"
          @click="sortDescending = !sortDescending"
        >
          {{ sortDescending ? t('music.newestFirst') : t('music.oldestFirst') }}
        </VBtn>
        <VSpacer />
        <VBtn variant="text" prepend-icon="mdi-refresh" :loading="matching" @click="matchResources">
          {{ t('music.rematchResources') }}
        </VBtn>
      </VCardText>

      <VDivider />
      <LoadingBanner v-if="loadingCatalog && !rows.length" class="my-12" />
      <NoDataFound v-else-if="!visibleRows.length" :error-title="t('music.noOfficialWorks')" />
      <VList v-else lines="three" class="discography-list">
        <template v-for="(row, index) in visibleRows" :key="row.key">
          <VListItem class="discography-row">
            <template #prepend>
              <VCheckbox
                v-model="row.selected"
                :disabled="row.exists || row.state !== 'exact'"
                hide-details
                :aria-label="t('music.selectAlbum', { title: row.media.title })"
              />
              <VAvatar rounded="lg" size="64" color="surface-variant" class="ms-2">
                <VImg
                  v-if="row.media.cover_url || row.media.poster_path"
                  :src="row.media.cover_url || row.media.poster_path"
                  cover
                />
                <VIcon v-else icon="mdi-album" size="32" />
              </VAvatar>
            </template>

            <VListItemTitle class="font-weight-medium">
              {{ row.media.title }}
              <span v-if="row.media.year" class="text-medium-emphasis">({{ row.media.year }})</span>
            </VListItemTitle>
            <VListItemSubtitle class="mt-1">
              <VChip size="x-small" variant="tonal" class="me-2">{{ row.media.album_type || t('music.album') }}</VChip>
              <span>{{ row.media.release_date || t('music.unknownReleaseDate') }}</span>
            </VListItemSubtitle>
            <VListItemSubtitle class="mt-1">
              <VChip size="small" :color="statusColor(row)" variant="tonal">{{ statusLabel(row) }}</VChip>
              <span v-if="row.resources.length" class="ms-2">{{
                t('music.resourceCount', { count: row.resources.length })
              }}</span>
            </VListItemSubtitle>

            <template #append>
              <VBtn variant="text" append-icon="mdi-chevron-right" @click="openResources(row)">
                {{ t('music.viewResources') }}
              </VBtn>
            </template>
          </VListItem>
          <VDivider v-if="index < visibleRows.length - 1" />
        </template>
      </VList>
    </VCard>
  </div>
</template>

<style scoped>
.discography-page {
  max-width: 1480px;
  margin-inline: auto;
  padding: 1.5rem;
}

.summary-card {
  min-height: 88px;
}
.discography-row {
  min-height: 98px;
  padding-block: 0.75rem;
}

@media (width <= 700px) {
  .discography-page {
    padding: 0.75rem;
  }
  .discography-row :deep(.v-list-item__append) {
    align-self: end;
  }
  .discography-row :deep(.v-btn__content) {
    display: none;
  }
}
</style>
