<script lang="ts" setup>
import type { Context } from '@/api/types'
import TorrentItem from '@/components/cards/TorrentItem.vue'
import { list } from 'postcss'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// APP
const appMode = computed(() => {
  return localStorage.getItem('MP_APPMODE') != '0' && display.mdAndDown.value
})

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
  return appMode.value
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
  return seasonFilterOptions.value.sort((a, b) => {
    // 按季,集降序排序
    const parseSeasonEpisode = (str: string) => {
      const seasonRangeMatch = str.match(/S(\d+)(?:-S(\d+))?/)
      const episodeRangeMatch = str.match(/E(\d+)(?:-E(\d+))?/)
      return {
        seasonStart: seasonRangeMatch?.[1] ? parseInt(seasonRangeMatch[1]) : 0,
        seasonEnd: seasonRangeMatch?.[2] ? parseInt(seasonRangeMatch[2]) : 0,
        episodeStart: episodeRangeMatch?.[1] ? parseInt(episodeRangeMatch[1]) : 0,
        episodeEnd: episodeRangeMatch?.[2] ? parseInt(episodeRangeMatch[2]) : 0,
      }
    }
    const parsedA = parseSeasonEpisode(a)
    const parsedB = parseSeasonEpisode(b)
    // 先按季降序排序
    if (parsedB.seasonStart !== parsedA.seasonStart) {
      return parsedB.seasonStart - parsedA.seasonStart
    }
    if (parsedB.seasonEnd !== parsedA.seasonEnd) {
      return parsedB.seasonEnd - parsedA.seasonEnd
    }
    // 按集降序排序
    if (parsedB.episodeStart !== parsedA.episodeStart) {
      return parsedB.episodeStart - parsedA.episodeStart
    }
    if (parsedB.episodeEnd !== parsedA.episodeEnd) {
      return parsedB.episodeEnd - parsedA.episodeEnd
    }
    // 兜底
    return b.localeCompare(a)
  })
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
