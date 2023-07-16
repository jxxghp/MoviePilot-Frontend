<script lang="ts" setup>
import { isIntersected } from '@/@core/utils'
import api from '@/api'
import { Context } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import store from '@/store'

// 定义输入参数
const props = defineProps({
  keyword: String,
})

// 数据列表
const dataList = ref<Context[]>([])

// 分组后的数据列表
const groupedDataList = computed(() => {
  return groupByTitleAndSize(dataList.value)
})

// 是否刷新过
const isRefreshed = ref(false)

// 加载进度文本
const progressText = ref('')
// 加载进度
const progressValue = ref(0)
// 加载进度SSE
const progressEventSource = ref<EventSource>()

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
})

// 获取站点过滤选项
const getSiteFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.torrent_info?.site_name && !options.includes(data.torrent_info?.site_name)) {
      options.push(data.torrent_info?.site_name)
    }
  })
  return options
})

// 获取季过滤选项
const getSeasonFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.meta_info.season_episode && !options.includes(data.meta_info.season_episode)) {
      options.push(data.meta_info.season_episode)
    }
  })
  return options
})

// 获取制作组过滤选项
const getReleaseGroupFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.meta_info.resource_team && !options.includes(data.meta_info.resource_team)) {
      options.push(data.meta_info.resource_team)
    }
  })
  return options
})

// 获取视频编码过滤选项
const getVideoCodeFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.meta_info.video_encode && !options.includes(data.meta_info.video_encode)) {
      options.push(data.meta_info.video_encode)
    }
  })
  return options
})

// 获取促销状态过滤选项
const getFreeStateFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.torrent_info.volume_factor && !options.includes(data.torrent_info.volume_factor)) {
      options.push(data.torrent_info.volume_factor)
    }
  })
  return options
})

// 获取质量过滤选项
const getEditionFilterOptions = computed(() => {
  const options: string[] = []
  dataList.value.forEach(data => {
    if (data.meta_info.edition && !options.includes(data.meta_info.edition)) {
      options.push(data.meta_info.edition)
    }
  })
  return options
})

// 按过滤项过滤卡片
const filterTorrentsCard = (data: Context) => {
  // 当前分组的所有数据
  const items: Context[] = groupedDataList.value.get(`${data.torrent_info.title}_${data.torrent_info.size}`) ?? []

  // 站点名称、促销状态
  let site_names = []
  let volume_factors = []
  for (const { torrent_info } of items) {    
    site_names.push(torrent_info.site_name)
    volume_factors.push(torrent_info.volume_factor)
  }

  const { meta_info } = data

  // 季、制作组、视频编码
  const { season_episode, resource_team, video_encode } = meta_info 

  // 站点过滤
  if (filterForm.site.length > 0 && !isIntersected(filterForm.site, site_names)) {
    return false
  }

  // 促销状态过滤
  if (filterForm.freeState.length > 0 && !isIntersected(filterForm.freeState, volume_factors)) {
    return false
  }

  // 季过滤
  if (filterForm.season.length > 0 && !filterForm.season.includes(season_episode)) {
    return false
  }

  // 制作组过滤
  if (filterForm.releaseGroup.length > 0 && !filterForm.releaseGroup.includes(resource_team || '')) {
    return false
  }

  // 视频编码过滤
  if (filterForm.videoCode.length > 0 && !filterForm.videoCode.includes(video_encode || '')) {
    return false
  }

  // 质量过滤
  if (filterForm.edition.length > 0 && !filterForm.edition.includes(meta_info.edition)) {
    return false
  }

  return true
}

