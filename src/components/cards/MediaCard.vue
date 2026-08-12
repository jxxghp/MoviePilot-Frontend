<script lang="ts">
import { ref } from 'vue'

const activeTouchMediaCardId = ref<number | null>(null)
let mediaCardIdSeed = 0
</script>

<script lang="ts" setup>
import { getDisplayImageUrl, getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { formatRating } from '@/@core/utils/formatters'
import type { MediaInfo, Site, Subscribe } from '@/api/types'
import router from '@/router'
import { useUserStore, useGlobalSettingsStore } from '@/stores'
import { mediaTypeDict } from '@/api/constants'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { openSharedDialog } from '@/composables/useSharedDialog'
import {
  getMediaSubscribeId,
  getMediaSubscribeIdentity,
  getSubscribeMode,
  useMediaSubscribe,
  type SeasonSubscribeModes,
} from '@/composables/useMediaSubscribe'
import {
  getCachedMediaExistsStatus,
  getCachedMediaSubscribeStatus,
  setCachedMediaExistsStatus,
} from '@/utils/mediaStatusCache'
import { buildMusicDetailRoute, getMusicKey } from '@/utils/music'

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

// 图片请求代际隔离复用卡片的迟到事件，避免旧海报改变新媒体的 renderer 资格。
const imageRequestRevision = ref(0)

// renderer 只能在真实海报完成可见淡入后退出，资源 load 本身不代表像素已完全覆盖卡片。
const hasCompletedPosterReveal = ref(false)
const POSTER_REVEAL_FALLBACK_MS = 400
let posterRevealFallbackTimer: number | null = null

/** 清理当前海报的视觉覆盖状态与兜底提交。 */
function resetPosterRevealState() {
  hasCompletedPosterReveal.value = false
  if (posterRevealFallbackTimer === null) return

  window.clearTimeout(posterRevealFallbackTimer)
  posterRevealFallbackTimer = null
}

/** 仅允许当前真实海报请求完成 renderer 排除提交。 */
function completePosterReveal(revision: number, usesFallback: boolean) {
  if (revision !== imageRequestRevision.value || usesFallback) return

  if (posterRevealFallbackTimer !== null) {
    window.clearTimeout(posterRevealFallbackTimer)
    posterRevealFallbackTimer = null
  }
  hasCompletedPosterReveal.value = true
}

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

const musicSourceIconDict: Record<string, { color: string; icon: string }> = {
  musicbrainz: { color: '#eb743b', icon: 'mdi-music-circle' },
  theaudiodb: { color: '#35a7a0', icon: 'mdi-music-box-multiple' },
  doubanmusic: { color: '#00b51d', icon: 'mdi-music-circle' },
}

// 媒体卡片只消费后端统一的主来源字段。
const mediaSource = computed(() => props.media?.media_source)

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

const mediaCardId = ++mediaCardIdSeed

// 粗指针设备使用点击展开详情，避免 iOS 返回后沿用 VHover 的触摸态。
const isTouchLikePointer = ref(
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: none), (pointer: coarse)').matches),
)

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

