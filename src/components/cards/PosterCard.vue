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

/** 按媒体类型选择海报角标颜色。 */
function getChipColor(type: string) {
  if (type === '电影') return 'border-blue-500 bg-blue-600'
  else if (type === '电视剧') return ' bg-indigo-500 border-indigo-600'
  else return 'border-purple-600 bg-purple-600'
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
          class="app-hover-lift-card outline-none ring-gray-500"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering && !nativeChromeActive,
            'ring-1': isImageLoaded,
          }"
        >
          <!-- 媒体服务器缩略图统一采用匿名 CORS，由浏览器按代理响应头复用 HTTP 缓存。 -->
          <VImg
            aspect-ratio="2/3"
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
            variant="elevated"
            size="small"
            :class="getChipColor(props.media?.type || '')"
            class="poster-card-chip absolute left-2 top-2 bg-opacity-80 text-white font-bold"
          >
            {{ props.media?.type }}
          </VChip>
          <!-- 详情 -->
          <VCardText
            v-show="hover.isHovering || imageLoadError"
            class="w-full h-full flex flex-col flex-wrap justify-end align-left text-white absolute bottom-0 cursor-pointer pa-2 pb-5"
            style="background: linear-gradient(rgba(45, 55, 72, 40%) 0%, rgba(45, 55, 72, 90%) 100%)"
            @click.stop="goPlay(hover.isHovering)"
          >
            <span class="font-semibold text-sm">{{ props.media?.subtitle }}</span>
            <h1 class="mb-1 text-white font-bold text-lg line-clamp-2 overflow-hidden text-ellipsis ...">
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

@media (prefers-reduced-motion: reduce) {
  .poster-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
