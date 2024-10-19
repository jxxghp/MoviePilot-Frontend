<script lang="ts" setup>
import type { Context } from '@/api/types'
import TorrentItem from '@/components/cards/TorrentItem.vue'
import { list } from 'postcss'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = inject('pwaMode') && display.mdAndDown.value

// 定义输入参数
const props = defineProps({
  // 数据列表
  items: Array as PropType<Context[]>,
})

// 过滤表单
const filterForm = reactive({
  // 站点
  site: [] as string[],
  // 季
  season: [] as string[],
  // 制作组
  releaseGroup: [] as string[],
  // 视频编码
  videoCode: [] as string[],
  // 促销状态
  freeState: [] as string[],
  // 质量
  edition: [] as string[],
  // 分辨率
  resolution: [] as string[],
})

// 列表样式
const listStyle = computed(() => {
  return appMode
    ? 'height: calc(100vh - 7.5rem - env(safe-area-inset-bottom) - 3.5rem)'
    : 'height: calc(100vh - 6.5rem - env(safe-area-inset-bottom)'
})

// 排序字段
const sortField = ref('default')

// 数据列表
const dataList = ref<Array<Context>>([])

// 获取站点过滤选项
const siteFilterOptions = ref<Array<string>>([])
// 获取季过滤选项
const seasonFilterOptions = ref<Array<string>>([])
// 获取制作组过滤选项
const releaseGroupFilterOptions = ref<Array<string>>([])
// 获取视频编码过滤选项
const videoCodeFilterOptions = ref<Array<string>>([])
// 获取促销状态过滤选项
const freeStateFilterOptions = ref<Array<string>>([])
// 获取质量过滤选项
const editionFilterOptions = ref<Array<string>>([])
// 获取分辨率过滤选项
const resolutionFilterOptions = ref<Array<string>>([])

// 初始化过滤选项
function initOptions(data: Context) {
  const { torrent_info, meta_info } = data
  const optionValue = (options: Array<string>, value: string | undefined) => {
    value && !options.includes(value) && options.push(value)
  }
  optionValue(siteFilterOptions.value, torrent_info?.site_name)
  optionValue(seasonFilterOptions.value, meta_info?.season_episode)
  optionValue(releaseGroupFilterOptions.value, meta_info?.resource_team)
  optionValue(videoCodeFilterOptions.value, meta_info?.video_encode)
  optionValue(freeStateFilterOptions.value, torrent_info?.volume_factor)
  optionValue(editionFilterOptions.value, meta_info?.edition)
  optionValue(resolutionFilterOptions.value, meta_info?.resource_pix)
}

