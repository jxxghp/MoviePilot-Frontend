<script lang="ts" setup>
import SlideViewTitle from '@/components/slide/SlideViewTitle.vue'
import { useDisplay } from 'vuetify'

const props = withDefaults(
  defineProps<{
    items: any[]
    itemWidth?: number
    itemGap?: number
    overscanItems?: number
    getItemKey?: (item: any, index: number) => string | number
    loading?: boolean
  }>(),
  {
    itemWidth: 144,
    itemGap: 16,
    overscanItems: 4,
    getItemKey: undefined,
    loading: false,
  },
)

const display = useDisplay()
const isTouch = computed(() => display.mobile.value)
const injectedProps: any = inject('rankingPropsKey', { linkurl: '', title: '' })

const slideContentRef = ref<HTMLElement | null>(null)
const disabled = ref(0)
const slideScrollLeft = ref(0)
const isScrolling = ref(false)
const startIndex = ref(0)
const endIndex = ref(0)

let resizeObserver: ResizeObserver | null = null
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const scrollTimeoutDuration = 1500
const itemStep = computed(() => props.itemWidth + props.itemGap)
const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value))

const leadingSpaceWidth = computed(() => startIndex.value * itemStep.value)

const visibleItemsWidth = computed(() => {
  if (!visibleItems.value.length) {
    return 0
  }

  return visibleItems.value.length * props.itemWidth + Math.max(visibleItems.value.length - 1, 0) * props.itemGap
})

const totalContentWidth = computed(() => {
  if (!props.items.length) {
    return 0
  }

  return props.items.length * props.itemWidth + Math.max(props.items.length - 1, 0) * props.itemGap
})

const trailingSpaceWidth = computed(() => {
  return Math.max(totalContentWidth.value - leadingSpaceWidth.value - visibleItemsWidth.value, 0)
})

function getFallbackViewportWidth() {
  if (typeof window === 'undefined') {
    return itemStep.value * Math.max(props.overscanItems, 1)
  }

  // keep-alive 激活的首帧偶尔测不到容器宽度，先按视口宽度渲染一屏，避免右侧短暂空白。
  return Math.max(window.innerWidth, itemStep.value * Math.max(props.overscanItems, 1))
}

function resolveItemKey(item: any, index: number) {
  if (props.getItemKey) {
    return props.getItemKey(item, startIndex.value + index)
  }

  return startIndex.value + index
}

function resetScrollIndicatorTimer() {
  isScrolling.value = true
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }

  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, scrollTimeoutDuration)
}

function updateVisibleRange() {
  const element = slideContentRef.value
  if (!element) {
    startIndex.value = 0
    endIndex.value = 0
    return
  }

  const viewportWidth = element.clientWidth || getFallbackViewportWidth()
  if (!viewportWidth || !props.items.length) {
    startIndex.value = 0
    endIndex.value = Math.min(props.items.length, props.overscanItems)
    return
  }

  const firstVisible = Math.max(0, Math.floor(element.scrollLeft / itemStep.value) - props.overscanItems)
  const lastVisible = Math.min(
    props.items.length,
    Math.ceil((element.scrollLeft + viewportWidth) / itemStep.value) + props.overscanItems,
  )

  startIndex.value = firstVisible
  endIndex.value = Math.max(firstVisible + 1, lastVisible)
}

function updateDisabledState() {
  const element = slideContentRef.value
  if (!element) return

  slideScrollLeft.value = element.scrollLeft

  if (!props.items.length || totalContentWidth.value <= element.clientWidth) {
    disabled.value = 3
  } else if (element.scrollLeft === 0) {
    disabled.value = 0
  } else if (element.scrollLeft >= element.scrollWidth - element.clientWidth - 2) {
    disabled.value = 2
  } else {
    disabled.value = 1
  }
}

function syncLayoutState() {
  updateVisibleRange()
  updateDisabledState()
}

function slideNext(next: boolean) {
  const element = slideContentRef.value
  if (!element) return

  const visibleCount = Math.max(1, Math.trunc(element.clientWidth / itemStep.value))
  const currentIndex =
    element.scrollLeft === 0 ? 0 : Math.trunc((element.scrollLeft + itemStep.value / 2) / itemStep.value)
  let targetLeft = 0

  if (next) {
    targetLeft = Math.min((currentIndex + visibleCount) * itemStep.value, element.scrollWidth - element.clientWidth)
  } else {
    targetLeft = Math.max((currentIndex - visibleCount) * itemStep.value, 0)
  }

  element.scrollTo({
    behavior: 'smooth',
    left: targetLeft,
    top: 0,
  })

  resetScrollIndicatorTimer()
}

function handleContentScroll() {
  syncLayoutState()
  resetScrollIndicatorTimer()
}

onMounted(() => {
  syncLayoutState()

  resizeObserver = new ResizeObserver(() => {
    syncLayoutState()
  })

  if (slideContentRef.value) {
    resizeObserver.observe(slideContentRef.value)
  }

  window.addEventListener('resize', syncLayoutState)
})

onUnmounted(() => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
    scrollTimeout = null
  }

  window.removeEventListener('resize', syncLayoutState)
  resizeObserver?.disconnect()
  resizeObserver = null
})

onActivated(() => {
  if (slideContentRef.value && slideScrollLeft.value !== 0) {
    slideContentRef.value.scrollLeft = slideScrollLeft.value
  }

  nextTick(syncLayoutState)
  requestAnimationFrame(syncLayoutState)
})

watch(
  () => props.items.length,
  () => {
    nextTick(syncLayoutState)
  },
  { immediate: true },
)
</script>

