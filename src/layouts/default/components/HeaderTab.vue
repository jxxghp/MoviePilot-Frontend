<script setup lang="ts">
import { useTabStateRestore } from '@/composables/useStateRestore'

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  items: {
    type: Array as PropType<{ title: string; icon?: string; tab: string }[]>,
    default: () => [],
  },
  // 新增：是否启用PWA状态恢复
  enableStateRestore: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:modelValue'])

// 集成PWA状态恢复功能
const pwaTabState = props.enableStateRestore ? useTabStateRestore(props.modelValue) : null

// 使用PWA状态恢复的activeTab或本地状态
const currentValue = ref(pwaTabState?.activeTab.value || props.modelValue)

// 监听currentValue变化，同时更新PWA状态和父组件
watch(currentValue, newVal => {
  emit('update:modelValue', newVal)
  // 如果启用了PWA状态恢复，同步更新PWA状态
  if (pwaTabState && newVal) {
    pwaTabState.activeTab.value = newVal
  }
})

// 监听父组件的modelValue变化
watch(
  () => props.modelValue,
  value => {
    currentValue.value = value
    // 同步到PWA状态
    if (pwaTabState && value) {
      pwaTabState.activeTab.value = value
    }
  },
)

// 如果启用了PWA状态恢复，监听PWA状态变化
if (pwaTabState) {
  watch(pwaTabState.activeTab, newTab => {
    if (newTab && newTab !== currentValue.value) {
      currentValue.value = newTab
      emit('update:modelValue', newTab)
    }
  })
}

// Ref for the tabs container
const tabsContainerRef = ref<HTMLElement | null>(null)
// State for showing the scroll indicator
const showTabsScrollIndicator = ref(false)
// State for showing the scroll buttons
const showLeftButton = ref(false)
const showRightButton = ref(false)

const isTouchDevice = () => {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

// Function to scroll the tabs
const scrollTabs = (direction: 'left' | 'right') => {
  const el = tabsContainerRef.value
  if (!el) return

  // 可以根据需要调整滚动量
  const scrollAmount = 200
  const scrollPosition = direction === 'left' ? el.scrollLeft - scrollAmount : el.scrollLeft + scrollAmount

  el.scrollTo({
    left: scrollPosition,
    behavior: 'smooth',
  })

  // 滚动完成后更新指示器状态
  setTimeout(() => {
    updateTabsIndicator()
  }, 300) // 等待滚动动画完成
}

// Function to check and update the indicator state
const updateTabsIndicator = () => {
  const el = tabsContainerRef.value
  if (!el) return

  // 仅在触摸设备上隐藏按钮，非触摸小屏设备仍需支持横向切换
  const shouldHideScrollControls = isTouchDevice()

  const tolerance = 1 // Allow 1px tolerance
  const hasOverflow = el.scrollWidth > el.clientWidth + tolerance
  const isScrolledToEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - tolerance
  const isScrolledToStart = el.scrollLeft <= tolerance

  showTabsScrollIndicator.value = hasOverflow && !isScrolledToEnd
  showLeftButton.value = hasOverflow && !isScrolledToStart && !shouldHideScrollControls
  showRightButton.value = hasOverflow && !isScrolledToEnd && !shouldHideScrollControls
}

// Debounce resize handler
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
const handleResize = () => {
  if (resizeTimeout) clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(() => {
    updateTabsIndicator()
  }, 150)
}

onMounted(async () => {
  // Add resize listener for tabs indicator
  window.addEventListener('resize', handleResize)
  // Add scroll listener for tabs container
  tabsContainerRef.value?.addEventListener('scroll', updateTabsIndicator)
  // Initial check for tabs indicator after DOM update
  await nextTick() // Ensure element is rendered
  updateTabsIndicator()
})

onUnmounted(() => {
  // Remove resize listener
  window.removeEventListener('resize', handleResize)
  // Remove tabs scroll listener
  tabsContainerRef.value?.removeEventListener('scroll', updateTabsIndicator)
})
</script>
<template>
  <div class="tab-header">
    <VBtn v-if="showLeftButton" class="scroll-button left-button" @click="scrollTabs('left')" variant="text" icon>
      <VIcon icon="tabler-chevron-left" size="small" color="secondary" />
    </VBtn>

    <div ref="tabsContainerRef" class="header-tabs" :class="{ 'show-indicator': showTabsScrollIndicator }">
      <div
        v-for="(item, index) in items"
        :key="index"
        class="header-tab"
        :class="{ 'active': currentValue === item.tab }"
        @click="currentValue = item.tab"
      >
        <VIcon v-if="item.icon" :icon="item.icon" size="small" class="header-tab-icon" />
        <span>{{ item.title }}</span>
      </div>
    </div>

    <VBtn v-if="showRightButton" class="scroll-button right-button" @click="scrollTabs('right')" variant="text" icon>
      <VIcon icon="tabler-chevron-right" size="small" color="secondary" />
    </VBtn>

    <slot name="append" />
  </div>
</template>
<style scoped lang="scss">
.tab-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.3s ease;
}

.scroll-button {
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  block-size: 28px;
  cursor: pointer;
  inline-size: 28px;
  outline: none;
  transition: background-color 0.2s ease;

  &.left-button {
    margin-inline-end: 6px;
  }

  &.right-button {
    margin-inline-start: 6px;
  }

  // 触摸设备支持手势横向滚动，无需额外按钮
  @media (hover: none) and (pointer: coarse) {
    display: none !important;
  }
}

.header-tabs {
  position: relative;
  display: flex;
  flex-grow: 1;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  overflow-x: auto;
  padding-block: 3px 5px;
  padding-inline: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  &.show-indicator {
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent 100%);
  }
}

.header-tab-icon {
  color: currentcolor;
  margin-inline-end: 6px;
  opacity: 0.78;
  transition:
    color 160ms var(--mp-motion-ease-standard),
    opacity 160ms var(--mp-motion-ease-standard);
}

.header-tab {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  block-size: 2rem;
  border-radius: 9999px;
  background-color: transparent;
  color: var(--mp-muted-fg);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  padding-inline: 14px;
  transition:
    background-color 160ms var(--mp-motion-ease-standard),
    box-shadow 160ms var(--mp-motion-ease-standard),
    color 160ms var(--mp-motion-ease-standard);
  white-space: nowrap;

  &.active {
    background-color: var(--mp-primary-soft);
    box-shadow: inset 0 0 0 1px var(--mp-primary-border);
    color: var(--mp-primary-fg);
    font-weight: 600;

    .header-tab-icon {
      color: var(--mp-primary-fg);
      opacity: 1;
    }
  }

  &:hover:not(.active) {
    background-color: rgba(var(--v-theme-on-surface), 0.06);
    color: var(--mp-fg);
  }
}
</style>
