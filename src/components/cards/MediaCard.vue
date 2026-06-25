<script lang="ts" setup>
import noImage from '@images/no-image.jpeg'
import { getDisplayImageUrl, getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { formatRating, formatSeason } from '@/@core/utils/formatters'
import type { MediaInfo, Site, Subscribe } from '@/api/types'
import router from '@/router'
import { useUserStore, useGlobalSettingsStore } from '@/stores'
import { mediaTypeDict } from '@/api/constants'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { openSharedDialog } from '@/composables/useSharedDialog'
import {
  getMediaSubscribeId,
  getSubscribeMode,
  useMediaSubscribe,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'
import {
  getCachedMediaExistsStatus,
  getCachedMediaSubscribeStatus,
  setCachedMediaExistsStatus,
} from '@/utils/mediaStatusCache'

const SearchSiteDialog = defineAsyncComponent(() => import('@/components/dialog/SearchSiteDialog.vue'))

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
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canSearch = computed(() => hasPermission(userPermissions.value, 'search'))
const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

// 当前订阅状态
const isSubscribed = ref(false)

// 本地存在状态
const isExists = ref(false)

// 当前媒体已订阅的季号
const subscribedSeasons = ref<number[]>([])

// 当前媒体已订阅季的订阅模式
const subscribedSeasonModes = ref<SeasonSubscribeModes>({})

const subscribedSeasonsLoaded = ref(false)

const subscribedSeasonsLoading = ref(false)

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

// 打开站点选择弹窗，并把选择结果交回当前媒体卡片继续搜索。
function openSearchSiteDialog() {
  openSharedDialog(
    SearchSiteDialog,
    {
      sites: allSites.value,
      selected: selectedSites.value,
    },
    {
      search: searchSites,
    },
    { closeOn: ['close', 'search'] },
  )
}

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
    const result: { [key: string]: any } = await api.get('system/setting/public/IndexerSites')
    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获得mediaid
function getMediaId() {
  return getMediaSubscribeId(props.media)
}

function getSubscribeStatusKey(season: number | null = props.media?.season ?? null) {
  return `${getMediaId()}::${season ?? 'all'}`
}

function getExistsStatusKey() {
  return [
    props.media?.tmdb_id ?? '',
    props.media?.title ?? '',
    props.media?.year ?? '',
    props.media?.season ?? '',
    props.media?.type ?? '',
    props.media?.mediaid_prefix ?? '',
    props.media?.media_id ?? '',
  ].join('::')
}

const subscribedSeasonText = computed(() => {
  if (props.media?.type !== '电视剧') return ''
  if (subscribedSeasonsLoading.value) return t('common.loadingText')
  if (!subscribedSeasons.value.length) return t('media.status.subscribed')

  return subscribedSeasons.value.map(season => formatSeason(season.toString())).join('、')
})

function isSameSubscribeMedia(subscribe: Subscribe) {
  if (props.media?.tmdb_id && subscribe.tmdbid) return props.media.tmdb_id === subscribe.tmdbid
  if (props.media?.douban_id && subscribe.doubanid) return props.media.douban_id === subscribe.doubanid
  if (props.media?.bangumi_id && subscribe.bangumiid) return props.media.bangumi_id === subscribe.bangumiid

  const mediaId = props.media?.media_id ? `${props.media.mediaid_prefix}:${props.media.media_id}` : ''
  return Boolean(mediaId && subscribe.mediaid === mediaId)
}

// 角标颜色
function getChipColor(type: string) {
  if (type === '电影') return 'border-blue-500 bg-blue-600'
  else if (type === '电视剧') return ' bg-indigo-500 border-indigo-600'
  else return 'border-purple-600 bg-purple-600'
}

// 查询当前媒体是否已订阅
async function handleCheckSubscribe() {
  try {
    const subscribed = await getCachedMediaSubscribeStatus(getSubscribeStatusKey(props.media?.season ?? null), () =>
      checkSubscribe(props.media?.season ?? null),
    )
    isSubscribed.value = subscribed
  } catch (error) {
    console.error(error)
  }
}

async function querySubscribedSeasons() {
  if (props.media?.type !== '电视剧' || !isSubscribed.value || subscribedSeasonsLoaded.value || subscribedSeasonsLoading.value) {
    return
  }

  subscribedSeasonsLoading.value = true
  try {
    const subscribes: Subscribe[] = await api.get('subscribe/')
    const mediaSubscribes = subscribes.filter(
      item => item.type === '电视剧' && item.season !== undefined && isSameSubscribeMedia(item),
    )

    subscribedSeasons.value = mediaSubscribes.map(item => item.season as number).sort((a, b) => a - b)
    subscribedSeasonModes.value = mediaSubscribes.reduce<SeasonSubscribeModes>((modes, item) => {
      if (item.season !== undefined) modes[item.season] = getSubscribeMode(item)
      return modes
    }, {})
    subscribedSeasonsLoaded.value = true
  } catch (error) {
    console.error(error)
  } finally {
    subscribedSeasonsLoading.value = false
  }
}

// 查询当前媒体是否已入库
async function handleCheckExists() {
  try {
    const exists = await getCachedMediaExistsStatus(getExistsStatusKey(), async () => {
      const result: { [key: string]: any } = await api.get('mediaserver/exists', {
        params: {
          tmdbid: props.media?.tmdb_id,
          title: props.media?.title,
          year: props.media?.year,
          season: props.media?.season,
          mtype: props.media?.type,
        },
      })

      return Boolean(result.success)
    })

    isExists.value = exists
    setCachedMediaExistsStatus(getExistsStatusKey(), exists)
  } catch (error) {
    console.error(error)
  }
}

// 调用API检查是否已订阅，电视剧需要指定季
async function checkSubscribe(season: number | null) {
  return subscribeActions.checkSubscribe(season)
}

// 爱心订阅按钮响应
async function handleSubscribe() {
  await querySubscribedSeasons()
  subscribeActions.handleSubscribe()
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
    openSearchSiteDialog()
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
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 获取媒体类型文本
function getMediaTypeText(type: string | undefined) {
  if (!type) return ''
  return mediaTypeDict[type]
}

const subscribeActions = useMediaSubscribe({
  media: () => props.media,
  canSubscribe: () => canSubscribe.value,
  isSubscribed,
  isExists: () => isExists.value,
  subscribedSeasons,
  subscribedSeasonModes,
  primarySeason: () => props.media?.season ?? null,
  getSubscribeStatusKey,
})

watch(isSubscribed, subscribed => {
  subscribedSeasonsLoaded.value = false
  if (!subscribed) {
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
  }
})

watch(
  () => props.media,
  () => {
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
    subscribedSeasonsLoaded.value = false
  },
)

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
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div
        ref="mediaCardRef"
        v-bind="hover.props"
        class="media-card-hover-area"
        @mouseenter="querySubscribedSeasons"
      >
        <VCard
          :height="props.height"
          :width="props.width"
          class="app-hover-lift-card outline-none ring-gray-500 media-card"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering,
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
            <div v-if="isSubscribed" class="media-card-subscribe-summary mb-2">
              <VIcon icon="mdi-heart" color="error" size="small" />
              <span>
                {{ props.media?.type === '电视剧' ? subscribedSeasonText : t('media.status.subscribed') }}
              </span>
            </div>
            <div v-if="props.media?.collection_id" class="mb-3" @click.stop=""></div>
            <div v-else class="flex align-center justify-between">
              <IconBtn
                v-if="canSearch"
                icon="mdi-magnify"
                color="white"
                size="small"
                @click.stop="clickSearch"
              />
              <VSpacer />
              <IconBtn
                v-if="canSubscribe"
                :icon="isSubscribed ? 'mdi-heart' : 'mdi-heart-outline'"
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
            variant="plain"
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
</template>
<style scoped>
.media-card-hover-area {
  width: 100%;
}

.media-card-title {
  font-size: 1.125rem;
  line-height: 1.25rem;
}

.media-card-overview {
  font-size: 0.875rem;
  line-height: 1rem;
}

.media-card-subscribe-summary {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-block-size: 1.25rem;
  color: white;
  font-size: 0.75rem;
  line-height: 1rem;
}

.media-card-subscribe-summary span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
