<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api, { isApiBusinessFailure } from '@/api'
import type { Context, MediaDataSource, MediaInfo, MusicLibraryStatus } from '@/api/types'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useConfirm } from '@/composables/useConfirm'
import { isMediaDataSource } from '@/utils/mediaId'
import { requiresMusicConfirmation } from '@/utils/music'

type MatchState =
  | 'pending'
  | 'searching'
  | 'collection_confirmed'
  | 'exact'
  | 'candidate'
  | 'unmatched'
  | 'error'
  | 'downloaded'
  | 'download_error'

type CoverageState = 'confirmed' | 'probable' | 'missing'

interface WorkCoverage {
  media_id: string
  state: CoverageState
  evidence: string
}

interface CollectionCoverage {
  folder_name: string
  file_count: number
  confirmed_count: number
  probable_count: number
  missing_count: number
  works: WorkCoverage[]
}

interface DiscographyRow {
  key: string
  media: MediaInfo
  exists: boolean
  selected: boolean
  state: MatchState
  resources: Context[]
}

interface ArtistCollectionResource {
  key: string
  context: Context
  coverage: CollectionCoverage
  state: 'probing' | 'available' | 'probe_error' | 'downloaded' | 'download_error'
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
const collectionResources = ref<ArtistCollectionResource[]>([])
const selectedCollectionKey = ref<string | null>(null)
const artistAliases = ref<string[]>([])
const loadingCatalog = ref(false)
const loadingCollections = ref(false)
const matching = ref(false)
const downloading = ref(false)
const normalizeSource = ref<boolean | null>(null)
const matchCompleted = ref(0)
const sortDescending = ref(false)
const statusFilter = ref<'all' | 'available' | 'library' | 'exact' | 'candidate' | 'unmatched'>('all')

const excludedSecondaryTypes = new Set(['Compilation', 'Live', 'Remix', 'Soundtrack', 'DJ-mix', 'Mixtape/Street'])
const typeOrder: Record<string, number> = { Album: 0, EP: 1, Single: 2 }
const collectionSignal =
  /(?:合集|全集|全套|全专辑|全作品|录音室专辑|discograph(?:y|ies)|complete\s+(?:album|studio)|collection|anthology|box\s*set)/i

const summary = computed(() => ({
  total: rows.value.length,
  library: rows.value.filter(item => item.exists).length,
  exact: rows.value.filter(item => item.state === 'exact' || item.state === 'downloaded').length,
  candidate: rows.value.filter(item => item.state === 'candidate').length,
  unmatched: rows.value.filter(item => item.state === 'unmatched' || item.state === 'error').length,
}))

const selectedRows = computed(() => rows.value.filter(item => item.selected && item.state === 'exact' && !item.exists))
const selectedCollection = computed(() =>
  collectionResources.value.find(item => item.key === selectedCollectionKey.value),
)
const selectedResourceCount = computed(() => selectedRows.value.length + (selectedCollection.value ? 1 : 0))
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

function normalizedText(value?: string | null) {
  return (value || '').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function collectionResourceKey(context: Context) {
  const torrent = context.torrent_info
  return `${torrent?.site || ''}:${torrent?.enclosure || torrent?.page_url || torrent?.title || ''}`
}

function isArtistCollectionResource(context: Context) {
  const text = `${context.torrent_info?.title || ''} ${context.torrent_info?.description || ''}`
  const normalized = normalizedText(text)
  return collectionSignal.test(text) && artistAliases.value.some(name => normalized.includes(normalizedText(name)))
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
    const [artist, groups] = await Promise.all([
      api.get<MediaInfo>(`music/artist/${artistId.value}`, {
        params: { media_source: mediaSource.value },
        feedback: 'silent',
      }),
      Promise.all([fetchAllByType('album'), fetchAllByType('ep'), fetchAllByType('single')]),
    ])
    artistAliases.value = [
      ...new Set([artistName.value, ...((artist as MediaInfo & { aliases?: string[] })?.aliases || [])]),
    ]
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
    await loadCollectionResources()
    applySelectedCollectionCoverage()
    await matchResources()
  } catch (error) {
    console.error(error)
    $toast.error(t('music.discographyLoadFailed'))
  } finally {
    loadingCatalog.value = false
  }
}

async function loadCollectionResources() {
  if (!artistName.value) return
  loadingCollections.value = true
  collectionResources.value = []
  try {
    const batches = await Promise.all(
      artistAliases.value.slice(0, 3).map(name =>
        api.get<Context[]>('search/title', {
          params: { keyword: name, mtype: '音乐', page: 0, sites: sites.value },
          feedback: 'silent',
        }),
      ),
    )
    const contexts = batches.flatMap(items => items || [])
    const unique = new Map<string, Context>()
    contexts.filter(isArtistCollectionResource).forEach(context => unique.set(collectionResourceKey(context), context))
    const candidates: ArtistCollectionResource[] = [...unique.values()].slice(0, 8).map(context => ({
      key: collectionResourceKey(context),
      context,
      coverage: {
        folder_name: '',
        file_count: 0,
        confirmed_count: 0,
        probable_count: 0,
        missing_count: rows.value.length,
        works: [],
      },
      state: 'probing' as const,
    }))
    collectionResources.value = candidates
    const queue = [...candidates]
    const worker = async () => {
      while (queue.length) {
        const candidate = queue.shift()
        if (!candidate?.context.torrent_info) continue
        try {
          candidate.coverage = await api.post<CollectionCoverage>(
            'music/artist-collection/probe',
            { torrent: candidate.context.torrent_info, works: rows.value.map(row => row.media) },
            { feedback: 'silent' },
          )
          candidate.state = 'available'
        } catch (error) {
          if (!isApiBusinessFailure(error)) console.error(error)
          candidate.state = 'probe_error'
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(2, queue.length) }, worker))
    collectionResources.value = [...candidates].sort((left, right) => {
      const coverage = right.coverage.confirmed_count - left.coverage.confirmed_count
      if (coverage) return coverage
      const probable = right.coverage.probable_count - left.coverage.probable_count
      if (probable) return probable
      return (right.context.torrent_info?.seeders || 0) - (left.context.torrent_info?.seeders || 0)
    })
    selectedCollectionKey.value = collectionResources.value.find(item => item.state === 'available')?.key || null
  } catch (error) {
    if (!isApiBusinessFailure(error)) console.error(error)
  } finally {
    loadingCollections.value = false
  }
}

function applySelectedCollectionCoverage() {
  const coverage = new Map(selectedCollection.value?.coverage.works.map(item => [item.media_id, item.state]) || [])
  rows.value.forEach(row => {
    if (row.exists) return
    if (coverage.get(row.media.media_id || '') === 'confirmed') {
      row.state = 'collection_confirmed'
      row.selected = false
      row.resources = []
    } else if (row.state === 'collection_confirmed') {
      row.state = 'pending'
    }
  })
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
    if (!row.exists && row.state !== 'collection_confirmed') row.state = 'pending'
    row.resources = []
    row.selected = false
  })
  const queue = rows.value.filter(row => !row.exists && row.state !== 'collection_confirmed')
  matchCompleted.value = rows.value.length - queue.length
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
  if (row.state === 'collection_confirmed') return t('music.coveredByCollection')
  return t(`music.resourceState.${row.state}`)
}

