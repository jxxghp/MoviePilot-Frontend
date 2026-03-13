<script lang="ts" setup>
import noImage from '@images/no-image.jpeg'
import { getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { useToast } from 'vue-toastification'
import { formatSeason, formatRating } from '@/@core/utils/formatters'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { MediaInfo, Subscribe, MediaSeason, Site } from '@/api/types'
import router from '@/router'
import { useUserStore, useGlobalSettingsStore } from '@/stores'
import SubscribeEditDialog from '../dialog/SubscribeEditDialog.vue'
import SearchSiteDialog from '@/components/dialog/SearchSiteDialog.vue'
import SubscribeSeasonDialog from '../dialog/SubscribeSeasonDialog.vue'
import { useI18n } from 'vue-i18n'
import { mediaTypeDict } from '@/api/constants'
import { hasPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

interface MediaCardMedia extends MediaInfo {
  total_episode?: number
  episode_count?: number
}

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaCardMedia>,
  width: String,
  height: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 用户 Store
const userStore = useUserStore()

// 提示框
const $toast = useToast()

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

// 当前订阅状态
const isSubscribed = ref(false)

// 本地存在状态
const isExists = ref(false)

// 订阅季弹窗
const subscribeSeasonDialog = ref(false)

// 订阅编辑弹窗
const subscribeEditDialog = ref(false)

// 订阅ID
const subscribeId = ref<number>()

// 选中的订阅季
const seasonsSelected = ref<MediaSeason[]>([])

// 来源角标字典
const sourceIconDict: { [key: string]: any } = {
  themoviedb: getLogoUrl('tmdb'),
  douban: getLogoUrl('douban-black'),
  bangumi: getLogoUrl('bangumi'),
}

// 绑定MediaCard元素
const mediaCardRef = ref<HTMLElement | null>(null)

// 创建Intersection Observer实例
const observer = ref<IntersectionObserver | null>(null)

// 所有站点
const allSites = ref<Site[]>([])

// 选中的站点
const selectedSites = ref<number[]>([])

// 搜索菜单显示状态
const searchMenuShow = ref(false)

// 选择站点对话框
const chooseSiteDialog = ref(false)

// 选择的剧集组
const episodeGroup = ref('')

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/IndexerSites')
    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获得mediaid
function getMediaId() {
  if (props.media?.tmdb_id) return `tmdb:${props.media?.tmdb_id}`
  else if (props.media?.douban_id) return `douban:${props.media?.douban_id}`
  else if (props.media?.bangumi_id) return `bangumi:${props.media?.bangumi_id}`
  else return `${props.media?.mediaid_prefix}:${props.media?.media_id}`
}

// 角标颜色
function getChipColor(type: string) {
  if (type === '电影') return 'border-blue-500 bg-blue-600'
  else if (type === '电视剧') return ' bg-indigo-500 border-indigo-600'
  else return 'border-purple-600 bg-purple-600'
}

// 添加订阅处理
async function handleAddSubscribe() {
  if (props.media?.type === '电视剧') {
    // 弹出季选择列表，支持多选
    seasonsSelected.value = []
    subscribeSeasonDialog.value = true
  } else {
    // 电影
    addSubscribe()
  }
}

// 调用API添加订阅，电视剧的话需要指定季
async function addSubscribe(season: number | null = null, best_version: number = 0) {
  // 开始处理
  startNProgress()
  try {
    // 是否洗版
    if (!best_version && props.media?.type == '电影') best_version = isExists.value ? 1 : 0
    // 请求API
    const result: { [key: string]: any } = await api.post('subscribe/', {
      name: props.media?.title,
      type: props.media?.type,
      year: props.media?.year,
      tmdbid: props.media?.tmdb_id,
      doubanid: props.media?.douban_id,
      bangumiid: props.media?.bangumi_id,
      mediaid: props.media?.media_id ? `${props.media?.mediaid_prefix}:${props.media?.media_id}` : '',
      season: props.media?.type === '电影' ? null : season,
      best_version,
      episode_group: episodeGroup.value,
    })

    // 订阅状态
    if (result.success) {
      // 订阅成功
      isSubscribed.value = true
    }

    // 提示
    showSubscribeAddToast(result.success, props.media?.title ?? '', season, result.message, best_version)

    // 弹出订阅编辑弹窗
    if (result.success && seasonsSelected.value.length <= 1) {
      const show_edit_dialog = await queryDefaultSubscribeConfig()
      if (show_edit_dialog) {
        subscribeId.value = result.data.id
        subscribeEditDialog.value = true
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    doneNProgress()
  }
}

// 弹出添加订阅提示
function showSubscribeAddToast(result: boolean, title: string, season: number | null, message: string, best_version: number) {
  if (season !== null) title = `${title} ${formatSeason(season.toString())}`

  let subname = t('subscribe.normalSub')
  if (best_version > 0) subname = t('subscribe.versionSub')

  if (result) $toast.success(`${title} ${t('subscribe.addSuccess', { name: subname })}`)
  else if (!result) $toast.error(`${title} ${t('subscribe.addFailed', { name: subname, message: message })}`)
}

// 调用API取消订阅
async function removeSubscribe() {
  // 开始处理
  startNProgress()
  try {
    const mediaid = getMediaId()

    const result: { [key: string]: any } = await api.delete(`subscribe/media/${mediaid}`, {
      params: {
        season: props.media?.season,
      },
    })

    if (result.success) {
      isSubscribed.value = false
      $toast.success(`${props.media?.title} ${t('subscribe.cancelSuccess')}`)
    } else {
      $toast.error(`${props.media?.title} ${t('subscribe.cancelFailed', { message: result.message })}`)
    }
  } catch (error) {
    console.error(error)
  } finally {
    doneNProgress()
  }
}

// 查询当前媒体是否已订阅
async function handleCheckSubscribe() {
  try {
    const result = await checkSubscribe(props.media?.season ?? null)
    if (result) isSubscribed.value = true
  } catch (error) {
    console.error(error)
  }
}

// 查询当前媒体是否已入库
async function handleCheckExists() {
  try {
    // 对于总集数为 0 的电视剧季（TMDB 未返回有效集数），不展示“已入库”角标，避免误判
    const totalEpisode = props.media?.total_episode ?? props.media?.episode_count ?? props.media?.number_of_episodes ?? 0

    if (props.media?.type === '电视剧' && totalEpisode === 0) {
      isExists.value = false
      return
    }

    const result: { [key: string]: any } = await api.get('mediaserver/exists', {
      params: {
        tmdbid: props.media?.tmdb_id,
        title: props.media?.title,
        year: props.media?.year,
        season: props.media?.season,
        mtype: props.media?.type,
      },
    })

    if (result.success) isExists.value = true
  } catch (error) {
    console.error(error)
  }
}

// 调用API检查是否已订阅，电视剧需要指定季
async function checkSubscribe(season: number | null) {
  try {
    // AbortController 现在由全局请求优化器自动管理
    const mediaid = getMediaId()
    const result: Subscribe = await api.get(`subscribe/media/${mediaid}`, {
      params: {
        season,
        title: props.media?.title,
      },
    })

    return result.id || null
  } catch (error) {
    console.error(error)
  }

  return null
}

// 查询订阅弹窗规则
async function queryDefaultSubscribeConfig() {
  // 非管理员不显示
  if (!userStore.superUser) return false
  try {
    let subscribe_config_url = ''
    if (props.media?.type === '电影') subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'
    const result: { [key: string]: any } = await api.get(subscribe_config_url)
    if (result.data?.value) return result.data.value.show_edit_dialog
  } catch (error) {
    console.log(error)
  }
  return false
}

// 爱心订阅按钮响应
function handleSubscribe() {
  if (isSubscribed.value) removeSubscribe()
  else handleAddSubscribe()
}

// 订阅多季
function subscribeSeasons(seasons: MediaSeason[], seasonNoExists: { [key: number]: number }, groudId: string) {
  subscribeSeasonDialog.value = false
  episodeGroup.value = groudId
  seasonsSelected.value = seasons || []
  seasonsSelected.value.forEach(season => {
    let best_version = 0
    if (season && props.media?.tmdb_id)
      // 全部存在时洗版
      best_version = !seasonNoExists[season.season_number || 0] ? 1 : 0
    addSubscribe(season.season_number ?? null, best_version)
  })
}

// 打开详情页
function goMediaDetail(isHovering = false) {
  if (isHovering) {
    if (props.media?.collection_id) {
      // 跳转到合集列表
      router.push({
        path: `/browse/tmdb/collection/${props.media?.collection_id}`,
        query: {
          title: props.media?.title,
        },
      })
    } else {
      // 跳转到媒体详情页
      router.push({
        path: '/media',
        query: {
          mediaid: getMediaId(),
          title: props.media?.title,
          year: props.media?.year,
          type: props.media?.type,
        },
      })
    }
  }
}

// 点击搜索
async function clickSearch() {
  if (allSites.value?.length == 0) {
    await querySites()
    await querySelectedSites()
  }
  if (allSites.value?.length > 0) {
    chooseSiteDialog.value = true
  } else {
    handleSearch()
  }
}

// 开始搜索
function handleSearch() {
  router.push({
    path: '/resource',
    query: {
      keyword: getMediaId(),
      type: props.media?.type,
      area: 'title',
      title: props.media?.title,
      year: props.media?.year,
      season: props.media?.season,
      sites: selectedSites.value.join(','),
    },
  })
}

// 搜索多站点
function searchSites(sites: number[]) {
  chooseSiteDialog.value = false
  selectedSites.value = sites
  handleSearch()
}

// 懒加载检查
function handleCheckLazy() {
  if (props.media?.collection_id) {
    return
  }
  handleCheckSubscribe()
  handleCheckExists()
}

// 在元素进入视窗时触发懒加载函数
function setupIntersectionObserver() {
  if (mediaCardRef.value) {
    observer.value = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // 只要MediaCard进入视窗，就调用懒加载的操作
            handleCheckLazy()
            // 加载后销毁观察者实例
            observer.value?.disconnect()
            observer.value = null
          }
        })
      },
      { threshold: 0.1 },
    )
    observer.value.observe(mediaCardRef.value)
  }
}

