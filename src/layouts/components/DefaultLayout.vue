<script lang="ts" setup>
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
import UserNofification from '@/layouts/components/UserNotification.vue'
import SearchBar from '@/layouts/components/SearchBar.vue'
import ShortcutBar from '@/layouts/components/ShortcutBar.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'
import { useUserStore } from '@/stores'
import { SystemNavMenus } from '@/router/menu'
import { NavMenu } from '@/@layouts/types'
import { useDisplay } from 'vuetify'
import { useRouter, useRoute } from 'vue-router'
import { onMounted, onUnmounted, ref, computed, inject } from 'vue'

const display = useDisplay()
const appMode = inject('pwaMode')
const router = useRouter()
const route = useRoute()

// 用户 Store
const userStore = useUserStore()

// 是否超级用户
let superUser = userStore.superUser

// 开始菜单项
const startMenus = ref<NavMenu[]>([])

// 发现菜单项
const discoveryMenus = ref<NavMenu[]>([])

// 订阅菜单项
const subscribeMenus = ref<NavMenu[]>([])

// 整理菜单项
const organizeMenus = ref<NavMenu[]>([])

// 系统菜单项
const systemMenus = ref<NavMenu[]>([])

// 订阅分段控制选项 - 更新图标
const subscribeSegments = [
  { title: '电影', value: '/subscribe/movie', icon: 'mdi-filmstrip' },
  { title: '电视剧', value: '/subscribe/tv', icon: 'mdi-television-classic' },
  { title: '日历', value: '/calendar', icon: 'mdi-calendar-month' },
]

// 当前激活的订阅分段
const activeSubscribeSegment = computed(() => {
  const path = route.path
  if (path.startsWith('/subscribe/movie')) return '/subscribe/movie'
  if (path.startsWith('/subscribe/tv')) return '/subscribe/tv'
  if (path.startsWith('/calendar')) return '/calendar'
  return ''
})

// 显示订阅分段控制器
const showSubscribeSegments = computed(() => {
  return activeSubscribeSegment.value !== ''
})

// 切换订阅分段
function changeSubscribeSegment(path: string) {
  router.push({ path })
}

// 根据分类获取菜单列表
const getMenuList = (header: string) => {
  return SystemNavMenus.filter(
    (item: NavMenu) => 
      item.header === header && 
      (superUser || !item.admin) && 
      !item.hidden
  )
}

// 返回上一页
function goBack() {
  history.back()
}

// 底部工具栏控制
const isTabBarVisible = ref(true)
const lastScrollTop = ref(0)
const scrollThreshold = 20
const autoHideTimeout = ref<number | null>(null)
const autoHideDelay = 1000 // 1秒后自动隐藏

// 显示底部标签栏并重置自动隐藏计时器
function showTabBar() {
  isTabBarVisible.value = true
  
  // 清除之前的计时器
  if (autoHideTimeout.value !== null) {
    clearTimeout(autoHideTimeout.value)
  }
  
  // 设置新的自动隐藏计时器
  autoHideTimeout.value = window.setTimeout(() => {
    isTabBarVisible.value = false
  }, autoHideDelay)
}

// 监听滚动事件，控制底部工具栏显示/隐藏
function handleScroll() {
  const currentScrollTop = window.scrollY || document.documentElement.scrollTop
  
  // 如果滚动距离超过阈值，判断是否需要隐藏
  if (Math.abs(currentScrollTop - lastScrollTop.value) > scrollThreshold) {
    // 向下滚动立即隐藏，向上滚动显示并重置计时器
    if (currentScrollTop > lastScrollTop.value && currentScrollTop > 50) {
      isTabBarVisible.value = false
      
      // 向下滚动时清除计时器
      if (autoHideTimeout.value !== null) {
        clearTimeout(autoHideTimeout.value)
        autoHideTimeout.value = null
      }
    } else {
      showTabBar()
    }
    
    lastScrollTop.value = currentScrollTop
  }
}

// 处理用户交互事件，显示底部栏并重置计时器
function handleUserInteraction() {
  showTabBar()
}

// 计算底部工具栏的类
const tabBarClasses = computed(() => {
  return {
    'tab-bar-visible': isTabBarVisible.value,
    'tab-bar-hidden': !isTabBarVisible.value
  }
})

onMounted(() => {
  // 获取菜单列表
  startMenus.value = getMenuList('开始')
  discoveryMenus.value = getMenuList('发现')
  subscribeMenus.value = getMenuList('订阅')
  organizeMenus.value = getMenuList('整理')
  systemMenus.value = getMenuList('系统')
  
  // 添加统一的订阅入口
  const combinedSubscribeMenu = {
    title: '订阅',
    icon: 'mdi-rss',
    to: '/subscribe/movie', // 默认进入电影订阅
    header: '订阅',
    admin: false,
  }
  
  // 将合并后的订阅菜单添加到订阅菜单列表的开头
  subscribeMenus.value.unshift(combinedSubscribeMenu)
  
  // 添加滚动事件监听
  window.addEventListener('scroll', handleScroll, { passive: true })
  
  // 添加用户交互事件监听
  window.addEventListener('touchstart', handleUserInteraction, { passive: true })
  window.addEventListener('mousedown', handleUserInteraction, { passive: true })
  
  // 初始化时启动自动隐藏计时器
  showTabBar()
})