<template>
  <div class="slider-container" :class="{ 'is-scrolling': isScrolling }">
    <div class="slider-header">
      <slot name="title">
        <SlideViewTitle />
      </slot>
      <RouterLink v-if="injectedProps.linkurl" :to="injectedProps.linkurl" class="view-all-button">
        <span>更多</span>
        <svg width="16" height="16" viewBox="0 0 24 24" class="arrow-svg">
          <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" />
        </svg>
      </RouterLink>
    </div>

    <div class="slider-content-wrapper">
      <div class="slider-content-container">
        <div ref="slideContentRef" class="slider-content" tabindex="0" @scroll="handleContentScroll">
          <template v-if="loading">
            <div class="loading-track" :style="{ gap: `${itemGap}px` }">
              <slot name="loading" />
            </div>
          </template>
          <template v-else-if="items.length > 0">
            <div class="virtual-track" :style="{ width: `${totalContentWidth}px` }">
              <div v-if="leadingSpaceWidth > 0" class="virtual-spacer" :style="{ width: `${leadingSpaceWidth}px` }" />

              <template v-for="(item, index) in visibleItems" :key="resolveItemKey(item, index)">
                <div
                  class="virtual-slide-item"
                  :style="{
                    marginInlineEnd: index === visibleItems.length - 1 ? '0px' : `${itemGap}px`,
                    width: `${itemWidth}px`,
                  }"
                >
                  <slot name="item" :item="item" :index="startIndex + index" />
                </div>
              </template>

              <div v-if="trailingSpaceWidth > 0" class="virtual-spacer" :style="{ width: `${trailingSpaceWidth}px` }" />
            </div>
          </template>
          <template v-else>
            <slot name="empty" />
          </template>
        </div>
      </div>

      <VBtn
        v-show="disabled !== 0 && disabled !== 3 && !isTouch"
        class="nav-button nav-button-left"
        variant="text"
        icon
        color="secondary"
        @click.stop="slideNext(false)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z" />
        </svg>
      </VBtn>

      <VBtn
        v-show="disabled !== 2 && disabled !== 3 && !isTouch"
        class="nav-button nav-button-right"
        variant="text"
        icon
        color="secondary"
        @click.stop="slideNext(true)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" />
        </svg>
      </VBtn>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.slider-container {
  position: relative;
  isolation: isolate;
  margin-block-end: 8px;

  --slider-shadow-bleed-start: 28px;
  --slider-shadow-bleed-end: 56px;
}

.slider-header {
  // 阴影缓冲区会把滚动区域上移，标题层级需高于滚动区域以保留按钮点击。
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 12px;
  padding-block: 0;
  padding-inline: 8px;

  & > :first-child {
    flex-grow: 1;
    min-inline-size: 0;
  }
}

.view-all-button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  border-radius: 8px;
  background-color: transparent;
  color: rgb(var(--v-theme-primary));
  font-size: 0.85rem;
  font-weight: 500;
  padding-block: 5px;
  padding-inline: 12px;
  text-decoration: none;
  transition: all 0.25s ease;

  .arrow-svg {
    fill: currentcolor;
    margin-inline-start: 2px;
    transition: transform 0.3s ease;
  }

  &:hover {
    border-color: rgba(var(--v-theme-primary), 0.5);
    background-color: rgba(var(--v-theme-primary), 0.08);
    transform: translateY(-1px);

    .arrow-svg {
      transform: translateX(3px);
    }
  }

  span {
    margin-inline-end: 4px;
  }
}

.slider-content-wrapper {
  position: relative;
  z-index: 1;
  inline-size: 100%;
}

.slider-content-container {
  position: relative;
  inline-size: 100%;
}

.slider-content {
  // 横向滚动会让纵向 visible 被浏览器计算成可裁剪区域，这里用缓冲区承接卡片阴影。
  margin-block: calc(var(--slider-shadow-bleed-start) * -1) calc(var(--slider-shadow-bleed-end) * -1);
  -ms-overflow-style: none !important;
  overflow: auto hidden;
  overscroll-behavior-x: contain !important;
  padding-block: var(--slider-shadow-bleed-start) var(--slider-shadow-bleed-end);
  padding-inline: 12px;
  scroll-behavior: smooth;
  scrollbar-width: none !important;

  &::-webkit-scrollbar {
    display: none;
  }
}

.virtual-track {
  display: flex;
  inline-size: max-content;
}

.loading-track {
  display: flex;
  inline-size: max-content;
  min-inline-size: 100%;
}

.virtual-slide-item,
.virtual-spacer,
.loading-track > * {
  flex: 0 0 auto;
}

.virtual-slide-item,
.loading-track > * {
  padding-block-end: 12px;
}

.nav-button {
  position: absolute;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  backdrop-filter: blur(8px);
  background-color: rgba(var(--v-theme-background), 0.3);
  block-size: 36px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 8%);
  cursor: pointer;
  inline-size: 36px;
  inset-block-start: 50%;
  opacity: 0;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 10%);
  transform: translateY(-50%);
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
    background-color 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;

  svg {
    block-size: 22px;
    fill: currentcolor;
    filter: none;
    inline-size: 22px;
    opacity: 0.7;
    transition: all 0.3s ease;
  }

  &:hover {
    color: rgb(var(--v-theme-primary));
    transform: translateY(-50%) scale(1.05);

    svg {
      opacity: 1;
    }
  }
}

.nav-button-left {
  inset-inline-start: 8px;
}

.nav-button-right {
  inset-inline-end: 8px;
}

.slider-container.is-scrolling .nav-button {
  opacity: 1;
  pointer-events: auto;
}

@media (hover: hover) {
  .slider-container:hover .nav-button {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
