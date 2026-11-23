<script lang="ts" setup>
import type { PropType } from 'vue'
import type { MediaServerPlayItem } from '@/api/types'
import noImage from '@images/no-image.jpeg'
import { openMediaServerItem } from '@/utils/appDeepLink'
import { vNativeCardMenu } from '@/native/card'
import { nativeChromeActive } from '@/native/layout'
import { createNativeDashboardMediaCardMenu } from '@/utils/nativeDashboardMediaCard'
import { useGlobalSettingsStore } from '@/stores'
import { getProxyImageUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'

// 输入参数
const props = defineProps({
  media: Object as PropType<MediaServerPlayItem>,
  server: String,
  width: String,
  height: String,
})
const globalSettingsStore = useGlobalSettingsStore()
const { t } = useI18n()

// 图片加载状态
const isImageLoaded = ref(false)

// 图片加载失败
const imageLoadError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '2 / 3',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

/** 按媒体类型返回海报角标的语义修饰类。 */
function getChipColor(type: string) {
  if (type === '电影') return 'poster-card-chip--movie'
  else if (type === '电视剧') return 'poster-card-chip--tv'
  else return 'poster-card-chip--other'
}

// 计算图片地址
const getImgUrl = computed(() => {
  if (imageLoadError.value) return noImage
  const image = props.media?.image || ''
  return getProxyImageUrl(image, {
    useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
    useCookies: props.media?.use_cookies,
    maxWidth: 500,
    quality: 80,
  })
})

/** 用户在海报操作层点击时打开对应媒体服务器条目。 */
async function goPlay(isHovering: boolean | null = false) {
  if (props.media && isHovering) {
    await openMediaServerItem(props.media)
  }
}

/** App 长按菜单仅提供当前媒体的本地播放与原媒体服务器打开入口。 */
const nativeCardMenu = computed(() =>
  createNativeDashboardMediaCardMenu(
    () => props.media,
    () => props.server,
    {
      play: t('file.play'),
      mediaServer: t('notificationSwitch.mediaServer'),
      openInServer: server => t('dashboard.openInServer', { server }),
    },
  ),
)
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Web 的 Hover 命中区域保持静止；App 不上浮卡片，避免位置变化撤销原生长按菜单。 -->
      <div v-bind="hover.props" class="poster-card-hover-area">
        <VCard
          v-native-card-menu="nativeCardMenu"
          :style="cardStyle"
          :role="nativeChromeActive ? 'group' : undefined"
          :aria-label="nativeChromeActive ? props.media?.title : undefined"
          :data-glass-optical-mode="isImageLoaded && !imageLoadError ? 'excluded' : undefined"
          class="poster-card app-hover-lift-card outline-none"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering && !nativeChromeActive,
            'poster-card--loaded': isImageLoaded,
          }"
        >
          <!-- 媒体服务器缩略图统一采用匿名 CORS，由浏览器按代理响应头复用 HTTP 缓存。 -->
          <VImg
            :aspect-ratio="2 / 3"
            :src="getImgUrl"
            crossorigin="anonymous"
            class="poster-card-image object-cover aspect-w-2 aspect-h-3"
            :class="{ 'poster-card-image--loaded': isImageLoaded }"
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
          <!-- 类型角标 -->
          <VChip
            v-show="isImageLoaded"
            variant="flat"
            size="small"
            :class="getChipColor(props.media?.type || '')"
            class="poster-card-chip absolute left-2 top-2"
          >
            {{ props.media?.type }}
          </VChip>
          <!-- 详情 -->
          <VCardText
            v-show="hover.isHovering || imageLoadError"
            class="poster-card-detail w-full h-full flex flex-col flex-wrap justify-end align-left absolute bottom-0 cursor-pointer pa-2 pb-5"
            @click.stop="goPlay(hover.isHovering)"
          >
            <span class="poster-card-subtitle">{{ props.media?.subtitle }}</span>
            <h1 class="poster-card-title mb-1 line-clamp-2 overflow-hidden text-ellipsis">
              {{ props.media?.title }}
            </h1>
          </VCardText>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.poster-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card--loaded {
  border: 1px solid var(--mp-border);
}

.poster-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.poster-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.poster-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

.poster-card-image :deep(.v-responsive__sizer) {
  padding-bottom: 150%;
}

.poster-card-chip {
  border: 1px solid rgba(248, 250, 252, 0.22);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
  color: var(--mp-on-media) !important;
  font-size: 0.75rem;
  font-weight: 600;
}

.poster-card-chip--movie {
  background: rgba(37, 99, 235, 0.78) !important;
}

.poster-card-chip--tv {
  background: rgba(79, 70, 229, 0.78) !important;
}

.poster-card-chip--other {
  background: rgba(15, 23, 42, 0.72) !important;
}

.poster-card-detail {
  background: linear-gradient(
    180deg,
    rgba(11, 19, 34, 0.36) 0%,
    rgba(11, 19, 34, 0.74) 50%,
    rgba(11, 19, 34, 0.94) 100%
  );
  color: var(--mp-on-media);
}

.poster-card-subtitle {
  color: var(--mp-on-media-muted);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.3;
}

.poster-card-title {
  color: var(--mp-on-media);
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.3;
}

@media (prefers-reduced-motion: reduce) {
  .poster-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