function statusColor(row: DiscographyRow) {
  if (row.exists) return 'success'
  if (row.state === 'collection_confirmed') return 'info'
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

async function submitAcquisition() {
  const targets = [...selectedRows.value]
  const collection = selectedCollection.value
  if (!targets.length && !collection) return
  const confirmed = await confirm({
    type: 'info',
    title: t('music.batchDownload'),
    content: t('music.artistAcquisitionConfirm', {
      collection: collection ? 1 : 0,
      count: targets.length,
    }),
    confirmText: t('music.batchDownload'),
  })
  if (!confirmed) return
  downloading.value = true
  try {
    const supplements = targets.flatMap(row => {
      const context = row.resources.find(item => item.match_status !== 'candidate' && !requiresMusicConfirmation(item))
      return context?.torrent_info ? [{ media: row.media, torrent: context.torrent_info }] : []
    })
    const task = await api.post<{ job_id: string; failed_count: number }>(
      'music/artist-acquisition',
      {
        artist_source: mediaSource.value,
        artist_id: artistId.value,
        artist_name: artistName.value,
        works: rows.value.map(row => row.media),
        collection: collection?.context.torrent_info
          ? { torrent: collection.context.torrent_info, coverage: collection.coverage.works }
          : null,
        supplements,
        ...(normalizeSource.value === null ? {} : { normalize_source: normalizeSource.value }),
        downloader: null,
        save_path: null,
      },
      { feedback: 'silent' },
    )
    if (collection) collection.state = 'downloaded'
    targets.forEach(row => {
      row.state = 'downloaded'
      row.selected = false
    })
    $toast.success(t('music.artistAcquisitionAdded', { id: task.job_id }))
  } catch (error) {
    console.error(error)
    $toast.error(t('music.artistAcquisitionFailed'))
  } finally {
    downloading.value = false
  }
}

watch(selectedCollectionKey, () => {
  applySelectedCollectionCoverage()
  void matchResources()
})

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
        <VSelect
          v-model="normalizeSource"
          label="资源规范化命名（qB）"
          :items="[
            { title: '跟随资源目录设置', value: null },
            { title: '本次开启', value: true },
            { title: '本次关闭', value: false },
          ]"
          min-width="230"
          hide-details
        />
        <VBtn variant="tonal" prepend-icon="mdi-checkbox-multiple-marked-outline" @click="selectAllDownloadable">
          {{ t('music.selectDownloadable') }}
        </VBtn>
        <VBtn
          color="primary"
          prepend-icon="mdi-download-multiple"
          :disabled="!selectedResourceCount"
          :loading="downloading"
          @click="submitAcquisition"
        >
          {{ t('music.createArtistAcquisition') }} ({{ selectedResourceCount }})
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

    <VCard v-if="loadingCollections || collectionResources.length" class="mb-4">
      <VCardTitle class="d-flex flex-wrap align-center ga-2">
        <VIcon icon="mdi-folder-music-outline" />
        {{ t('music.artistCollectionResources') }}
        <VProgressCircular v-if="loadingCollections" indeterminate size="20" width="2" />
      </VCardTitle>
      <VCardSubtitle>{{ t('music.artistCollectionDescription') }}</VCardSubtitle>
      <VCardText v-if="collectionResources.length" class="d-flex flex-column ga-3">
        <VCard v-for="resource in collectionResources" :key="resource.key" variant="tonal">
          <VCardText class="d-flex flex-wrap align-center ga-3">
            <VRadio
              :model-value="selectedCollectionKey"
              :value="resource.key"
              :disabled="resource.state !== 'available' || matching"
              :aria-label="t('music.selectArtistCollection', { title: resource.context.torrent_info?.title })"
              @update:model-value="selectedCollectionKey = $event as string"
            />
            <div class="flex-grow-1 collection-resource-copy">
              <div class="font-weight-medium text-body-1">{{ resource.context.torrent_info?.title }}</div>
              <div class="text-body-2 text-medium-emphasis mt-1">
                {{ resource.context.torrent_info?.site_name || t('music.unknownSite') }}
                <span v-if="resource.context.torrent_info?.seeders">
                  · {{ t('music.seeders', { count: resource.context.torrent_info.seeders }) }}
                </span>
              </div>
              <div class="d-flex flex-wrap ga-2 mt-2">
                <VChip size="small" color="primary" variant="tonal">
                  {{
                    resource.state === 'probing'
                      ? t('music.probingCollection')
                      : resource.coverage.confirmed_count
                        ? t('music.confirmedCoverage', {
                            count: resource.coverage.confirmed_count,
                            total: rows.length,
                          })
                        : t('music.coverageUnknown')
                  }}
                </VChip>
                <VChip v-if="resource.coverage.probable_count" size="small" color="warning" variant="tonal">
                  {{ t('music.probableCoverage', { count: resource.coverage.probable_count }) }}
                </VChip>
                <VChip size="small" variant="tonal">Artist Collection</VChip>
              </div>
            </div>
            <VBtn
              :color="selectedCollectionKey === resource.key ? 'primary' : undefined"
              :variant="selectedCollectionKey === resource.key ? 'tonal' : 'text'"
              :disabled="resource.state !== 'available' || matching"
              @click="selectedCollectionKey = selectedCollectionKey === resource.key ? null : resource.key"
            >
              {{
                selectedCollectionKey === resource.key
                  ? t('music.collectionSelected')
                  : t('music.useAsCollectionBaseline')
              }}
            </VBtn>
          </VCardText>
        </VCard>
      </VCardText>
    </VCard>

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

.collection-resource-copy {
  min-width: 16rem;
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
