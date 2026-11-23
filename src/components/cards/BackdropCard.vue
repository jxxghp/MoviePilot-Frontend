<script lang="ts" setup>
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

// 图片是否加载完成
const imageLoaded = ref(false)
const imageLoadError = ref(false)

const cardStyle = computed(() => ({
  aspectRatio: props.height ? undefined : '3 / 2',
  blockSize: props.height,
  inlineSize: props.width || '100%',
}))

/** 标记背景图已经可以展示。 */
function imageLoadHandler() {
  imageLoaded.value = true
}

/** 加载失败后切换到本地占位图片。 */
function imageErrorHandler() {
  imageLoadError.value = true
}

/** 在卡片操作层打开对应媒体服务器条目。 */
async function goPlay() {
  if (props.media) {
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

// 计算图片地址
const getImgUrl = computed(() => {
  const image = props.media?.image || ''
  if (!image || imageLoadError.value) return noImage
  return getProxyImageUrl(image, {
    useCache: globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE,
    useCookies: props.media?.use_cookies,
    maxWidth: 1280,
    quality: 80,
  })
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <!-- Web 的 Hover 命中区域保持静止；App 不上浮卡片，避免位置变化撤销原生长按菜单。 -->
      <div v-bind="hover.props" class="backdrop-card-hover-area">
        <VCard
          v-native-card-menu="nativeCardMenu"
          :style="cardStyle"
          :role="nativeChromeActive ? 'group' : undefined"
          :aria-label="nativeChromeActive ? props.media?.title : undefined"
          :data-glass-optical-mode="
            Boolean(props.media?.image) && imageLoaded && !imageLoadError ? 'excluded' : undefined
          "
          class="backdrop-card app-hover-lift-card"
          :class="{
            'app-hover-lift-card--hovering': hover.isHovering && !nativeChromeActive,
            'backdrop-card--loaded': imageLoaded,
          }"
          @click="goPlay"
        >
          <template #image>
            <VImg
              :src="getImgUrl"
              :aspect-ratio="3 / 2"
              class="backdrop-card-image"
              :class="{ 'backdrop-card-image--loaded': imageLoaded }"
              cover
              @load="imageLoadHandler"
              @error="imageErrorHandler"
            >
              <template #placeholder>
                <div class="backdrop-card-placeholder">
                  <VSkeletonLoader class="backdrop-card-skeleton" />
                </div>
              </template>
              <template #default>
                <VCardText
                  class="backdrop-card-overlay w-full flex flex-col flex-wrap justify-end align-left absolute bottom-0 cursor-pointer pa-3"
                >
                  <h1 class="backdrop-card-title mb-1 line-clamp-2 overflow-hidden text-ellipsis">
                    {{ props.media?.title }}
                  </h1>
                  <span class="backdrop-card-subtitle">{{ props.media?.subtitle }}</span>
                </VCardText>
              </template>
            </VImg>
          </template>
          <div class="w-full absolute bottom-0">
            <VProgressLinear
              v-if="props.media?.percent"
              :model-value="props.media?.percent"
              bg-color="success"
              color="success"
            />
          </div>
        </VCard>
      </div>
    </template>
  </VHover>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.backdrop-card-hover-area {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card--loaded {
  border: 1px solid var(--mp-border);
}

.backdrop-card-image {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card-overlay {
  background: var(--mp-media-scrim);
  color: var(--mp-on-media);
  padding-block-start: 2rem;
}

.backdrop-card-title {
  color: var(--mp-on-media);
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.3;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
}

.backdrop-card-subtitle {
  color: var(--mp-on-media-muted);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.3;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
}

.backdrop-card-placeholder,
.backdrop-card-skeleton {
  block-size: 100%;
  inline-size: 100%;
}

.backdrop-card-image :deep(.v-img__img) {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.backdrop-card-image--loaded :deep(.v-img__img) {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .backdrop-card-image :deep(.v-img__img) {
    transition: none;
  }
}
</style>