// 对季过滤选项进行排序
const sortSeasonFilterOptions = computed(() => {
  // 预解析所有选项
  const parsedOptions = seasonFilterOptions.value.map((option, index) => {
    const parseSeasonEpisode = (str: string) => {
      const match = str.match(/^S(\d+)(?:-S(\d+))?(?:\s*E(\d+)(?:-E(\d+))?)?$/)

      if (!match) {
        // 如果字符串格式不正确，返回默认值
        return {
          original: str,
          seasonStart: 0,
          seasonEnd: 0,
          episodeStart: 0,
          episodeEnd: 0,
          maxSeason: 0,
          maxEpisode: 0,
          index,
        }
      }

      const seasonStart = match[1] ? parseInt(match[1], 10) : 0
      const seasonEnd = match[2] ? parseInt(match[2], 10) : 0
      const episodeStart = match[3] ? parseInt(match[3], 10) : 0
      const episodeEnd = match[4] ? parseInt(match[4], 10) : 0
      const maxSeason = seasonEnd > 0 ? seasonEnd : seasonStart
      const maxEpisode = episodeEnd > 0 ? episodeEnd : episodeStart

      return {
        original: str,
        seasonStart,
        seasonEnd,
        episodeStart,
        episodeEnd,
        maxSeason,
        maxEpisode,
        index,
      }
    }

    return parseSeasonEpisode(option)
  })

  // 定义判断是否为整季或季范围的函数
  const isWholeSeason = (parsed: (typeof parsedOptions)[0]) =>
    parsed.seasonStart > 0 &&
    (parsed.seasonEnd === 0 || parsed.seasonEnd > parsed.seasonStart) &&
    parsed.episodeStart === 0 &&
    parsed.episodeEnd === 0

  // 定义判断是否包含集数的函数
  const hasEpisodes = (parsed: (typeof parsedOptions)[0]) => parsed.episodeStart > 0 || parsed.episodeEnd > 0

  // 排序逻辑
  parsedOptions.sort((a, b) => {
    const aIsWhole = isWholeSeason(a)
    const bIsWhole = isWholeSeason(b)
    const aHasEpisodes = hasEpisodes(a)
    const bHasEpisodes = hasEpisodes(b)

    // 优先级1：整季和季范围选项优先于带有集数的选项
    if (aIsWhole && !bIsWhole) return -1
    if (!aIsWhole && bIsWhole) return 1

    // 优先级2：如果都是整季或季范围选项，按 maxSeason 降序排列
    if (aIsWhole && bIsWhole) {
      if (b.maxSeason !== a.maxSeason) {
        return b.maxSeason - a.maxSeason
      }
      // 如果 maxSeason 相同，则按原始索引
      return a.index - b.index
    }

    // 优先级3：如果都是带有集数的选项，先按 maxSeason 降序，再按 maxEpisode 降序
    if (aHasEpisodes && bHasEpisodes) {
      if (b.maxSeason !== a.maxSeason) {
        return b.maxSeason - a.maxSeason
      }
      if (b.maxEpisode !== a.maxEpisode) {
        return b.maxEpisode - a.maxEpisode
      }
      // 如果 maxSeason 和 maxEpisode 相同，则按原始索引
      return a.index - b.index
    }

    // 优先级4：如果一个有集数，一个没有，优先有集数的选项
    if (aHasEpisodes && !bHasEpisodes) return -1
    if (!aHasEpisodes && bHasEpisodes) return 1

    // 优先级5：对于没有集数且不是整季的选项，按 seasonStart 和 seasonEnd 降序排序
    if (b.seasonStart !== a.seasonStart) {
      return b.seasonStart - a.seasonStart
    }
    if (b.seasonEnd !== a.seasonEnd) {
      return b.seasonEnd - a.seasonEnd
    }

    // 优先级6：按 episodeStart 和 episodeEnd 降序排序
    if (b.episodeStart !== a.episodeStart) {
      return b.episodeStart - a.episodeStart
    }
    if (b.episodeEnd !== a.episodeEnd) {
      return b.episodeEnd - a.episodeEnd
    }

    // 优先级7：兜底按字母降序排列
    if (a.original !== b.original) {
      return b.original.localeCompare(a.original)
    }

    // 优先级8：如果所有条件都相同，则按原始索引
    return a.index - b.index
  })

  // 返回排序后的原始字符串数组
  return parsedOptions.map(option => option.original)
})

// 排序
watchEffect(() => {
  const list = dataList.value
  if (sortField.value === 'default') {
    dataList.value = list.sort((a, b) => b.torrent_info.pri_order - a.torrent_info.pri_order)
  } else if (sortField.value === 'site') {
    dataList.value = list.sort((a, b) => (a.torrent_info.site_name || '').localeCompare(b.torrent_info.site_name || ''))
  } else if (sortField.value === 'size') {
    dataList.value = list.sort((a, b) => b.torrent_info.size - a.torrent_info.size)
  } else if (sortField.value === 'seeder') {
    dataList.value = list.sort((a, b) => b.torrent_info.seeders - a.torrent_info.seeders)
  }
})

// 计算过滤后的列表
watchEffect(() => {
  // 清空列表
  dataList.value = []
  // 匹配过滤函数
  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))

  props.items?.forEach(data => {
    const { meta_info, torrent_info } = data
    if (
      // 站点过滤
      match(filterForm.site, torrent_info.site_name) &&
      // 促销状态过滤
      match(filterForm.freeState, torrent_info.volume_factor) &&
      // 季过滤
      match(filterForm.season, meta_info.season_episode) &&
      // 制作组过滤
      match(filterForm.releaseGroup, meta_info.resource_team) &&
      // 视频编码过滤
      match(filterForm.videoCode, meta_info.video_encode) &&
      // 分辨率过滤
      match(filterForm.resolution, meta_info.resource_pix) &&
      // 质量过滤
      match(filterForm.edition, meta_info.edition)
    )
      dataList.value.push(data)
  })
})