// 查询与当前媒体类型兼容的站点
async function querySites() {
  try {
    const mediaType = props.media?.type === '电视剧' ? 'tv' : props.media?.type === '音乐' ? 'music' : 'movie'
    const data: Site[] = await api.get(`site/media/${mediaType}`)

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result = await api.get<{ value?: number[] }>('system/setting/public/IndexerSites')
    selectedSites.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获取当前卡片的统一媒体身份缓存键
function getMediaId() {
  return getMediaSubscribeId(props.media)
}

function getSubscribeStatusKey(season: number | null = props.media?.season ?? null) {
  const identity = props.media?.type === '音乐' ? getMusicKey(props.media) : getMediaId()
  return `${identity}::${season ?? 'all'}`
}

function getExistsStatusKey() {
  const identity = getMediaSubscribeIdentity(props.media)
  return [
    identity?.source ?? '',
    identity?.mediaId ?? '',
    props.media?.title ?? '',
    props.media?.year ?? '',
    props.media?.season ?? '',
    props.media?.type ?? '',
  ].join('::')
}

function isSameSubscribeMedia(subscribe: Subscribe) {
  if (props.media?.type === '音乐') {
    const expectedMusicType = props.media.music_type ?? 'recording'
    const subscribeMusicType = subscribe.music_type ?? 'recording'
    if (subscribeMusicType !== expectedMusicType) return false
  }
  const identity = getMediaSubscribeIdentity(props.media)
  return Boolean(
    identity && subscribe.media_source === identity.source && String(subscribe.media_id || '') === identity.mediaId,
  )
}

// 角标颜色
function getChipColor(type: string) {
  if (type === '电影') return 'border-blue-500 bg-blue-600'
  else if (type === '电视剧') return ' bg-indigo-500 border-indigo-600'
  else if (type === '音乐') return 'border-pink-500 bg-pink-600'
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
  if (
    props.media?.type !== '电视剧' ||
    !isSubscribed.value ||
    subscribedSeasonsLoaded.value ||
    subscribedSeasonsLoading.value
  ) {
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
  if (props.media?.type === '音乐') return
  try {
    const exists = await getCachedMediaExistsStatus(getExistsStatusKey(), async () => {
      const identity = getMediaSubscribeIdentity(props.media)
      const result = await api.get<{ item?: { id?: string } }>('mediaserver/exists', {
        feedback: 'silent',
        params: {
          ...(identity ? { media_source: identity.source, media_id: identity.mediaId } : {}),
          title: props.media?.title,
          year: props.media?.year,
          season: props.media?.season,
          mtype: props.media?.type,
        },
      })

      return Boolean(result.item?.id)
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
    resetMediaCardDetailState()

    if (props.media?.type === '音乐') {
      router.push(buildMusicDetailRoute(props.media))
    } else if (props.media?.collection_id) {
      // 跳转到合集列表
      router.push({
        path: `/browse/tmdb/collection/${props.media?.collection_id}`,
        query: {
          title: props.media?.title,
        },
      })
    } else {
      const identity = getMediaSubscribeIdentity(props.media)
      if (!identity) return
      // 跳转到媒体详情页
      router.push({
        path: '/media',
        query: {
          media_source: identity.source,
          media_id: identity.mediaId,
          title: props.media?.title,
          year: props.media?.year,
          type: props.media?.type,
        },
      })
    }
  }
}

// 当前卡片是否进入可操作详情态，桌面使用 hover，触摸端使用显式点击态。
function isMediaCardActive(isHovering: boolean | null | undefined) {
  return activeTouchMediaCardId.value === mediaCardId || (!isTouchLikePointer.value && Boolean(isHovering))
}

// 当前卡片详情层是否显示，保留图片错误和站点选择时的强制显示。
function isMediaCardDetailVisible(isHovering: boolean | null | undefined) {
  return isMediaCardActive(isHovering) || imageLoadError.value || searchMenuShow.value
}

// 清理移动端详情层展开态，避免路由返回后继续显示上一次的详情层。
function resetMediaCardDetailState() {
  if (activeTouchMediaCardId.value === mediaCardId) {
    activeTouchMediaCardId.value = null
  }
}

// 处理媒体卡片点击：触摸端第一次点击展开，展开后再次点击进入详情。
function handleMediaCardClick(isHovering: boolean | null | undefined) {
  if (isTouchLikePointer.value && !isMediaCardDetailVisible(isHovering)) {
    activeTouchMediaCardId.value = mediaCardId
    querySubscribedSeasons()
    return
  }

  goMediaDetail(isMediaCardActive(isHovering) || isMediaCardDetailVisible(isHovering))
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!isTouchLikePointer.value || activeTouchMediaCardId.value !== mediaCardId) return
  if (!(event.target instanceof Node)) return
  if (mediaCardRef.value?.contains(event.target)) return

  resetMediaCardDetailState()
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
  const identity = getMediaSubscribeIdentity(props.media)
  if (!identity) return
  router.push({
    path: '/resource',
    query: {
      media_source: identity.source,
      media_id: identity.mediaId,
      type: props.media?.type,
      area: 'title',
      title: props.media?.title,
      year: props.media?.year,
      season: props.media?.season,
      ...(props.media?.type === '音乐' ? { music_type: props.media.music_type ?? 'recording' } : {}),
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

// 媒体占位图标：电影/电视剧/音乐各自使用对应图标，缺失封面时统一渲染图标 + 底色占位
const placeholderIcon = computed(() => {
  switch (props.media?.type) {
    case '音乐':
      return 'mdi-album'
    case '电视剧':
      return 'mdi-television-classic'
    case '电影':
    default:
      return 'mdi-movie-open-outline'
  }
})

// 计算图片地址
const getImgUrl: Ref<string> = computed(() => {
  if (imageLoadError.value) return ''
  if (props.media?.type === '音乐') {
    // 音乐封面优先使用 cover_url（ListenBrainz/MusicBrainz 统计接口返回），回退到 poster_path
    const musicCover = props.media?.cover_url || props.media?.poster_path
    if (!musicCover) return ''
    return getDisplayImageUrl(musicCover, globalSettings.GLOBAL_IMAGE_CACHE)
  }
  const url = props.media?.poster_path?.replace('original', 'w500')
  if (!url) return ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

const hasLoadedRealPoster = computed(
  () => Boolean(getImgUrl.value) && isImageLoaded.value && hasCompletedPosterReveal.value && !imageLoadError.value,
)

/** 为当前图片实例绑定不可跨媒体复用的成功与失败回调。 */
const imageRequest = computed(() => {
  const revision = imageRequestRevision.value
  const src = getImgUrl.value
  const usesFallback = !src

  return {
    handleError: () => {
      if (revision !== imageRequestRevision.value || usesFallback) return

      resetPosterRevealState()
      isImageLoaded.value = false
      imageLoadError.value = true
      imageRequestRevision.value += 1
    },
    handleLoad: () => {
      if (revision !== imageRequestRevision.value) return

      resetPosterRevealState()
      isImageLoaded.value = true
      if (!usesFallback) {
        posterRevealFallbackTimer = window.setTimeout(
          () => completePosterReveal(revision, usesFallback),
          POSTER_REVEAL_FALLBACK_MS,
        )
      }
    },
    handleReveal: (event: TransitionEvent) => {
      if (
        event.propertyName !== 'opacity' ||
        !(event.target instanceof Element) ||
        !event.target.matches('.v-img__img')
      ) {
        return
      }

      completePosterReveal(revision, usesFallback)
    },
    key: revision,
    src,
  }
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
  [() => props.media, () => props.media?.poster_path, () => props.media?.cover_url],
  ([media], [previousMedia]) => {
    imageRequestRevision.value += 1
    resetPosterRevealState()
    isImageLoaded.value = false
    imageLoadError.value = false
    // 海报补全只重置图片代际；详情和订阅状态绑定媒体对象身份。
    if (media === previousMedia) return

    resetMediaCardDetailState()
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
    subscribedSeasonsLoaded.value = false
  },
  { flush: 'sync' },
)

onMounted(() => {
  setupIntersectionObserver()
  if (isTouchLikePointer.value) {
    document.addEventListener('pointerdown', handleDocumentPointerDown)
  }
})

onActivated(resetMediaCardDetailState)
onDeactivated(resetMediaCardDetailState)

onBeforeUnmount(() => {
  resetPosterRevealState()
  resetMediaCardDetailState()
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  observer.value?.disconnect()
  observer.value = null
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave。 -->
      <div ref="mediaCardRef" v-bind="hover.props" class="media-card-hover-area" @mouseenter="querySubscribedSeasons">
        <VCard
          :height="props.height"
          :width="props.width"
          :ripple="false"
          :data-glass-optical-mode="hasLoadedRealPoster ? 'excluded' : undefined"
          class="app-hover-lift-card outline-none ring-gray-500 media-card"
          :class="{
            'app-hover-lift-card--hovering': isMediaCardActive(hover.isHovering),
            'media-card--image-loaded': isImageLoaded,
            'ring-1': isImageLoaded,
          }"
          @click.stop="handleMediaCardClick(hover.isHovering)"
        >
          <div v-if="!getImgUrl" class="media-card-placeholder d-flex align-center justify-center">
            <VIcon :icon="placeholderIcon" size="64" color="medium-emphasis" />
          </div>
          <VImg
            :key="imageRequest.key"
            v-else
            aspect-ratio="2/3"
            :src="imageRequest.src"
            class="object-cover aspect-w-2 aspect-h-3"
            cover
            @load="imageRequest.handleLoad"
            @error="imageRequest.handleError"
            @transitionend="imageRequest.handleReveal"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
          </VImg>

          <!-- 详情 -->
          <VCardText
            v-show="isMediaCardDetailVisible(hover.isHovering)"
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
              <IconBtn v-if="canSearch" icon="mdi-magnify" color="white" size="small" @click.stop="clickSearch" />
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
          <ExistIcon v-if="isExists && !isMediaCardActive(hover.isHovering)" />
          <!-- 评分角标 -->
          <VChip
            v-if="isImageLoaded && props.media?.vote_average && !(isExists && !isMediaCardActive(hover.isHovering))"
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
            v-if="!isMediaCardActive(hover.isHovering) && isImageLoaded && mediaSource && !imageLoadError"
          >
            <VIcon v-if="mediaSource === 'anilist'" color="#02a9ff" icon="mdi-alpha-a-circle" size="24" />
            <VIcon
              v-else-if="musicSourceIconDict[mediaSource]"
              :color="musicSourceIconDict[mediaSource].color"
              :icon="musicSourceIconDict[mediaSource].icon"
              size="24"
            />
            <VImg v-else cover :src="sourceIconDict[mediaSource]" class="shadow-lg" />
          </VAvatar>
        </VCard>
      </div>
    </template>
  </VHover>
</template>
<style scoped>
.media-card-hover-area {
  inline-size: 100%;
}

.media-card-placeholder {
  aspect-ratio: 2 / 3;
  background: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 100%;
  inline-size: 100%;
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
  color: white;
  font-size: 0.75rem;
  gap: 0.25rem;
  line-height: 1rem;
  min-block-size: 1.25rem;
}

.media-card-subscribe-summary span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