// 计算图片地址
const getImgUrl: Ref<string> = computed(() => {
  if (imageLoadError.value) return noImage
  const url = props.media?.poster_path?.replace('original', 'w500') ?? noImage
  // 使用图片缓存
  if (globalSettings.GLOBAL_IMAGE_CACHE)
    return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodeURIComponent(url)}`
  // 如果地址中包含douban则使用中转代理
  if (url.includes('doubanio.com'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(url)}`
  return url
})

// 移除订阅
function onRemoveSubscribe() {
  subscribeEditDialog.value = false
}

// 获取媒体类型文本
function getMediaTypeText(type: string | undefined) {
  if (!type) return ''
  return mediaTypeDict[type]
}

onMounted(() => {
  setupIntersectionObserver()
})

onBeforeUnmount(() => {
  observer.value?.disconnect()
  observer.value = null
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <div ref="mediaCardRef">
        <VCard
          v-bind="hover.props"
          :height="props.height"
          :width="props.width"
          class="outline-none ring-gray-500 media-card"
          :class="{
            'transition transform-cpu duration-300  -translate-y-1': hover.isHovering,
            'ring-1': isImageLoaded,
          }"
          @click.stop="goMediaDetail(hover.isHovering ?? false)"
        >
          <VImg
            aspect-ratio="2/3"
            :src="getImgUrl"
            class="object-cover aspect-w-2 aspect-h-3"
            cover
            @load="isImageLoaded = true"
            @error="imageLoadError = true"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>

          <!-- 详情 -->
          <VCardText
            v-show="hover.isHovering || imageLoadError || searchMenuShow"
            class="w-full h-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2"
            style="background: linear-gradient(rgba(45, 55, 72, 40%) 0%, rgba(45, 55, 72, 90%) 100%)"
          >
            <span class="font-semibold text-sm">{{ props.media?.year }}</span>
            <h1 class="media-card-title font-bold mb-2 text-white line-clamp-2 overflow-hidden text-ellipsis ...">
              {{ props.media?.title }}
            </h1>
            <p class="media-card-overview line-clamp-3 overflow-hidden text-ellipsis ...">
              {{ props.media?.overview }}
            </p>
            <div v-if="props.media?.collection_id" class="mb-3" @click.stop=""></div>
            <div v-else class="flex align-center justify-between">
              <IconBtn
                v-if="hasPermission({ is_superuser: userStore.superUser, ...userStore.permissions }, 'search')"
                icon="mdi-magnify"
                color="white"
                size="small"
                @click.stop="clickSearch"
              />
              <VSpacer />
              <IconBtn
                icon="mdi-heart"
                :color="isSubscribed ? 'error' : 'white'"
                size="small"
                @click.stop="handleSubscribe"
              />
            </div>
          </VCardText>
          <!-- 类型角标 -->
          <VChip
            v-show="isImageLoaded"
            variant="elevated"
            size="small"
            :class="getChipColor(props.media?.type || '')"
            class="absolute left-2 top-2 bg-opacity-80 text-white font-bold"
          >
            {{ getMediaTypeText(props.media?.type) }}
          </VChip>
          <!-- 本地存在标识 -->
          <ExistIcon v-if="isExists && !hover.isHovering" />
          <!-- 评分角标 -->
          <VChip
            v-if="isImageLoaded && props.media?.vote_average && !(isExists && !hover.isHovering)"
            variant="elevated"
            size="small"
            :class="getChipColor('rating')"
            class="absolute right-2 top-2 bg-opacity-80 text-white font-bold"
          >
            {{ formatRating(props.media?.vote_average) }}
          </VChip>
          <!--来源图标-->
          <VAvatar
            size="24"
            density="compact"
            class="absolute bottom-1 right-1"
            tile
            v-if="!hover.isHovering && isImageLoaded && props.media?.source && !imageLoadError"
          >
            <VImg cover :src="sourceIconDict[props.media?.source]" class="shadow-lg" />
          </VAvatar>
        </VCard>
      </div>
    </template>
  </VHover>
  <!-- 订阅季弹窗 -->
  <subscribeSeasonDialog
    v-if="subscribeSeasonDialog"
    v-model="subscribeSeasonDialog"
    :media="media"
    @subscribe="subscribeSeasons"
    @close="subscribeSeasonDialog = false"
  />
  <!-- 订阅编辑弹窗 -->
  <SubscribeEditDialog
    v-if="subscribeEditDialog"
    v-model="subscribeEditDialog"
    :subid="subscribeId"
    @close="subscribeEditDialog = false"
    @save="subscribeEditDialog = false"
    @remove="onRemoveSubscribe"
  />
  <!-- 站点选择对话框 -->
  <SearchSiteDialog
    v-if="chooseSiteDialog"
    v-model="chooseSiteDialog"
    :sites="allSites"
    :selected="selectedSites"
    @search="searchSites"
    @close="chooseSiteDialog = false"
  />
</template>
<style scoped>
.media-card-title {
  font-size: 1.125rem;
  line-height: 1.25rem;
}

.media-card-overview {
  font-size: 0.875rem;
  line-height: 1rem;
}
</style>