// 初始化过滤选项
onMounted(() => {
  props.items?.forEach(item => {
    initOptions(item)
  })
})
</script>

<template>
  <VRow>
    <VCol>
      <VList v-if="dataList.length === 0" lines="three" class="rounded p-0 shadow-lg">
        <VListItem>
          <VListItemTitle>没有附合当前过滤条件的资源。</VListItemTitle>
        </VListItem>
      </VList>
      <VList v-if="dataList.length !== 0" lines="three" class="rounded p-0 torrent-list-vscroll shadow-lg">
        <VVirtualScroll :items="dataList" :style="listStyle">
          <template #default="{ item }">
            <TorrentItem :torrent="item" :key="`${item.torrent_info.page_url}`" />
          </template>
        </VVirtualScroll>
      </VList>
    </VCol>
    <VCol xl="2" md="3" v-if="display.mdAndUp.value">
      <VList lines="one" class="rounded shadow-lg" :style="listStyle">
        <VListSubheader> 排序 </VListSubheader>
        <VListItem>
          <VChipGroup column v-model="sortField">
            <VChip :color="sortField == 'default' ? 'primary' : ''" filter variant="outlined" value="default">
              默认
            </VChip>
            <VChip :color="sortField == 'site' ? 'primary' : ''" filter variant="outlined" value="site"> 站点 </VChip>
            <VChip :color="sortField == 'size' ? 'primary' : ''" filter variant="outlined" value="size">
              文件大小
            </VChip>
            <VChip :color="sortField == 'seeder' ? 'primary' : ''" filter variant="outlined" value="seeder">
              做种数
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="siteFilterOptions.length > 0"> 站点 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.site" column multiple>
            <VChip
              v-for="site in siteFilterOptions"
              :key="site"
              :color="filterForm.site.includes(site) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="site"
            >
              {{ site }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="editionFilterOptions.length > 0"> 质量 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.edition" column multiple>
            <VChip
              v-for="edition in editionFilterOptions"
              :key="edition"
              :color="filterForm.edition.includes(edition) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="edition"
            >
              {{ edition }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="resolutionFilterOptions.length > 0"> 分辨率 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.resolution" column multiple>
            <VChip
              v-for="resolution in resolutionFilterOptions"
              :key="resolution"
              :color="filterForm.resolution.includes(resolution) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="resolution"
            >
              {{ resolution }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="releaseGroupFilterOptions.length > 0"> 制作组 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.releaseGroup" column multiple>
            <VChip
              v-for="releaseGroup in releaseGroupFilterOptions"
              :key="releaseGroup"
              :color="filterForm.releaseGroup.includes(releaseGroup) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="releaseGroup"
            >
              {{ releaseGroup }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="videoCodeFilterOptions.length > 0"> 视频编码 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.videoCode" column multiple>
            <VChip
              v-for="videoCode in videoCodeFilterOptions"
              :key="videoCode"
              :color="filterForm.videoCode.includes(videoCode) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="videoCode"
            >
              {{ videoCode }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="freeStateFilterOptions.length > 0"> 促销状态 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.freeState" column multiple>
            <VChip
              v-for="freeState in freeStateFilterOptions"
              :key="freeState"
              :color="filterForm.freeState.includes(freeState) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="freeState"
            >
              {{ freeState }}
            </VChip>
          </VChipGroup>
        </VListItem>
        <VListSubheader v-if="seasonFilterOptions.length > 0"> 季集 </VListSubheader>
        <VListItem>
          <VChipGroup v-model="filterForm.season" column multiple>
            <VChip
              v-for="season in sortSeasonFilterOptions"
              :key="season"
              :color="filterForm.season.includes(season) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="season"
            >
              {{ season }}
            </VChip>
          </VChipGroup>
        </VListItem>
      </VList>
    </VCol>
  </VRow>
</template>
