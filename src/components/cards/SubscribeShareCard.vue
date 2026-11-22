<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'
import router from '@/router'
import { useGlobalSettingsStore } from '@/stores'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { getDisplayImageUrl } from '@/utils/imageUtils'

const ForkSubscribeDialog = defineAsyncComponent(() => import('../dialog/ForkSubscribeDialog.vue'))
const SubscribeEditDialog = defineAsyncComponent(() => import('../dialog/SubscribeEditDialog.vue'))

// 输入参数
const props = defineProps({
  media: Object as PropType<SubscribeShare>,
})

// 定义删除事件
const emit = defineEmits(['delete'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 背景图与竖版海报的加载状态
const imageLoaded = ref(false)
const backdropLoadError = ref(false)
const posterLoadError = ref(false)

watch([() => props.media?.id, () => props.media?.backdrop, () => props.media?.poster], () => {
  imageLoaded.value = false
  backdropLoadError.value = false
  posterLoadError.value = false
})

// 图片加载完成响应
function imageLoadHandler() {
  imageLoaded.value = true
}

// 背景图加载失败后展示深色媒体底板与正文
function backdropErrorHandler() {
  backdropLoadError.value = true
  imageLoaded.value = true
}

// 海报加载失败后收起海报框，避免留下空白灰块
function posterErrorHandler() {
  posterLoadError.value = true
}

// 分享相对时间
const dateText = computed(() => (props.media?.date ? formatDateDifference(props.media.date) : ''))

// 计算背景图地址（缺失时回退到海报）
const backdropUrl = computed(() => {
  if (backdropLoadError.value) return ''
  const url = props.media?.backdrop || props.media?.poster
  if (!url) return ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 计算海报图片地址
const posterUrl = computed(() => {
  if (posterLoadError.value) return ''
  const url = props.media?.poster
  if (!url) return ''
  return getDisplayImageUrl(url, globalSettings.GLOBAL_IMAGE_CACHE)
})

// 背景就绪且海报地址有效时才挂载海报框
const showPoster = computed(() => imageLoaded.value && Boolean(posterUrl.value) && !posterLoadError.value)

// 获取分享订阅的统一媒体身份
function getMediaId() {
  if (!props.media?.media_source || !props.media.media_id) return undefined
  return { mediaSource: props.media.media_source, mediaId: String(props.media.media_id) }
}

// 查看媒体详情
async function viewMediaDetail() {
  const identity = getMediaId()
  if (!identity) return
  router.push({
    path: '/media',
    query: {
      media_source: identity.mediaSource,
      media_id: identity.mediaId,
      title: props.media?.name,
      year: props.media?.year,
      type: props.media?.type,
    },
  })
}

// 复用订阅
function showForkSubscribe() {
  openSharedDialog(
    ForkSubscribeDialog,
    { media: props.media },
    {
      fork: finishForkSubscribe,
      delete: doDelete,
    },
    { closeOn: ['close', 'fork', 'delete'] },
  )
}

// 完成复用订阅
function finishForkSubscribe(subid: number) {
  openSharedDialog(SubscribeEditDialog, { subid }, {}, { closeOn: ['close', 'save', 'remove'] })
}

// 删除订阅分享时处理
function doDelete() {
  // 通知父组件刷新
  emit('delete')
}
</script>

<template>
  <div class="h-full">
    <VHover>
      <template #default="hover">
        <!-- Hover 命中区域保持静止，避免卡片上浮后底边反复触发 mouseleave -->
        <div v-bind="hover.props" class="subscribe-share-card-hover-area w-full h-full">
          <div
            class="subscribe-share-card-shell app-hover-lift-card w-full h-full"
            :class="{
              'app-hover-lift-card--hovering': hover.isHovering,
            }"
          >
            <VCard
              :key="props.media?.id"
              class="subscribe-share-card no-blur flex flex-col h-full overflow-hidden"
              min-height="150"
              @click="showForkSubscribe"
            >
              <template #image>
                <div class="subscribe-share-card__base" />
                <VImg
                  v-if="backdropUrl"
                  :src="backdropUrl"
                  :aspect-ratio="3 / 2"
                  cover
                  position="top"
                  @load="imageLoadHandler"
                  @error="backdropErrorHandler"
                />
                <div class="subscribe-share-card__scrim" />
              </template>
              <div class="subscribe-share-card__content relative z-10 flex h-full flex-col">
                <VCardText class="subscribe-share-card__body flex flex-1 items-center">
                  <div
                    v-if="showPoster"
                    class="subscribe-share-card__poster w-14 flex-shrink-0 overflow-hidden cursor-pointer"
                    @click.stop="viewMediaDetail"
                  >
                    <VImg :src="posterUrl" :aspect-ratio="2 / 3" cover @error="posterErrorHandler" />
                  </div>
                  <div class="min-w-0 flex-1 flex flex-col justify-center" :class="{ 'pl-3': showPoster }">
                    <div class="subscribe-share-card__title line-clamp-2 overflow-hidden text-ellipsis">
                      {{ props.media?.share_title }}
                    </div>
                    <div
                      v-if="props.media?.share_comment"
                      class="subscribe-share-card__comment mt-1 line-clamp-2 overflow-hidden text-ellipsis"
                    >
                      {{ props.media?.share_comment }}
                    </div>
                  </div>
                </VCardText>
                <div class="subscribe-share-card__footer">
                  <div class="subscribe-share-card__user min-w-0 flex-1 flex items-center gap-1.5">
                    <VIcon icon="mdi-account-circle-outline" size="15" class="shrink-0" />
                    <span class="truncate text-xs font-medium">{{ props.media?.share_user }}</span>
                  </div>
                  <div class="subscribe-share-card__stats num shrink-0 flex items-center gap-2.5 text-xs">
                    <span v-if="props.media?.count" class="inline-flex items-center gap-1">
                      <VIcon icon="mdi-fire" size="14" color="warning" />
                      {{ props.media.count.toLocaleString() }}
                    </span>
                    <span v-if="dateText" class="inline-flex items-center gap-1">
                      <VIcon icon="mdi-calendar-blank-outline" size="13" />
                      {{ dateText }}
                    </span>
                  </div>
                </div>
              </div>
            </VCard>
          </div>
        </div>
      </template>
    </VHover>
  </div>
</template>

<style lang="scss" scoped>
.subscribe-share-card-hover-area {
  inline-size: 100%;
}

.subscribe-share-card-shell {
  border-radius: var(--app-surface-radius);
}

.subscribe-share-card {
  border: var(--app-card-light-border);
}

// 深色媒体底板保证背景图未就绪或失效时浅色主题下文字依然清晰
.subscribe-share-card__base {
  position: absolute;
  background: linear-gradient(145deg, #182235 0%, #0f172a 100%);
  inset: 0;
}

// 顶部轻压暗配合全局媒体遮罩，确保明亮动漫或剧照底图上的标题与简介锐利可读
.subscribe-share-card__scrim {
  position: absolute;
  background:
    linear-gradient(180deg, rgba(11, 19, 34, 0.38) 0%, rgba(11, 19, 34, 0.16) 45%, transparent 75%),
    var(--mp-media-scrim);
  inset: 0;
  pointer-events: none;
}

.subscribe-share-card__body {
  padding: 0.75rem 0.875rem 0.375rem !important;
}

.subscribe-share-card__poster {
  aspect-ratio: 2 / 3;
  border-radius: calc(var(--app-control-radius, 12px) * 0.75);
  background: rgba(11, 19, 34, 0.45);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.16),
    0 6px 14px rgba(0, 0, 0, 0.42);
}

.subscribe-share-card__title {
  color: var(--mp-on-media, #f8fafc);
  font-size: 1.03125rem;
  font-weight: 600;
  line-height: 1.35;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.48);
}

.subscribe-share-card__comment {
  color: var(--mp-on-media-muted, rgba(248, 250, 252, 0.78));
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.45;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.42);
}

.subscribe-share-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.625rem;
  padding: 0.5rem 0.875rem 0.625rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.subscribe-share-card__user {
  color: var(--mp-on-media, #f8fafc);
}

.subscribe-share-card__stats {
  color: var(--mp-on-media-muted, rgba(248, 250, 252, 0.78));
}
</style>
