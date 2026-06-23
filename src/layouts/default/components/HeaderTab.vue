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

  showTabsScrollIndicator.value = hasOverflow && !isScrolledToEnd && !shouldHideScrollControls
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
  position: relative; // Needed for pseudo-element positioning
  display: flex;
  flex-grow: 1;
  gap: 12px;

  // Clip content that overflows, useful with padding
  mask-image: linear-gradient(to right, black 95%, transparent 100%);
  min-inline-size: 0;
  overflow-x: auto;
  padding-block: 4px;
  padding-inline: 0;

  // Add padding-right to make space for the indicator visually
  padding-inline-end: 20px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  // Gradient indicator pseudo-element
  &::after {
    position: absolute;
    z-index: 1; // Ensure it's above the tabs but below other header elements if needed
    background: linear-gradient(to left, rgba(var(--v-theme-background), 10.3) 30%, transparent);
    content: '';
    inline-size: 40px; // Width of the fade effect
    inset-block: 0;
    inset-inline-end: 0;
    opacity: 0; // Hidden by default
    pointer-events: none; // Allow interaction with content behind it
    transition: opacity 0.2s ease-in-out;
  }

  // Show indicator when class is applied
  &.show-indicator::after {
    opacity: 1;
  }

  // 触摸设备支持手势横向滚动，无需额外指示器
  @media (hover: none) and (pointer: coarse) {
    &::after {
      display: none !important;
    }
  }
}

.header-tab-icon {
  color: rgba(var(--v-theme-on-background), 0.6);
  margin-inline-end: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 10%);
  transition: color 0.2s ease;
}

.header-tab {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 20px;
  background-color: transparent;
  color: rgba(var(--v-theme-on-background), 0.7);
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  padding-block: 6px;
  padding-inline: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 10%);
  transition: all 0.2s ease;
  white-space: nowrap;

  &::after {
    position: absolute;
    border-radius: 3px;
    background-color: rgb(var(--v-theme-primary));
    block-size: 3px;
    content: '';
    inline-size: 70%;
    inset-block-end: -4px;
    inset-inline-start: 50%;
    transform: translateX(-50%) scaleX(0);
    transition: transform 0.2s ease;
  }

  &.active {
    color: rgb(var(--v-theme-primary));
    text-shadow: 0 1px 3px rgba(0, 0, 0, 15%);

    &::after {
      transform: translateX(-50%) scaleX(1);
    }

    .header-tab-icon {
      color: rgb(var(--v-theme-primary));
      text-shadow: 0 1px 3px rgba(0, 0, 0, 15%);
    }
  }

  &:hover:not(.active) {
    background-color: rgba(var(--v-theme-primary), 0.05);
    color: rgba(var(--v-theme-on-background), 1);
  }
}
</style>
