<script lang="ts" setup>
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useTheme } from 'vuetify'

// 音乐详情体系（单曲、专辑、艺术家）共用的头部与背景布局
const props = defineProps({
  // 封面或艺术家图片
  cover: String,
  // 主标题
  title: String,
  // 头部下方的属性文本，例如类型、发行日期、时长
  attributes: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  // 图片按圆形展示，用于艺术家头像
  rounded: {
    type: Boolean,
    default: false,
  },
})

const theme = useTheme()
const globalSettingsStore = useGlobalSettingsStore()

// 透明与毛玻璃主题下背景图需要改用遮罩淡出，与影视详情页保持一致
const isTransparentTheme = computed(() => theme.name.value === 'transparent')
const isGlassTheme = computed(() => theme.name.value === 'glass')

// 封面加载失败后回退到占位图标
const imageLoadError = ref(false)

const displayCover = computed(() =>
  getDisplayImageUrl(props.cover || '', globalSettingsStore.globalSettings.GLOBAL_IMAGE_CACHE),
)
const showCover = computed(() => Boolean(displayCover.value) && !imageLoadError.value)

watch(displayCover, () => {
  imageLoadError.value = false
})
</script>

<template>
  <div
    class="max-w-8xl mx-auto px-4"
    :class="{
      'music-detail-transparent': isTransparentTheme,
      'music-detail-glass': isGlassTheme,
    }"
  >
    <template v-if="showCover">
      <div class="vue-music-back vue-music-back-image absolute left-0 top-0 w-full h-96">
        <VImg class="h-96" position="top" :src="displayCover" cover />
      </div>
      <div class="vue-music-back vue-music-back-overlay absolute left-0 top-0 w-full h-96" />
    </template>
    <div class="music-page">
      <div class="music-header">
        <div class="music-poster" :class="{ 'music-poster--rounded': props.rounded }">
          <VImg v-if="showCover" :src="displayCover" cover aspect-ratio="1" @error="imageLoadError = true">
            <template #placeholder>
              <VSkeletonLoader class="h-100 w-100" />
            </template>
          </VImg>
          <VSheet v-else class="music-poster-placeholder d-flex align-center justify-center">
            <VIcon :icon="props.rounded ? 'mdi-account-music' : 'mdi-album'" size="72" color="medium-emphasis" />
          </VSheet>
        </div>
        <div class="music-title">
          <h1>{{ props.title }}</h1>
          <div class="music-subtitle">
            <slot name="subtitle" />
          </div>
          <span v-if="props.attributes.length" class="music-attributes">
            <template v-for="(attribute, index) in props.attributes" :key="attribute">
              <span v-if="index > 0" class="mx-1">|</span>
              <span>{{ attribute }}</span>
            </template>
          </span>
        </div>
        <div class="music-actions">
          <slot name="actions" />
        </div>
      </div>
      <div class="music-overview">
        <div class="music-overview-left">
          <slot name="body" />
        </div>
        <div v-if="$slots.facts" class="music-overview-right">
          <div class="music-facts">
            <slot name="facts" />
          </div>
        </div>
      </div>
      <slot />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vue-music-back {
  z-index: 0;
  background-image:
    linear-gradient(180deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%),
    linear-gradient(0deg, rgba(var(--v-theme-background), 0) 80%, rgba(var(--v-theme-background), 1) 100%),
    linear-gradient(90deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%),
    linear-gradient(270deg, rgba(var(--v-theme-background), 0) 50%, rgba(var(--v-theme-background), 1) 100%);
  margin-block-start: calc(-70px - env(safe-area-inset-top));
  pointer-events: none;
}

.vue-music-back-image {
  background-image: none;
}

.music-detail-transparent .vue-music-back-overlay,
.music-detail-glass .vue-music-back-overlay {
  display: none;
}

.music-detail-transparent .vue-music-back-image,
.music-detail-glass .vue-music-back-image {
  mask-composite: intersect;
  mask-image:
    linear-gradient(to bottom, transparent 0%, #000 16%, #000 58%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 10%, #000 90%, transparent 100%);
  opacity: 0.82;
}

.music-page {
  position: relative;
  z-index: 1;
  margin-block-start: calc(-4rem - env(safe-area-inset-top));
  margin-inline: -1rem;
  padding-block-start: calc(4rem + env(safe-area-inset-top));
  padding-inline: 1rem;
}

.music-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-block-start: 1rem;
}

.music-poster {
  overflow: hidden;
  flex: 0 0 auto;
  border-radius: var(--app-surface-radius);
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 10%);
  inline-size: 9rem;
}

.music-poster--rounded {
  border-radius: 50%;
}

.music-poster-placeholder {
  aspect-ratio: 1;
  background: rgba(var(--v-theme-on-surface), 0.08);
  inline-size: 100%;
}

.music-title {
  display: flex;
  flex: 1 1 0%;
  flex-direction: column;
  margin-block-start: 1rem;
  min-inline-size: 0;
  text-align: center;
}

.music-title > h1 {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;
  overflow-wrap: break-word;
}

.music-subtitle {
  font-size: 1rem;
  margin-block-start: 0.35rem;
}

.music-attributes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  margin-block-start: 0.35rem;
  opacity: 0.85;
}

.music-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-block-start: 1rem;
}

.music-overview {
  display: flex;
  flex-direction: column;
  padding-block: 2rem 1rem;
}

.music-overview-left {
  flex: 1 1 0%;
  min-inline-size: 0;
}

.music-overview-right {
  inline-size: 100%;
  margin-block-start: 2rem;
}

.music-facts {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
}

@media (width >= 768px) {
  .music-poster {
    inline-size: 11rem;
  }
}

@media (width >= 1024px) {
  .music-overview {
    flex-direction: row;
  }

  .music-overview-left {
    margin-inline-end: 2rem;
  }

  .music-overview-right {
    inline-size: 20rem;
    margin-block-start: 0;
  }
}

@media (width >= 1280px) {
  .music-header {
    flex-direction: row;
    align-items: flex-end;
  }

  .music-poster {
    inline-size: 13rem;
    margin-inline-end: 1rem;
  }

  .music-title {
    margin-block-start: 0;
    margin-inline-end: 1rem;
    text-align: start;
  }

  .music-title > h1 {
    font-size: 2.25rem;
    line-height: 2.5rem;
  }

  .music-attributes {
    justify-content: flex-start;
  }

  .music-actions {
    justify-content: flex-end;
    margin-block-start: 0;
  }
}
</style>
