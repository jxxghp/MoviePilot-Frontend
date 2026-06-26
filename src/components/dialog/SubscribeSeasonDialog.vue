<script lang="ts" setup>
import api from '@/api'
import { MediaInfo, MediaSeason, NotExistMediaInfo } from '@/api/types'
import { PropType } from 'vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'
import type { SeasonSubscribeModes, SubscribeMode } from '@/composables/useMediaSubscribe'
import { useDisplay } from 'vuetify'

type SubscribeModeOption = {
  icon: string
  title: string
  value: SubscribeMode
}

type EpisodeGroupOption = {
  title: string
  subtitle: string
  value: string
  icon: string
}

// 国际化
const { t } = useI18n()
const { mdAndUp } = useDisplay()

// 定义事件
const emit = defineEmits(['subscribe', 'close'])

// 定义输入
const props = defineProps({
  media: Object as PropType<MediaInfo>,
  selectedSeason: Number,
  subscribedSeasons: Array as PropType<number[]>,
  subscribedSeasonModes: Object as PropType<SeasonSubscribeModes>,
  defaultSubscribeMode: String as PropType<SubscribeMode>,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 季详情
const seasonInfos = ref<MediaSeason[]>([])

// 选中的订阅季号
const seasonsSelected = ref<number[]>([])

// 各季订阅方式
const seasonModes = ref<Record<number, SubscribeMode>>({})

// 用户已手动选择过模式的季号，入库状态异步刷新时不再覆盖。
const manuallySelectedModeSeasons = ref(new Set<number>())

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 是否刷新过
const isRefreshed = ref(false)

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 当前选择剧集组
const episodeGroup = ref('')

const subscribeModeOptions = computed<SubscribeModeOption[]>(() => [
  {
    title: t('dialog.subscribeMode.normal'),
    value: 'normal',
    icon: 'mdi-plus-circle-outline',
  },
  {
    title: t('dialog.subscribeMode.bestVersionEpisode'),
    value: 'best_version',
    icon: 'mdi-refresh',
  },
  {
    title: t('dialog.subscribeMode.bestVersionFull'),
    value: 'best_version_full',
    icon: 'mdi-shimmer',
  },
])

function getSubscribeModeColor(mode: SubscribeMode) {
  if (mode === 'normal') return 'primary'
  if (mode === 'best_version') return 'warning'
  return 'success'
}

function isSubscribeMode(value: unknown): value is SubscribeMode {
  return value === 'normal' || value === 'best_version' || value === 'best_version_full'
}

const subscribedSeasonSet = computed(() => new Set(props.subscribedSeasons ?? []))

const selectedSeasonSet = computed(() => new Set(seasonsSelected.value))

const visibleSeasonNumbers = computed(() =>
  seasonInfos.value
    .map(item => item.season_number)
    .filter((season): season is number => season !== null && season !== undefined),
)

const hasSelectionChanges = computed(() => {
  const visibleSeasons = new Set(visibleSeasonNumbers.value)

  for (const season of visibleSeasons) {
    if (subscribedSeasonSet.value.has(season) !== selectedSeasonSet.value.has(season)) return true
    if (
      subscribedSeasonSet.value.has(season) &&
      selectedSeasonSet.value.has(season) &&
      (props.subscribedSeasonModes?.[season] ?? 'normal') !== (seasonModes.value[season] ?? 'normal')
    ) {
      return true
    }
  }

  return false
})

const submitButtonText = computed(() => {
  if (!hasSelectionChanges.value && seasonsSelected.value.length === 0) return t('dialog.subscribeSeason.selectSeasons')

  return t('dialog.subscribeSeason.submit')
})

// 剧集组选项
const episodeGroupOptions = computed<EpisodeGroupOption[]>(() => {
  const options = (
    episodeGroups.value as { id: string; name: string; group_count: number; episode_count: number }[]
  ).map(item => {
    return {
      title: item.name,
      subtitle: `${t('dialog.subscribeSeason.seasonCount', { count: item.group_count })} • ${t(
        'dialog.subscribeSeason.episodeCount',
        { count: item.episode_count },
      )}`,
      value: item.id,
      icon: 'mdi-folder-play-outline',
    }
  })
  // 添加不使用选项
  options.unshift({
    title: t('dialog.subscribeSeason.defaultGroup'),
    subtitle: t('dialog.subscribeSeason.seasonCount', { count: seasonInfos.value.length }),
    value: '',
    icon: 'mdi-layers-outline',
  })
  return options
})

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdb_id) return `tmdb:${props.media?.tmdb_id}`
  else if (props.media?.douban_id) return `douban:${props.media?.douban_id}`
  else if (props.media?.bangumi_id) return `bangumi:${props.media?.bangumi_id}`
  else return `${props.media?.mediaid_prefix}:${props.media?.media_id}`
}

