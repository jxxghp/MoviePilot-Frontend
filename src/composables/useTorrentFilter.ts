import type { Context } from '@/api/types'
import { cloneDeepWith } from 'lodash-es'
import { useI18n } from 'vue-i18n'

// 卡片视图的分组数据类型
interface SearchTorrent extends Context {
  more?: Array<Context>
}

interface GroupedItem {
  data: SearchTorrent
  originalIndex: number
}

// 筛选状态类型
export interface FilterState {
  filterForm: Record<string, string[]>
  filterOptions: Record<string, string[]>
  sortField: string
  sortType: 'asc' | 'desc'
}

// useTorrentFilter composable
export function useTorrentFilter() {
  const { t } = useI18n()

  // 过滤表单
  const filterForm: Record<string, string[]> = reactive({
    site: [] as string[],
    season: [] as string[],
    releaseGroup: [] as string[],
    videoCode: [] as string[],
    freeState: [] as string[],
    edition: [] as string[],
    resolution: [] as string[],
  })

  // 统一存储过滤选项
  const filterOptions: Record<string, string[]> = reactive({
    site: [] as string[],
    season: [] as string[],
    freeState: [] as string[],
    edition: [] as string[],
    resolution: [] as string[],
    videoCode: [] as string[],
    releaseGroup: [] as string[],
  })

  // 排序字段
  const sortField = ref('default')
  // 排序方向
  const sortType = ref<'asc' | 'desc'>('desc')

  // 过滤项映射
  const filterTitles: Record<string, string> = {
    site: t('torrent.filterSite'),
    season: t('torrent.filterSeason'),
    freeState: t('torrent.filterFreeState'),
    videoCode: t('torrent.filterVideoCode'),
    edition: t('torrent.filterEdition'),
    resolution: t('torrent.filterResolution'),
    releaseGroup: t('torrent.filterReleaseGroup'),
  }

  // 排序中文名
  const sortTitles: Record<string, string> = {
    default: t('torrent.sortDefault'),
    site: t('torrent.sortSite'),
    size: t('torrent.sortSize'),
    seeder: t('torrent.sortSeeder'),
    publishTime: t('torrent.sortPublishTime'),
  }

  // 筛选后数据的原始索引列表
  const filteredIndices = ref<number[]>([])

  // 筛选后的总数量
  const totalFilteredCount = ref(0)

  // 初始化过滤选项
  function initOptions(data: Context) {
    const { torrent_info, meta_info } = data
    const optionValue = (options: Array<string>, value: string | undefined) => {
      if (value && !options.includes(value)) {
        options.push(value)
        // 如果是season选项，立即触发重新计算
        if (options === filterOptions.season) {
          sortSeasonOptions()
        }
      }
    }

    optionValue(filterOptions.site, torrent_info?.site_name)
    optionValue(filterOptions.season, meta_info?.season_episode)
    optionValue(filterOptions.releaseGroup, meta_info?.resource_team)
    optionValue(filterOptions.videoCode, meta_info?.video_encode)
    optionValue(filterOptions.freeState, torrent_info?.volume_factor)
    optionValue(filterOptions.edition, meta_info?.edition)
    optionValue(filterOptions.resolution, meta_info?.resource_pix)
  }

  // 直接对季集选项进行排序的函数
  function sortSeasonOptions() {
    if (filterOptions.season.length <= 1) {
      return
    }

    const parsedOptions = filterOptions.season.map((option, index) => {
      const match = option.match(/^S(\d+)(?:-S(\d+))?\s*(?:E(\d+)(?:-E(\d+))?)?$/)

      if (!match) {
        return {
          original: option,
          seasonNum: 0,
          episodeNum: 0,
          maxEpisodeNum: 0,
          isWholeSeason: false,
          index,
        }
      }

      const seasonNum = parseInt(match[1], 10)
      const episodeNum = match[3] ? parseInt(match[3], 10) : 0
      const maxEpisodeNum = match[4] ? parseInt(match[4], 10) : episodeNum
      const isWholeSeason = !match[3]

      return {
        original: option,
        seasonNum,
        episodeNum,
        maxEpisodeNum,
        isWholeSeason,
        index,
      }
    })

    const wholeSeasons = parsedOptions.filter(item => item.isWholeSeason)
    const episodes = parsedOptions.filter(item => !item.isWholeSeason)

    wholeSeasons.sort((a, b) => {
      if (a.seasonNum !== b.seasonNum) {
        return b.seasonNum - a.seasonNum
      }
      return a.index - b.index
    })

    episodes.sort((a, b) => {
      if (a.seasonNum !== b.seasonNum) {
        return b.seasonNum - a.seasonNum
      }
      const aMaxEp = a.maxEpisodeNum || a.episodeNum
      const bMaxEp = b.maxEpisodeNum || b.episodeNum
      if (aMaxEp !== bMaxEp) {
        return bMaxEp - aMaxEp
      }
      if (a.episodeNum !== b.episodeNum) {
        return b.episodeNum - a.episodeNum
      }
      return a.index - b.index
    })

    const sortedOptions = [...wholeSeasons, ...episodes].map(item => item.original)
    filterOptions.season = sortedOptions
  }

  // 匹配过滤函数
  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))

  // 筛选列表视图数据（不分组）
  function filterRowData(items: Context[] | undefined): Context[] {
    // 重置状态
    filteredIndices.value = []
    
    // 清空并重新初始化过滤选项
    for (const key in filterOptions) {
      filterOptions[key] = []
    }

    if (!items?.length) {
      totalFilteredCount.value = 0
      return []
    }

    // 首先收集所有过滤选项
    items.forEach(data => {
      initOptions(data)
    })

    // 筛选数据
    let filteredData: Context[] = []

    items.forEach((data, index) => {
      const { meta_info, torrent_info } = data
      if (
        match(filterForm.site, torrent_info.site_name) &&
        match(filterForm.freeState, torrent_info.volume_factor) &&
        match(filterForm.season, meta_info.season_episode) &&
        match(filterForm.releaseGroup, meta_info.resource_team) &&
        match(filterForm.videoCode, meta_info.video_encode) &&
        match(filterForm.resolution, meta_info.resource_pix) &&
        match(filterForm.edition, meta_info.edition)
      ) {
        filteredData.push(data)
        filteredIndices.value.push(index)
      }
    })

    totalFilteredCount.value = filteredData.length

    // 排序
    filteredData = sortData(filteredData)

    // 确保季集选项排序
    if (filterOptions.season.length > 0) {
      sortSeasonOptions()
    }

    return filteredData
  }

  // 筛选卡片视图数据（分组）
  function filterCardData(items: Context[] | undefined): SearchTorrent[] {
    // 重置状态
    filteredIndices.value = []

    // 清空并重新初始化过滤选项
    for (const key in filterOptions) {
      filterOptions[key] = []
    }

    if (!items?.length) {
      totalFilteredCount.value = 0
      return []
    }

    // 数据分组
    const groupMap = new Map<string, GroupedItem[]>()

    items.forEach((item, index) => {
      const { torrent_info, meta_info } = item
      // init options
      initOptions(item)
      // group data
      const key = `${meta_info.name}_${meta_info.resource_pix}_${meta_info.edition}_${meta_info.resource_team}_${meta_info.season_episode}_${torrent_info.size}`
      const groupedItem = { data: item, originalIndex: index }
      if (groupMap.has(key)) {
        const group = groupMap.get(key)
        group?.push(groupedItem)
      } else {
        groupMap.set(key, [groupedItem])
      }
    })

    // 筛选数据
    const filteredData: SearchTorrent[] = []
    let matchCount = 0
    // 临时存储：每个分组的第一个原始索引
    const groupIndexMap = new Map<SearchTorrent, number>()

    groupMap.forEach(value => {
      if (value.length > 0) {
        const matchData = value.filter(item => {
          const { meta_info, torrent_info } = item.data
          return (
            match(filterForm.site, torrent_info.site_name) &&
            match(filterForm.freeState, torrent_info.volume_factor) &&
            match(filterForm.season, meta_info.season_episode) &&
            match(filterForm.releaseGroup, meta_info.resource_team) &&
            match(filterForm.videoCode, meta_info.video_encode) &&
            match(filterForm.resolution, meta_info.resource_pix) &&
            match(filterForm.edition, meta_info.edition)
          )
        })
        if (matchData.length > 0) {
          matchCount += matchData.length
          const firstItem = matchData[0]
          const firstData = cloneDeepWith(firstItem.data) as SearchTorrent
          if (matchData.length > 1) firstData.more = matchData.slice(1).map(x => x.data)
          filteredData.push(firstData)
          // 存储该分组的第一个原始索引
          groupIndexMap.set(firstData, firstItem.originalIndex)
        }
      }
    })

    totalFilteredCount.value = matchCount

    // 排序数据
    const sortedData = sortCardData(filteredData)

    // 在排序后重新构建 filteredIndices，保持与排序后顺序一致
    filteredIndices.value = sortedData.map(item => groupIndexMap.get(item) || 0)

    // 确保季集选项排序
    if (filterOptions.season.length > 0) {
      sortSeasonOptions()
    }

    return sortedData
  }

  // 排序列表数据
  function sortData(data: Context[]): Context[] {
    const sortOrder = sortType.value === 'asc' ? 1 : -1

    return data.sort((a, b) => {
      let result = 0
      switch (sortField.value) {
        case 'site':
          result = (a.torrent_info.site_name || '').localeCompare(b.torrent_info.site_name || '')
          break
        case 'size':
          result = a.torrent_info.size - b.torrent_info.size
          break
        case 'seeder':
          result = a.torrent_info.seeders - b.torrent_info.seeders
          break
        case 'publishTime':
          result = new Date(a.torrent_info.pubdate || 0).getTime() - new Date(b.torrent_info.pubdate || 0).getTime()
          break
        case 'default':
        default:
          result = a.torrent_info.pri_order - b.torrent_info.pri_order
          break
      }
      return result * sortOrder
    })
  }

  // 排序卡片数据
  function sortCardData(data: SearchTorrent[]): SearchTorrent[] {
    if (sortField.value === 'default') {
      return data
    }
    const sortOrder = sortType.value === 'asc' ? 1 : -1
    return data.sort((a, b) => {
      let result = 0
      switch (sortField.value) {
        case 'site':
          result = (a.torrent_info.site_name || '').localeCompare(b.torrent_info.site_name || '')
          break
        case 'size':
          result = (Number(a.torrent_info.size) || 0) - (Number(b.torrent_info.size) || 0)
          break
        case 'seeder':
          result = (Number(a.torrent_info.seeders) || 0) - (Number(b.torrent_info.seeders) || 0)
          break
        case 'publishTime':
          result = new Date(a.torrent_info.pubdate || 0).getTime() - new Date(b.torrent_info.pubdate || 0).getTime()
          break
      }
      return result * sortOrder
    })
  }

  // 计算已选择的过滤条件数量
  const getFilterCount = computed(() => {
    let count = 0
    for (const key in filterForm) {
      count += filterForm[key].length
    }
    return count
  })

  // 计算已选择的过滤条件
  const getSelectedFilters = computed(() => {
    const filters: Record<string, string[]> = {}
    for (const key in filterForm) {
      if (filterForm[key].length > 0) {
        filters[key] = [...filterForm[key]]
      }
    }
    return filters
  })

  // 移除单个过滤条件
  function removeFilter(key: string, value: string) {
    const index = filterForm[key].indexOf(value)
    if (index !== -1) {
      filterForm[key].splice(index, 1)
    }
  }

  // 清除所有过滤条件
  function clearAllFilters() {
    for (const key in filterForm) {
      filterForm[key] = []
    }
  }

  // 清除某个过滤项
  function clearFilter(key: string) {
    filterForm[key] = []
  }

  // 全选某个过滤项
  function selectAll(key: string) {
    filterForm[key] = [...filterOptions[key]]
  }

  // 给定过滤类型返回不同图标
  function getFilterIcon(key: string) {
    const icons: Record<string, string> = {
      site: 'mdi-server-network',
      season: 'mdi-television-classic',
      freeState: 'mdi-gift-outline',
      resolution: 'mdi-monitor-screenshot',
      videoCode: 'mdi-video-vintage',
      edition: 'mdi-quality-high',
      releaseGroup: 'mdi-account-group-outline',
    }
    return icons[key] || 'mdi-filter-variant'
  }

  // 处理排序图标点击
  const handleSortIconClick = () => {
    sortType.value = sortType.value === 'asc' ? 'desc' : 'asc'
  }

  // 获取筛选后的原始索引列表
  function getFilteredIndices() {
    return filteredIndices.value
  }

  // 检查是否有活动的筛选条件
  function hasActiveFilters() {
    for (const key in filterForm) {
      if (filterForm[key] && filterForm[key].length > 0) {
        return true
      }
    }
    return false
  }

  // 获取当前筛选条件
  function getFilterForm() {
    const filters: Record<string, string[]> = {}
    for (const key in filterForm) {
      filters[key] = [...filterForm[key]]
    }
    return filters
  }

  // 设置筛选条件
  function setFilterForm(filters: Record<string, string[]>) {
    for (const key in filterForm) {
      filterForm[key] = filters[key] ? [...filters[key]] : []
    }
  }

  // 获取完整的筛选状态
  function getFilterState(): FilterState {
    return {
      filterForm: getFilterForm(),
      filterOptions: { ...filterOptions },
      sortField: sortField.value,
      sortType: sortType.value,
    }
  }

  // 设置完整的筛选状态
  function setFilterState(state: FilterState) {
    setFilterForm(state.filterForm)
    sortField.value = state.sortField
    sortType.value = state.sortType
  }

  return {
    // 状态
    filterForm,
    filterOptions,
    sortField,
    sortType,
    filteredIndices,
    totalFilteredCount,
    // 标题映射
    filterTitles,
    sortTitles,
    // 计算属性
    getFilterCount,
    getSelectedFilters,
    // 筛选方法
    filterRowData,
    filterCardData,
    // 操作方法
    removeFilter,
    clearAllFilters,
    clearFilter,
    selectAll,
    getFilterIcon,
    handleSortIconClick,
    // 状态管理方法
    getFilteredIndices,
    hasActiveFilters,
    getFilterForm,
    setFilterForm,
    getFilterState,
    setFilterState,
    sortSeasonOptions,
  }
}