onUnmounted(() => {
  // 移除滚动事件监听
  window.removeEventListener('scroll', handleScroll)
  
  // 移除用户交互事件监听
  window.removeEventListener('touchstart', handleUserInteraction)
  window.removeEventListener('mousedown', handleUserInteraction)
  
  // 清除计时器
  if (autoHideTimeout.value !== null) {
    clearTimeout(autoHideTimeout.value)
  }
})
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 Navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center mx-1">
        <!-- 👉 Vertical Nav Toggle -->
        <IconBtn v-if="!appMode && display.mdAndDown.value" class="ms-n2" @click="toggleVerticalOverlayNavActive(true)">
          <VIcon icon="mdi-menu" />
        </IconBtn>
        <!-- 👉 Back Button -->
        <IconBtn v-if="appMode" class="ms-n2" @click="goBack">
          <VIcon icon="mdi-arrow-left" size="32" />
        </IconBtn>
        
        <!-- 👉 Search Bar -->
        <SearchBar class="search-bar" />
        
        <!-- 👉 订阅分段控制器 -->
        <div v-if="showSubscribeSegments" class="subscribe-segments px-2 d-flex align-center">
          <VBtnToggle
            v-model="activeSubscribeSegment"
            color="primary"
            class="segment-toggle"
            mandatory
            @update:model-value="changeSubscribeSegment"
          >
            <VBtn
              v-for="segment in subscribeSegments"
              :key="segment.value"
              :value="segment.value"
              :ripple="false"
              class="subscribe-segment-btn"
              variant="text"
              density="compact"
              size="small"
            >
              <VIcon :icon="segment.icon" class="segment-icon" />
              <span class="segment-text">{{ segment.title }}</span>
            </VBtn>
          </VBtnToggle>
        </div>
        
        <!-- 👉 Spacer -->
        <VSpacer />
        <!-- 👉 Shortcuts -->
        <ShortcutBar v-if="superUser" />
        <!-- 👉 Theme -->
        <NavbarThemeSwitcher />
        <!-- 👉 Notification -->
        <UserNofification />
        <!-- 👉 UserProfile -->
        <UserProfile />
      </div>
      
      <!-- 移动端固定在底部的分段控制器 -->
      <Teleport to="body">
        <div v-if="showSubscribeSegments && display.smAndDown.value" 
             class="mobile-tab-bar-container"
             :class="tabBarClasses">
          <div class="mobile-tab-bar">
            <VBtnToggle
              v-model="activeSubscribeSegment"
              color="primary"
              class="mobile-segment-toggle"
              mandatory
              @update:model-value="changeSubscribeSegment"
            >
              <VBtn
                v-for="segment in subscribeSegments"
                :key="segment.value"
                :value="segment.value"
                class="mobile-tab-btn"
                variant="text"
                min-width="0"
              >
                <div class="d-flex flex-column align-center justify-center" style="width: 100%">
                  <VIcon :icon="segment.icon" size="22" />
                  <span class="mobile-tab-text">{{ segment.title }}</span>
                </div>
              </VBtn>
            </VBtnToggle>
          </div>
        </div>
      </Teleport>
    </template>

    <template #vertical-nav-content>
      <VerticalNavLink v-for="item in startMenus" :item="item" />
      <!-- 👉 发现 -->
      <VerticalNavSectionTitle
        v-if="discoveryMenus.length > 0"
        :item="{
          heading: '发现',
        }"
      />
      <VerticalNavLink v-for="item in discoveryMenus" :item="item" />
      <!-- 👉 订阅 -->
      <VerticalNavSectionTitle
        v-if="subscribeMenus.length > 0"
        :item="{
          heading: '订阅',
        }"
      />
      <VerticalNavLink v-for="item in subscribeMenus" :item="item" />
      <!-- 👉 整理 -->
      <VerticalNavSectionTitle
        v-if="organizeMenus.length > 0"
        :item="{
          heading: '整理',
        }"
      />
      <VerticalNavLink v-for="item in organizeMenus" :item="item" />
      <!-- 👉 系统 -->
      <VerticalNavSectionTitle
        v-if="systemMenus.length > 0"
        :item="{
          heading: '系统',
        }"
      />
      <VerticalNavLink v-for="item in systemMenus" :item="item" />
    </template>

    <template #after-vertical-nav-items />
    <!-- 👉 Pages -->
    <slot />
    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>
</template>

<style lang="scss" scoped>
.meta-key {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  block-size: 1.5625rem;
  line-height: 1.3125rem;
  padding-block: 0.125rem;
  padding-inline: 0.25rem;
}

