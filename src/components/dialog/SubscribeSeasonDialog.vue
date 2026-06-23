<script lang="ts" setup>
import api from '@/api'
import { MediaInfo, MediaSeason, NotExistMediaInfo } from '@/api/types'
import { PropType } from 'vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'

// 国际化
const { t } = useI18n()

// 定义事件
const emit = defineEmits(['subscribe', 'close'])

// 定义输入
const props = defineProps({
  media: Object as PropType<MediaInfo>,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 季详情
const seasonInfos = ref<MediaSeason[]>([])

// 选中的订阅季
const seasonsSelected = ref<MediaSeason[]>([])

// 各季缺失状态：0-已入库 1-部分缺失 2-全部缺失，没有数据也是已入库
const seasonsNotExisted = ref<{ [key: number]: number }>({})

// 是否刷新过
const isRefreshed = ref(false)

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 当前选择剧集组
const episodeGroup = ref('')

// 剧集组选项属性
function episodeGroupItemProps(item: { title: string; subtitle: string }) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

// 剧集组选项
const episodeGroupOptions = computed(() => {
  let options = (episodeGroups.value as { id: string; name: string; group_count: number; episode_count: number }[]).map(
    item => {
      return {
        title: item.name,
        subtitle: `${t('dialog.subscribeSeason.seasonCount', { count: item.group_count })} • ${t(
          'dialog.subscribeSeason.episodeCount',
          { count: item.episode_count },
        )}`,
        value: item.id,
      }
    },
  )
  // 添加不使用选项
  options.unshift({
    title: t('dialog.subscribeSeason.defaultGroup'),
    subtitle: t('dialog.subscribeSeason.seasonCount', { count: seasonInfos.value.length }),
    value: '',
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
    let tmpMedia = props.media ?? { episode_group: '' }
    if (episodeGroup.value) tmpMedia.episode_group = episodeGroup.value
    else tmpMedia.episode_group = ''
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

function subscribeSeasons() {
  emit('subscribe', seasonsSelected.value, seasonsNotExisted.value, episodeGroup.value)
}

watchEffect(() => {
  if (episodeGroup.value) getGroupSeasons()
  else getMediaSeasons()
  checkSeasonsNotExists()
})

onMounted(async () => {
  getMediaSeasons()
  getEpisodeGroups()
  checkSeasonsNotExists()
})
</script>

<template>
  <VBottomSheet inset scrollable>
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem>
        <VCardTitle class="pe-10"> {{ t('dialog.subscribeSeason.title', { title: props.media?.title }) }} </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VSelect
          v-model="episodeGroup"
          :items="episodeGroupOptions"
          :item-props="episodeGroupItemProps"
          :label="t('dialog.subscribeSeason.selectGroup')"
          persistent-hint
        />
        <LoadingBanner v-if="!isRefreshed" class="mt-5" />
        <div v-else-if="seasonInfos.length > 0">
          <VList v-model:selected="seasonsSelected" lines="three" select-strategy="classic">
            <VListItem v-for="(item, i) in seasonInfos" :key="i" :value="item">
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
              </VListItemSubtitle>
              <template #append="{ isSelected }">
                <VListItemAction start>
                  <VSwitch :model-value="isSelected" />
                </VListItemAction>
              </template>
            </VListItem>
          </VList>
        </div>
        <NoDataFound v-else errorTitle="出错啦！" :errorDescription="`${props.media?.title} 未查询到季集信息`" />
      </VCardText>
      <div class="my-2 text-center">
        <VBtn :disabled="seasonsSelected.length === 0" width="30%" @click="subscribeSeasons">
          {{
            seasonsSelected.length === 0
              ? t('dialog.subscribeSeason.selectSeasons')
              : t('dialog.subscribeSeason.submit')
          }}
        </VBtn>
      </div>
    </VCard>
  </VBottomSheet>
</template>
