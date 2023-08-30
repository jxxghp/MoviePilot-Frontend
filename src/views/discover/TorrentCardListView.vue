<script lang="ts" setup>
import { ref } from 'vue'
import api from '@/api'
import type { Context } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'
import NoDataFound from '@/components/NoDataFound.vue'
import store from '@/store'

// 定义输入参数
const props = defineProps({
  // 关键字或TMDBID
  keyword: String,

  // 类型
  type: String,

  // 搜索字段
  area: String,
})

interface SearchTorrent extends Context {
  more?: Array<Context>
}

// 数据列表
const dataList = ref <Array<SearchTorrent>>([])

// 分组后的数据列表
const groupedDataList = ref<Map<string, Context[]>>()

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

// 按过滤项过滤卡片
watchEffect(() => {
  // 清空数据
  dataList.value.splice(0)

  const match = (filter: Array<string>, value: string | undefined) =>
    filter.length === 0 || (value && filter.includes(value))

  groupedDataList.value?.forEach((value) => {
    if (value.length > 0) {
      const matchData = value.filter((data) => {
        const { meta_info, torrent_info } = data
        // 季、制作组、视频编码
        const { season_episode, resource_team, video_encode } = meta_info
        return (
          // 站点过滤
          match(filterForm.site, torrent_info.site_name)
          // 促销状态过滤
          && match(filterForm.freeState, torrent_info.volume_factor)
          // 季过滤
          && match(filterForm.season, season_episode)
          // 制作组过滤
          && match(filterForm.releaseGroup, resource_team)
          // 视频编码过滤
          && match(filterForm.videoCode, video_encode)
          // 分辨率过滤
          && match(filterForm.resolution, meta_info.resource_pix)
          // 质量过滤
          && match(filterForm.edition, meta_info.edition)
        )
      })
      if (matchData.length > 0) {
        const firstData = matchData[0] as SearchTorrent
        if (matchData.length > 1)
          firstData.more = matchData.slice(1)

        dataList.value.push(firstData)
      }
    }
  })
})

// 获取订阅列表数据
async function fetchData(): Promise<Array<Context>> {
  try {
    let searchData: Array<Context>
    const keyword = props.keyword ?? ''
    const mtype = props.type ?? ''
    const area = props.area ?? ''
    if (!keyword) {
      // 查询上次搜索结果
      searchData = await api.get('search/last')
    }
    else {
      startLoadingProgress()
      // 优先按TMDBID精确查询
      if (props.keyword?.startsWith('tmdb:') || props.keyword?.startsWith('douban:')) {
        searchData = await api.get(`search/media/${props.keyword}`, {
          params: {
            mtype,
            area,
          },
        })
      }
      else {
        // 按标题模糊查询
        searchData = await api.get(`search/title/${props.keyword}`)
      }
      stopLoadingProgress()
    }
    isRefreshed.value = true
    return Promise.resolve(searchData)
  }
  catch (error) {
    console.error(error)
    return Promise.reject(error)
  }
}

function initData() {
  // load data
  fetchData().then((data) => {
    const groupMap = new Map<string, Context[]>()

    data.forEach((item) => {
      const { torrent_info } = item
      // init options
      initOptions(item)
      // group data
      const key = `${torrent_info.title}_${torrent_info.size}`
      if (groupMap.has(key)) {
        // 已存在相同标题和大小的分组，将当前上下文信息添加到分组中
        const group = groupMap.get(key)
        group?.push(item)
      }
      else {
        // 创建新的分组，并将当前上下文信息添加到分组中
        groupMap.set(key, [item])
      }
    })
    groupedDataList.value = groupMap
  })
}

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

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = '正在搜索，请稍候...'

  const token = store.state.auth.token

  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/search?token=${token}`,
  )
  progressEventSource.value.onmessage = (event) => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressEventSource.value?.close()
}

// 加载时获取数据
onMounted(initData)
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
          :items="seasonFilterOptions"
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
  <div v-if="!isRefreshed" class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center">
    <VProgressCircular v-if="!props.keyword" size="48" indeterminate color="primary" />
    <VProgressCircular v-if="props.keyword" class="mb-3" color="primary" :model-value="progressValue" size="64" />
    <span>{{ progressText }}</span>
  </div>
  <div v-if="dataList.length > 0" class="grid gap-3 grid-torrent-card items-start">
    <TorrentCard v-for="data in dataList" :key="`${data.torrent_info.title}_${data.torrent_info.site}`" :torrent="data" :more="data.more" />
  </div>
  <NoDataFound
    v-if="dataList.length === 0 && isRefreshed"
    error-code="404"
    error-title="没有资源"
    error-description="没有搜索到符合条件的资源。"
  />
</template>

<style lang="scss">
.grid-torrent-card {
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  padding-block-end: 1rem;
}
</style>
