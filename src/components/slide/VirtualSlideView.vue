<script lang="ts" setup generic="T">
import SlideViewTitle from '@/components/slide/SlideViewTitle.vue'
import { useDisplay } from 'vuetify'

/** 榜单滑块通过依赖注入传递的标题与更多跳转链接。 */
interface RankingProps {
  /** 查看更多路由地址。 */
  linkurl?: string
  /** 滑块分组标题。 */
  title?: string
}

const props = withDefaults(
  defineProps<{
    items: T[]
    /** 显式指定像素宽度；默认与海报卡片的 9rem 保持一致。 */
    itemWidth?: number
    itemGap?: number
    overscanItems?: number
    getItemKey?: (item: T, index: number) => string | number | undefined
    loading?: boolean
  }>(),
  {
    itemWidth: undefined,
    itemGap: 16,
    overscanItems: 4,
    getItemKey: undefined,
    loading: false,
  },
)

const display = useDisplay()
const isTouch = computed(() => display.mobile.value)
const injectedProps = inject<RankingProps>('rankingPropsKey', { linkurl: '', title: '' })

const slideContentRef = ref<HTMLElement | null>(null)
const disabled = ref(0)
const slideScrollLeft = ref(0)
const isScrolling = ref(false)
const startIndex = ref(0)
const endIndex = ref(0)
const rootFontSize = ref(16)

let resizeObserver: ResizeObserver | null = null
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

const scrollTimeoutDuration = 1500
const resolvedItemWidth = computed(() => props.itemWidth ?? rootFontSize.value * 9)
const itemStep = computed(() => resolvedItemWidth.value + props.itemGap)
const visibleItems = computed(() => props.items.slice(startIndex.value, endIndex.value))

const leadingSpaceWidth = computed(() => startIndex.value * itemStep.value)

const visibleItemsWidth = computed(() => {
  if (!visibleItems.value.length) {
    return 0
  }

  return (
    visibleItems.value.length * resolvedItemWidth.value + Math.max(visibleItems.value.length - 1, 0) * props.itemGap
  )
})

const totalContentWidth = computed(() => {
  if (!props.items.length) {
    return 0
  }

  return props.items.length * resolvedItemWidth.value + Math.max(props.items.length - 1, 0) * props.itemGap
})

const trailingSpaceWidth = computed(() => {
  return Math.max(totalContentWidth.value - leadingSpaceWidth.value - visibleItemsWidth.value, 0)
})

/**
 * 获取容器宽度不可用时的兜底视口宽度。
 */
function getFallbackViewportWidth() {
  if (typeof window === 'undefined') {
    return itemStep.value * Math.max(props.overscanItems, 1)
  }

  // keep-alive 激活的首帧偶尔测不到容器宽度，先按视口宽度渲染一屏，避免右侧短暂空白。
  return Math.max(window.innerWidth, itemStep.value * Math.max(props.overscanItems, 1))
}

/**
 * 解析虚拟列表项的稳定 key。
 */
function resolveItemKey(item: T, index: number) {
  const key = props.getItemKey?.(item, startIndex.value + index)
  if (key !== undefined && key !== '') {
    return key
  }

  return startIndex.value + index
}

/**
 * 重置滚动状态指示计时器。
 */
function resetScrollIndicatorTimer() {
  isScrolling.value = true
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }

  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, scrollTimeoutDuration)
}

/**
 * 根据当前滚动位置更新虚拟渲染范围。
 */
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

/**
 * 同步左右导航按钮的可用状态。
 */
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

/**
 * 同步虚拟列表布局与导航状态。
 */
function syncLayoutState() {
  // 浏览器字体设置会改变 rem，虚拟占位和滚动步长必须跟随真实卡片尺寸。
  const fontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  rootFontSize.value = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 16
  updateVisibleRange()
  updateDisabledState()
}

/**
 * 按当前可视范围向左或向右滚动一屏。
 */
function slideNext(next: boolean) {
  const element = slideContentRef.value
  if (!element) return

  const visibleCount = Math.max(1, Math.trunc(element.clientWidth / itemStep.value))
  const currentIndex =
    element.scrollLeft === 0 ? 0 : Math.trunc((element.scrollLeft + itemStep.value / 2) / itemStep.value)
  const targetLeft = next
    ? Math.min((currentIndex + visibleCount) * itemStep.value, element.scrollWidth - element.clientWidth)
    : Math.max((currentIndex - visibleCount) * itemStep.value, 0)

  element.scrollTo({
    behavior: 'smooth',
    left: targetLeft,
    top: 0,
  })

  resetScrollIndicatorTimer()
}

/**
 * 处理内容滚动并刷新滚动指示状态。
 */
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
  () => [props.items.length, props.itemWidth, props.itemGap],
  () => {
    nextTick(syncLayoutState)
  },
  { immediate: true },
)
</script>

<template>
  <div v-show="loading || items.length > 0" class="slider-container" :class="{ 'is-scrolling': isScrolling }">
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
                    width: `${resolvedItemWidth}px`,
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
        variant="flat"
        color="default"
        icon="mdi-chevron-left"
        @click.stop="slideNext(false)"
      />

      <VBtn
        v-show="disabled !== 2 && disabled !== 3 && !isTouch"
        class="nav-button nav-button-right"
        variant="flat"
        color="default"
        icon="mdi-chevron-right"
        @click.stop="slideNext(true)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */
.slider-container {
  position: relative;
  isolation: isolate;
  margin-block-end: 8px;

  --slider-shadow-bleed-start: 28px;
  --slider-shadow-bleed-end: 56px;
  --slider-shadow-bleed-inline: 12px;
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
  border: 1px solid var(--mp-border-subtle);
  border-radius: var(--app-control-radius, 8px);
  background-color: rgba(var(--mp-surface-rgb), 0.58);
  color: var(--mp-primary-fg);
  font-size: 0.85rem;
  font-weight: 600;
  padding-block: 5px;
  padding-inline: 0.625rem;
  text-decoration: none;
  transition: all 0.25s ease;

  .arrow-svg {
    fill: currentcolor;
    margin-inline-start: 2px;
    transition: transform 0.3s ease;
  }

  &:hover {
    border-color: var(--mp-primary-border);
    background-color: var(--mp-primary-soft);
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
  border: 1px solid rgba(248, 250, 252, 0.24);
  border-radius: 50%;
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  background: rgba(11, 19, 34, 0.76) !important;
  block-size: 40px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
  color: var(--mp-on-media) !important;
  cursor: pointer;
  inline-size: 40px;
  inset-block-start: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity 0.3s ease,
    transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
    background-color 0.3s ease,
    box-shadow 0.3s ease,
    border-color 0.3s ease;

  :deep(.v-icon) {
    font-size: 26px;
    opacity: 1;
    transition: transform 0.3s ease;
  }

  &:hover {
    border-color: rgba(248, 250, 252, 0.42);
    background: rgba(11, 19, 34, 0.92) !important;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.34);
    color: var(--mp-on-media) !important;
    transform: translateY(-50%) scale(1.05);

    :deep(.v-icon) {
      transform: scale(1.08);
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
