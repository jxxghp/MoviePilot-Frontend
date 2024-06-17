<script lang="ts" setup>
import _ from 'lodash'
import type { Context } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'

interface SearchTorrent extends Context {
  more?: Array<Context>
}

// 定义输入参数
const props = defineProps({
  // 数据列表
  items: Array as PropType<SearchTorrent[]>,
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

// 完整的数据列表
let dataList: SearchTorrent[]
// 显示用的数据列表
const displayDataList = ref<Array<SearchTorrent>>([])

// 分组后的数据列表
const groupedDataList = ref<Map<string, Context[]>>()

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

// 计算分组后的列表
onMounted(() => {
  // 数据分组
  const groupMap = new Map<string, Context[]>()
  // 遍历数据
  props.items?.forEach(item => {
    const { torrent_info } = item
    // init options
    initOptions(item)
    // group data
    const key = `${torrent_info.title}_${torrent_info.size}`
    if (groupMap.has(key)) {
      // 已入库相同标题和大小的分组，将当前上下文信息添加到分组中
      const group = groupMap.get(key)
      group?.push(item)
    } else {
      // 创建新的分组，并将当前上下文信息添加到分组中
      groupMap.set(key, [item])
    }
  })
  groupedDataList.value = groupMap

})

// 只监听filterForm和groupedDataList的变化。因为displayDataList的变化不需要清空列表
watch([filterForm, groupedDataList], filterData)
function filterData() {
  // 清空列表
  dataList = []
  displayDataList.value = []
  // 匹配过滤函数，filter中有任一值包含value则返回true
  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))

  groupedDataList.value?.forEach(value => {
    if (value.length > 0) {
      const matchData = value.filter(data => {
        const { meta_info, torrent_info } = data
        // 季、制作组、视频编码
        return (
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
      })
      if (matchData.length > 0) {
        const firstData = _.cloneDeepWith(matchData[0]) as SearchTorrent
        if (matchData.length > 1) firstData.more = matchData.slice(1)

        // 显示前20个，4行左右。
        if (displayDataList.value.length < 20) {
          displayDataList.value.push(firstData)
        } else {
          // 后续内容不显示，存在list里。loadMore的时候再加载。
          dataList.push(firstData)
        }
      }
    }
  })
}

function loadMore({ done }: { done: any }) {
  const itemsToMove = dataList.splice(0, 20) // 从 dataList 中获取最前面的 20 个元素
  displayDataList.value.push(...itemsToMove)
  done('ok')
}
</script>

<template>
  <VCard class="bg-transparent mb-3 pt-2 shadow-none">
    <VRow>
      <VCol v-if="siteFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.site"
          :items="siteFilterOptions"
          size="small"
          density="compact"
          chips
          label="站点"
          multiple
        />
      </VCol>
      <VCol v-if="seasonFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.season"
          :items="sortSeasonFilterOptions"
          size="small"
          density="compact"
          chips
          label="季集"
          multiple
        />
      </VCol>
      <VCol v-if="releaseGroupFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.releaseGroup"
          :items="releaseGroupFilterOptions"
          size="small"
          density="compact"
          chips
          label="制作组"
          multiple
        />
      </VCol>
      <VCol v-if="editionFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.edition"
          :items="editionFilterOptions"
          size="small"
          density="compact"
          chips
          label="质量"
          multiple
        />
      </VCol>
      <VCol v-if="resolutionFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.resolution"
          :items="resolutionFilterOptions"
          size="small"
          density="compact"
          chips
          label="分辨率"
          multiple
        />
      </VCol>
      <VCol v-if="videoCodeFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.videoCode"
          :items="videoCodeFilterOptions"
          size="small"
          density="compact"
          chips
          label="视频编码"
          multiple
        />
      </VCol>
      <VCol v-if="freeStateFilterOptions.length > 0" cols="6" md="">
        <VSelect
          v-model="filterForm.freeState"
          :items="freeStateFilterOptions"
          size="small"
          density="compact"
          chips
          label="促销状态"
          multiple
        />
      </VCol>
    </VRow>
  </VCard>
      <VInfiniteScroll mode="intersect" side="end" :items="displayDataList" class="overflow-hidden"
                       @load="loadMore">
        <template #loading />
        <template #empty />
        <div class="grid gap-3 grid-torrent-card items-start">
          <TorrentCard v-for="item in displayDataList"  :key="`${item.torrent_info.page_url}`" :torrent="item" :more="item.more" />
        </div>
      </VInfiniteScroll>
</template>