// 获取订阅列表数据
const fetchData = async () => {
  try {
    let keyword = props.keyword?.toString() ?? ''
    if (!keyword) {
      // 查询上次搜索结果
      dataList.value = await api.get('search/last')
    } else {
      startLoadingProgress()
      // 优先按TMDBID精确查询
      if (props.keyword?.startsWith('tmdb:') || props.keyword?.startsWith('douban:')) {
        dataList.value = await api.get(`search/media/${props.keyword}`)
      } else {
        // 按标题模糊查询
        dataList.value = await api.get(`search/title/${props.keyword}`)
      }
      stopLoadingProgress()
    }
    isRefreshed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 按标题和大小分组
const groupByTitleAndSize = (contextArray: Context[]): Map<string, Context[]> => {
  const groupMap = new Map<string, Context[]>()

  for (const context of contextArray) {
    const { torrent_info } = context
    const key = `${torrent_info.title}_${torrent_info.size}`

    if (groupMap.has(key)) {
      // 已存在相同标题和大小的分组，将当前上下文信息添加到分组中
      const group = groupMap.get(key)
      group?.push(context)
    } else {
      // 创建新的分组，并将当前上下文信息添加到分组中
      groupMap.set(key, [context])
    }
  }

  return groupMap
}

// 获取每个分组的第一个数据
const getFirstContexts = computed(() => {
  const firstContexts: Context[] = []

  groupedDataList.value.forEach(group => {
    if (group.length > 0) {
      firstContexts.push(group[0])
    }
  })

  return firstContexts
})

// 使用SSE监听加载进度
const startLoadingProgress = () => {
  progressText.value = '正在搜索，请稍候...'
  const token = store.state.auth.token
  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/search?token=${token}`,
  )
  progressEventSource.value.onmessage = event => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
const stopLoadingProgress = () => {
  progressEventSource.value?.close()
}

// 加载时获取数据
onBeforeMount(fetchData)
</script>

<template>
  <VCard class="bg-transparent mb-3 pt-2 shadow-none">
    <VRow>
      <VCol
        v-if="getSiteFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.site"
          :items="getSiteFilterOptions"
          size="small"
          density="compact"
          chips
          label="站点"
          multiple
        />
      </VCol>
      <VCol
        v-if="getSeasonFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.season"
          :items="getSeasonFilterOptions"
          size="small"
          density="compact"
          chips
          label="季集"
          multiple
        />
      </VCol>
      <VCol
        v-if="getReleaseGroupFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.releaseGroup"
          :items="getReleaseGroupFilterOptions"
          size="small"
          density="compact"
          chips
          label="制作组"
          multiple
        />
      </VCol>
      <VCol
        v-if="getEditionFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.edition"
          :items="getEditionFilterOptions"
          size="small"
          density="compact"
          chips
          label="质量"
          multiple
        />
      </VCol>
      <VCol
        v-if="getVideoCodeFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.videoCode"
          :items="getVideoCodeFilterOptions"
          size="small"
          density="compact"
          chips
          label="视频编码"
          multiple
        />
      </VCol>
      <VCol
        v-if="getFreeStateFilterOptions.length > 0"
        cols="6"
        md=""
      >
        <VSelect
          v-model="filterForm.freeState"
          :items="getFreeStateFilterOptions"
          size="small"
          density="compact"
          chips
          label="促销状态"
          multiple
        />
      </VCol>
    </VRow>
  </VCard>
  <VProgressCircular
    class="centered"
    v-if="!isRefreshed && !props.keyword"
    indeterminate
    color="primary"
  ></VProgressCircular>
  <div
    class="top-centered mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
    v-if="!isRefreshed && props.keyword"
  >
    <VProgressCircular
      class="mb-3"
      color="primary"
      :model-value="progressValue"
      size="64"
      width="7"
    ></VProgressCircular>
    <span>{{ progressText }}</span>
  </div>
  <div
    class="grid gap-3 grid-torrent-card items-start"
    v-if="dataList.length > 0"
  >
    <TorrentCard
      v-for="data in getFirstContexts"
      v-show="filterTorrentsCard(data)"
      :key="data.torrent_info.title"
      :torrent="data"
      :more="groupedDataList.get(`${data.torrent_info.title}_${data.torrent_info.size}`)?.slice(1)"
    />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有资源"
    error-description="没有搜索到符合条件的资源。"
  >
  </NoDataFound>
</template>

<style type="scss">
.grid-torrent-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