.subscribe-segments {
  height: 40px;
  margin-left: 8px;
  flex-grow: 0;
  
  .segment-toggle {
    background-color: rgba(var(--v-theme-primary), 0.05);
    border: 1px solid rgba(var(--v-theme-primary), 0.2);
    border-radius: 6px;
    overflow: hidden;
    height: 100%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    width: 100%;
  }
  
  .subscribe-segment-btn {
    min-width: auto;
    padding: 0 12px;
    border-radius: 0;
    height: 100%;
    margin: 0;
    font-weight: 500;
    flex-grow: 1;
    
    &:not(:last-child) {
      border-right: 1px solid rgba(var(--v-theme-primary), 0.2);
    }
    
    .segment-icon {
      margin-right: 6px;
      color: rgb(var(--v-theme-primary));
      font-size: 20px;
    }
    
    .segment-text {
      color: rgba(var(--v-theme-on-background), 0.9);
    }
  }
  
  @media (max-width: 960px) {
    flex-grow: 1;
    height: 42px;
    max-width: none;
    margin-left: 12px;
    margin-right: 4px;
    
    .segment-toggle {
      width: 100%;
      border-radius: 8px;
      background-color: rgba(var(--v-theme-surface), 0.85);
      border: 1px solid rgba(var(--v-theme-primary), 0.3);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
    }
    
    .segment-text {
      display: none;
    }
    
    .subscribe-segment-btn {
      padding: 0;
      flex: 1;
      transition: all 0.2s ease;
      position: relative;
      
      .segment-icon {
        margin-right: 0;
        font-size: 22px;
        transition: transform 0.2s ease;
      }
      
      &:not(:last-child) {
        border-right: 1px solid rgba(var(--v-theme-primary), 0.15);
      }
      
      &:active {
        background-color: rgba(var(--v-theme-primary), 0.15);
        
        .segment-icon {
          transform: scale(1.1);
        }
      }
    }
  }
  
  @media (max-width: 600px) {
    margin-left: 8px;
    height: 38px;
    
    .segment-toggle {
      border-radius: 20px;
    }
    
    .subscribe-segment-btn {
      padding: 0 2px;
      
      .segment-icon {
        font-size: 20px;
      }
    }
  }
}

// 在移动端减小搜索框宽度，为分段控制器留出更多空间
@media (max-width: 960px) {
  .search-bar {
    max-width: 180px;
  }
}

@media (max-width: 600px) {
  .search-bar {
    max-width: 120px;
  }
}

:deep(.v-btn--active.subscribe-segment-btn) {
  background-color: rgb(var(--v-theme-primary));
  
  .segment-text, .segment-icon {
    color: rgb(var(--v-theme-on-primary)) !important;
  }
  
  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background-color: rgba(255, 255, 255, 0.7);
  }
  
  @media (max-width: 600px) {
    &::after {
      display: none;
    }
  }
}

// 移动端底部标签栏
.mobile-tab-bar-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex;
  justify-content: center;
  pointer-events: none;
  transform: translateZ(0);
  will-change: transform;
  transition: transform 0.25s ease, opacity 0.25s ease; /* 加快过渡速度 */
  
  &.tab-bar-visible {
    transform: translateY(0);
    opacity: 1;
  }
  
  &.tab-bar-hidden {
    transform: translateY(100%);
    opacity: 0;
  }
}

.mobile-tab-bar {
  background-color: rgba(var(--v-theme-surface), 0.9);
  border-radius: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  padding: 8px;
  width: 100%;
  max-width: 300px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(var(--v-theme-primary), 0.15);
  pointer-events: auto;
  transition: all 0.2s ease;
}

.mobile-segment-toggle {
  width: 100%;
  background: transparent;
  border: none;
  box-shadow: none;
  display: flex;
  justify-content: space-between;
}

.mobile-tab-btn {
  height: auto;
  flex: 1;
  padding: 6px 0;
  margin: 0 4px;
  border-radius: 12px;
  opacity: 0.7;
  transition: all 0.2s ease;
  position: relative;
  
  &.v-btn--active {
    opacity: 1;
    background-color: rgba(var(--v-theme-primary), 0.18);
    transform: translateY(-2px);
    
    .v-icon {
      color: rgb(var(--v-theme-primary));
      transform: scale(1.1);
      filter: drop-shadow(0 2px 4px rgba(var(--v-theme-primary), 0.4));
    }
    
    .mobile-tab-text {
      color: rgb(var(--v-theme-primary));
      font-weight: 600;
    }
  }
  
  &:active {
    transform: scale(0.95);
    opacity: 0.9;
  }
  
  .v-icon {
    margin-bottom: 3px;
    transition: all 0.2s ease;
  }
}

.mobile-tab-text {
  font-size: 12px;
  transition: color 0.2s ease;
  display: block;
  text-align: center;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  padding: 0 2px;
}

// 在移动端隐藏顶部的分段控制器
@media (max-width: 600px) {
  .subscribe-segments {
    display: none !important;
  }
}

// 为底部空间添加额外的内边距，防止内容被底部栏遮挡
:deep(.v-application__wrap) {
  padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
}
</style>