// 查询所有剧集组
async function getEpisodeGroups() {
  if (!props.media?.tmdb_id) {
    console.warn('tmdbid is not set or is empty')
    return
  }
  try {
    episodeGroups.value = await api.get(`media/groups/${props.media?.tmdb_id}`)
  } catch (error) {
    console.error(error)
  }
}

// 查询TMDB的所有季信息
async function getMediaSeasons() {
  try {
    seasonInfos.value = await api.get('media/seasons', {
      params: {
        mediaid: getMediaId(),
        title: props.media?.title,
        year: props.media?.year,
        season: props.media?.season,
      },
    })
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 查询剧集组的剧集
async function getGroupSeasons() {
  if (!episodeGroup.value) return
  isRefreshed.value = false
  try {
    seasonInfos.value = await api.get(`media/group/seasons/${episodeGroup.value}`)
  } catch (error) {
    console.error(error)
  }
  isRefreshed.value = true
}

// 检查所有季的缺失状态（数据库）
async function checkSeasonsNotExists() {
  // 开始处理
  try {
    const tmpMedia = {
      ...(props.media ?? {}),
      episode_group: episodeGroup.value || '',
    }
    const result: NotExistMediaInfo[] = await api.post('mediaserver/notexists', tmpMedia)
    if (result) {
      result.forEach(item => {
        // 0-已入库 1-部分缺失 2-全部缺失
        let state = 0
        if (item.episodes.length === 0) state = 2
        else if (item.episodes.length < item.total_episode) state = 1
        seasonsNotExisted.value[item.season] = state
      })
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算存在状态的颜色
function getExistColor(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return 'success'

  if (state === 1) return 'warning'
  else if (state === 2) return 'error'
  else return 'success'
}

// 计算存在状态的文本
function getExistText(season: number) {
  const state = seasonsNotExisted.value[season]
  if (!state) return t('dialog.subscribeSeason.status.exists')

  if (state === 1) return t('dialog.subscribeSeason.status.partial')
  else if (state === 2) return t('dialog.subscribeSeason.status.missing')
  else return t('dialog.subscribeSeason.status.exists')
}

// 拼装季图片地址
function getSeasonPoster(posterPath: string) {
  if (!posterPath) return props.media?.poster_path
  return `https://${globalSettings.TMDB_IMAGE_DOMAIN}/t/p/w500${posterPath}`
}

// 将yyyy-mm-dd转换为yyyy年mm月dd日
function formatAirDate(airDate: string) {
  if (!airDate) return ''
  const date = new Date(airDate.replaceAll(/-/g, '/'))
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

// 从yyyy-mm-dd中提取年份
function getYear(airDate: string) {
  if (!airDate) return ''
  const date = new Date(airDate.replaceAll(/-/g, '/'))
  return date.getFullYear()
}

function setEpisodeGroup(value: string) {
  if (episodeGroup.value === value) return

  seasonsNotExisted.value = {}
  seasonInfos.value = []
  episodeGroup.value = value
}

function subscribeSeasons() {
  const selectedSeasons = seasonInfos.value.filter(item => {
    const seasonNumber = item.season_number ?? null
    return seasonNumber !== null && selectedSeasonSet.value.has(seasonNumber)
  })

  emit(
    'subscribe',
    selectedSeasons,
    seasonsNotExisted.value,
    episodeGroup.value,
    { ...seasonModes.value },
    visibleSeasonNumbers.value,
  )
}

function setSeasonMode(season: number, mode: SubscribeMode) {
  seasonModes.value = {
    ...seasonModes.value,
    [season]: mode,
  }
}

function updateSeasonMode(season: number, mode: unknown) {
  if (!isSubscribeMode(mode)) return
  manuallySelectedModeSeasons.value.add(season)
  setSeasonMode(season, mode)
}

function getDefaultSeasonMode(season: number) {
  if (!seasonsNotExisted.value[season]) return 'best_version_full'

  return props.defaultSubscribeMode ?? 'normal'
}

function ensureSeasonMode(season: number) {
  if (!seasonModes.value[season]) setSeasonMode(season, props.subscribedSeasonModes?.[season] ?? getDefaultSeasonMode(season))
}

function syncDefaultSeasonModes() {
  seasonsSelected.value.forEach(season => {
    if (subscribedSeasonSet.value.has(season) || manuallySelectedModeSeasons.value.has(season)) return
    setSeasonMode(season, getDefaultSeasonMode(season))
  })
}

function isSeasonSubscribed(season: number) {
  return subscribedSeasonSet.value.has(season)
}

function isSeasonSelected(season: number) {
  return selectedSeasonSet.value.has(season)
}

function setSeasonSelected(season: number, selected: boolean | null) {
  const nextSeasons = new Set(seasonsSelected.value)
  if (selected) {
    nextSeasons.add(season)
    ensureSeasonMode(season)
  } else {
    nextSeasons.delete(season)
  }
  seasonsSelected.value = [...nextSeasons].sort((a, b) => a - b)
}

function toggleSeasonSelected(season: number) {
  setSeasonSelected(season, !isSeasonSelected(season))
}

function syncSelectedSeason() {
  if (!seasonInfos.value.length) return

  const seasonNumbers = new Set<number>()
  props.subscribedSeasons?.forEach(season => seasonNumbers.add(season))
  if (props.selectedSeason !== undefined) seasonNumbers.add(props.selectedSeason)

  const validSeasonNumbers = new Set(
    seasonInfos.value
      .map(item => item.season_number)
      .filter((season): season is number => season !== null && season !== undefined),
  )

  seasonsSelected.value = [...seasonNumbers].filter(season => validSeasonNumbers.has(season)).sort((a, b) => a - b)
  seasonsSelected.value.forEach(ensureSeasonMode)
  Object.entries(props.subscribedSeasonModes ?? {}).forEach(([season, mode]) => {
    const seasonNumber = Number(season)
    if (!validSeasonNumbers.has(seasonNumber)) return
    setSeasonMode(seasonNumber, mode)
  })
}

watchEffect(() => {
  if (episodeGroup.value) getGroupSeasons()
  else getMediaSeasons()
  checkSeasonsNotExists()
})

watch(seasonInfos, syncSelectedSeason)

watch(seasonsNotExisted, syncDefaultSeasonModes, { deep: true })

watch(() => props.selectedSeason, syncSelectedSeason)

watch(() => props.subscribedSeasons, syncSelectedSeason)

watch(() => props.subscribedSeasonModes, syncSelectedSeason)

onMounted(async () => {
  getMediaSeasons()
  getEpisodeGroups()
  checkSeasonsNotExists()
})
</script>

<template>
  <VDialog max-width="45rem" scrollable :fullscreen="!mdAndUp">
    <VCard class="subscribe-season-dialog">
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-clipboard-list-outline" class="me-2" />
        </template>
        <VCardTitle class="pe-10">
          {{ t('dialog.subscribeSeason.selectSeasons') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ props.media?.title }}
        </VCardSubtitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <div class="subscribe-season-group-selector">
          <div class="subscribe-season-group-label">
            {{ t('dialog.subscribeSeason.selectGroup') }}
          </div>
          <div class="subscribe-season-group-options">
            <button
              v-for="group in episodeGroupOptions"
              :key="group.value || 'default'"
              type="button"
              class="subscribe-season-group-option"
              :class="{ 'subscribe-season-group-option--active': episodeGroup === group.value }"
              @click="setEpisodeGroup(group.value)"
            >
              <VIcon :icon="group.icon" size="small" />
              <span class="subscribe-season-group-text">
                <span class="subscribe-season-group-title">{{ group.title }}</span>
                <span class="subscribe-season-group-subtitle">{{ group.subtitle }}</span>
              </span>
            </button>
          </div>
        </div>
        <LoadingBanner v-if="!isRefreshed" class="mt-5" />
        <div v-else-if="seasonInfos.length > 0">
          <VList lines="three" class="subscribe-season-list">
            <VListItem
              v-for="(item, i) in seasonInfos"
              :key="i"
              :active="isSeasonSelected(item.season_number || 0)"
              rounded="lg"
              class="subscribe-season-list-item"
              @click="toggleSeasonSelected(item.season_number || 0)"
            >
              <template #prepend>
                <VImg
                  height="90"
                  width="60"
                  :src="getSeasonPoster(item.poster_path || '')"
                  aspect-ratio="2/3"
                  class="object-cover rounded ring-gray-500 me-3"
                  cover
                >
                  <template #placeholder>
                    <div class="w-full h-full">
                      <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                    </div>
                  </template>
                </VImg>
              </template>
              <VListItemTitle>
                {{ t('dialog.subscribeSeason.seasonNumber', { number: item.season_number }) }}
              </VListItemTitle>
              <VListItemSubtitle class="mt-1 me-2">
                <VChip v-if="item.vote_average" color="primary" size="small" class="mb-1">
                  <VIcon icon="mdi-star" /> {{ t('dialog.subscribeSeason.voteAverage', { score: item.vote_average }) }}
                </VChip>
                {{ getYear(item.air_date || '') }} •
                {{ t('dialog.subscribeSeason.episodeCount', { count: item.episode_count }) }}
              </VListItemSubtitle>
              <VListItemSubtitle>
                {{ t('dialog.subscribeSeason.airDate', { date: formatAirDate(item.air_date || '') }) }}
              </VListItemSubtitle>
              <VListItemSubtitle>
                <VChip
                  v-if="seasonsNotExisted"
                  class="mt-2"
                  size="small"
                  :color="getExistColor(item.season_number || 0)"
                >
                  {{ getExistText(item.season_number || 0) }}
                </VChip>
                <VChip v-if="isSeasonSubscribed(item.season_number || 0)" class="mt-2 ms-2" size="small" color="error">
                  {{ t('media.status.subscribed') }}
                </VChip>
              </VListItemSubtitle>
              <template #append>
                <VListItemAction start class="subscribe-season-actions">
                  <VSwitch
                    :model-value="isSeasonSelected(item.season_number || 0)"
                    hide-details
                    @click.stop
                    @update:model-value="setSeasonSelected(item.season_number || 0, $event)"
                  />
                  <VBtnToggle
                    v-if="isSeasonSelected(item.season_number || 0)"
                    :model-value="seasonModes[item.season_number || 0] || 'normal'"
                    density="compact"
                    divided
                    mandatory
                    variant="outlined"
                    class="subscribe-season-mode-toggle"
                    @click.stop
                    @update:model-value="updateSeasonMode(item.season_number || 0, $event)"
                  >
                    <VBtn
                      v-for="mode in subscribeModeOptions"
                      :key="mode.value"
                      :value="mode.value"
                      :color="getSubscribeModeColor(mode.value)"
                      size="small"
                      class="subscribe-season-mode-button"
                    >
                      <VIcon :icon="mode.icon" size="small" />
                      <span>{{ mode.title }}</span>
                    </VBtn>
                  </VBtnToggle>
                </VListItemAction>
              </template>
            </VListItem>
          </VList>
        </div>
        <NoDataFound v-else errorTitle="出错啦！" :errorDescription="`${props.media?.title} 未查询到季集信息`" />
      </VCardText>
      <VCardActions class="justify-center py-3">
        <VBtn
          :disabled="!hasSelectionChanges"
          width="30%"
          min-width="8rem"
          color="primary"
          variant="elevated"
          class="subscribe-season-submit"
          @click="subscribeSeasons"
        >
          <template #prepend>
            <VIcon icon="mdi-check" />
          </template>
          {{ submitButtonText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.subscribe-season-actions {
  display: grid;
  align-content: space-between;
  align-self: stretch;
  block-size: 100%;
  gap: 0.5rem;
  justify-items: end;
  min-inline-size: 18rem;
}

.subscribe-season-group-selector {
  display: grid;
  gap: 0.5rem;
  margin-block-end: 1rem;
}

.subscribe-season-group-label {
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.75rem;
  line-height: 1rem;
}

.subscribe-season-group-options {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-block: 0.125rem 0.375rem;
  scrollbar-width: thin;
}

.subscribe-season-group-option {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
  color: rgb(var(--v-theme-on-surface));
  gap: 0.5rem;
  max-inline-size: 16rem;
  min-inline-size: 11rem;
  padding-block: 0.5rem;
  padding-inline: 0.75rem;
  text-align: start;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.subscribe-season-group-option:hover {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.08);
}

.subscribe-season-group-option--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
}

.subscribe-season-group-text {
  display: grid;
  min-inline-size: 0;
}

.subscribe-season-group-title,
.subscribe-season-group-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subscribe-season-group-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
}

.subscribe-season-group-subtitle {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.75rem;
  line-height: 1rem;
}

.subscribe-season-group-option--active .subscribe-season-group-subtitle {
  color: rgba(var(--v-theme-primary), 0.82);
}

.subscribe-season-list {
  display: grid;
  gap: 0.5rem;
}

.subscribe-season-list-item {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.subscribe-season-list-item :deep(.v-list-item__append) {
  align-items: stretch;
  align-self: stretch;
}

.subscribe-season-mode-toggle {
  block-size: 2rem;
  max-inline-size: 18rem;
}

.subscribe-season-mode-button {
  min-inline-size: 0;
  padding-inline: 0.5rem;
}

.subscribe-season-mode-button span {
  font-size: 0.75rem;
  line-height: 1rem;
  margin-inline-start: 0.25rem;
  white-space: nowrap;
}

@media (width <= 960px) {
  .subscribe-season-actions {
    gap: 0.375rem;
    min-inline-size: 6.75rem;
  }

  .subscribe-season-mode-toggle {
    inline-size: 6.75rem;
    max-inline-size: 6.75rem;
  }

  .subscribe-season-mode-button {
    flex: 1 1 0;
    padding-inline: 0.25rem;
  }

  .subscribe-season-mode-button span {
    display: none;
  }
}

@media (width <= 640px) {
  .subscribe-season-submit {
    inline-size: 100% !important;
  }

  .subscribe-season-list-item :deep(.v-list-item__content) {
    min-inline-size: 0;
  }

  .subscribe-season-group-option {
    max-inline-size: 12rem;
    min-inline-size: 9.5rem;
  }
}
</style>
