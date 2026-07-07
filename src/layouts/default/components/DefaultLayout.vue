<script lang="ts" setup>
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'
import Footer from './Footer.vue'
import UserNofification from './UserNotification.vue'
import SearchBar from './SearchBar.vue'
import ShortcutBar from './ShortcutBar.vue'
import UserProfile from './UserProfile.vue'
import QuickAccess from './QuickAccess.vue'
import HeaderTab from './HeaderTab.vue'
import AgentAssistantWidget from '@/components/agent/AgentAssistantWidget.vue'
import ThemeCustomizer from '@/components/theme/ThemeCustomizer.vue'
import { useGlobalSettingsStore, usePluginSidebarNavStore, useUserStore } from '@/stores'
import { getNavMenus } from '@/router/i18n-menu'
import { filterPluginSidebarNavEntries } from '@/utils/pluginSidebarNav'
import { NavMenu } from '@/@layouts/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  buildUserPermissionContext,
  filterItemsByPermission,
  filterMenusByPermission,
  hasItemPermission,
  hasPermission,
  type UserPermissionFeatureKey,
  type UserPermissionKey,
} from '@/utils/permission'
import { usePullDownGesture } from '@/composables/usePullDownGesture'
import { usePWA } from '@/composables/usePWA'
import OfflinePage from './OfflinePage.vue'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import {
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  THEME_CUSTOMIZER_OPEN_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import logo from '@images/logo.svg?raw'

const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const themeLayout = ref(readThemeCustomizerSettings().layout)
const showThemeCustomizer = ref(false)

// 用户 Store
const userStore = useUserStore()
const pluginSidebarNavStore = usePluginSidebarNavStore()
const globalSettingsStore = useGlobalSettingsStore()

// 获取用户权限信息
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canAdmin = computed(() => hasPermission(userPermissions.value, 'admin'))
const showAgentAssistant = computed(
  () => globalSettingsStore.get('AI_AGENT_ENABLE') === true && globalSettingsStore.get('AI_AGENT_HIDE_ENTRY') !== true,
)

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

// 主题定制器的水平布局只在桌面 UI 中启用，App 模式始终保留移动端导航。
const showHorizontalThemeNav = computed(() => {
  return themeLayout.value === 'horizontal' && !appMode.value && !display.mdAndDown.value
})

const horizontalNavGroups = computed(() =>
  [
    { title: t('menu.start'), icon: 'mdi-home-outline', items: startMenus.value },
    { title: t('menu.discovery'), icon: 'mdi-compass-outline', items: discoveryMenus.value },
    { title: t('menu.subscribe'), icon: 'mdi-rss', items: subscribeMenus.value },
    { title: t('menu.organize'), icon: 'mdi-folder-play-outline', items: organizeMenus.value },
    { title: t('menu.system'), icon: 'mdi-cog-outline', items: systemMenus.value },
  ].filter(group => group.items.length > 0),
)

const navbarExtraHeight = computed(() => {
  const dynamicTabHeight = showDynamicHeaderTab.value ? 2.75 : 0
  const horizontalNavHeight = showHorizontalThemeNav.value ? 3.25 : 0

  return `${dynamicTabHeight + horizontalNavHeight}rem`
})

const mainContentPaddingTop = computed(() => {
  const dynamicTabPadding = showDynamicHeaderTab.value ? 3.25 : 0
  const horizontalNavPadding = showHorizontalThemeNav.value ? 3.5 : 0

  return `${dynamicTabPadding + horizontalNavPadding}rem`
})

// 插件快速访问相关状态
const showPluginQuickAccess = ref(false)

// 离线状态管理
const { isOffline } = useGlobalOfflineStatus()

// 动态标签页相关
// 定义动态标签页类型
interface DynamicHeaderTabButton {
  icon: string
  color?: string | ComputedRef<string>
  variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  size?: string
  class?: string
  action?: () => void
  permission?: UserPermissionKey
  feature?: UserPermissionFeatureKey
  show?: boolean | ComputedRef<boolean>
  loading?: boolean | ComputedRef<boolean>
  dataAttr?: string
}

interface DynamicHeaderTabItem {
  title: string
  icon?: string
  tab: string
  permission?: UserPermissionKey
  feature?: UserPermissionFeatureKey
}

interface DynamicHeaderTab {
  items: DynamicHeaderTabItem[]
  modelValue: string
  appendButtons?: DynamicHeaderTabButton[]
  routePath?: string // 用于标识哪个路由注册的
  onUpdateModelValue?: (value: string) => void // 用于通知值更新
}

// 提供动态标签页注册和获取的方法
const dynamicHeaderTab = ref<DynamicHeaderTab | null>(null)
const openHorizontalNavGroup = ref<string | null>(null)
const pendingHorizontalTab = ref<{ path: string; tab: string } | null>(null)

/** 注册页面动态标签页，并在页面可用后应用待切换的水平导航标签。 */
const registerDynamicHeaderTab = (tab: DynamicHeaderTab) => {
  // 保存注册标签页的路由路径
  tab.routePath = route.path
  // 强制更新，确保响应式系统能检测到变化
  dynamicHeaderTab.value = { ...tab }
  applyPendingHorizontalTab()
}

/** 取消当前页面注册的动态标签页。 */
const unregisterDynamicHeaderTab = () => {
  dynamicHeaderTab.value = null
}

/** 更新当前动态标签页选中值，并通知注册页面同步状态。 */
const handleTabChange = (newValue: string) => {
  if (dynamicHeaderTab.value) {
    if (!visibleDynamicHeaderTabItems.value.some(item => item.tab === newValue)) return

    dynamicHeaderTab.value.modelValue = newValue
    // 通知注册的页面更新值
    if (dynamicHeaderTab.value.onUpdateModelValue) {
      dynamicHeaderTab.value.onUpdateModelValue(newValue)
    }
  }
}

// 添加全局注册方法，解决注入不可用的问题
if (typeof window !== 'undefined') {
  // 确保在浏览器环境中
  ;(window as any).__VUE_INJECT_DYNAMIC_HEADER_TAB__ = registerDynamicHeaderTab
}

// 提供给其他组件使用
provide('registerDynamicHeaderTab', registerDynamicHeaderTab)
provide('unregisterDynamicHeaderTab', unregisterDynamicHeaderTab)

// 监听路由变化来清除动态标签页
watch(
  () => route.path,
  () => {
    // 使用nextTick确保新页面的组件已经挂载完成
    nextTick(() => {
      // 如果当前标签页不属于新路由，则清除
      if (dynamicHeaderTab.value && dynamicHeaderTab.value.routePath !== route.path) {
        dynamicHeaderTab.value = null
      }
    })
  },
  { immediate: false },
)

const visibleDynamicHeaderTabItems = computed(() => {
  if (!dynamicHeaderTab.value || dynamicHeaderTab.value.routePath !== route.path) return []

  return filterItemsByPermission(dynamicHeaderTab.value.items, userPermissions.value)
})

// 当前路由是否注册了动态标签页。
const hasDynamicHeaderTab = computed(() => visibleDynamicHeaderTabItems.value.length > 0)

// 水平布局下动态标签页会并入顶部导航三级菜单，不再额外显示标签页栏。
const showDynamicHeaderTab = computed(() => hasDynamicHeaderTab.value && !showHorizontalThemeNav.value)

const visibleDynamicHeaderButtons = computed(() => {
  if (!hasDynamicHeaderTab.value) return []

  const visibleButtons = (dynamicHeaderTab.value?.appendButtons ?? []).filter(
    button => resolveMaybeRefValue(button.show, true) !== false,
  )
  return filterItemsByPermission(visibleButtons, userPermissions.value)
})

const visibleHorizontalHeaderButtons = computed(() => {
  if (!showHorizontalThemeNav.value) return []

  return visibleDynamicHeaderButtons.value
})

// 在组件销毁时清理
onUnmounted(() => {
  dynamicHeaderTab.value = null
  // 清理全局方法
  if (typeof window !== 'undefined') {
    delete (window as any).__VUE_INJECT_DYNAMIC_HEADER_TAB__
  }
})

/** 判断当前页面状态是否允许使用主界面下拉快捷入口手势。 */
const canUsePullGesture = () => {
  // 检查是否在dashboard页面
  const isDashboard = route.path === '/dashboard' || route.path === '/'
  // 检查是否是管理员
  const isAdmin = canAdmin.value
  // 检查插件快速访问面板是否已显示
  const quickAccessOpen = showPluginQuickAccess.value
  // 检查是否离线
  const offline = isOffline.value

  return isDashboard && isAdmin && !quickAccessOpen && !offline
}

// 使用下拉手势 composable
const {
  pullDistance,
  contentTransform,
  contentTransition,
  showPullIndicator,
  indicatorRotation,
  indicatorOpacity,
  indicatorTransform,
  config: PULL_CONFIG,
} = usePullDownGesture({
  enabled: true,
  config: {
    START_THRESHOLD: 28,
    SHOW_INDICATOR: 80,
    TRIGGER_THRESHOLD: 140,
    MAX_PULL_DISTANCE: 220,
    PULL_RESISTANCE: 0.7,
    CONTENT_FOLLOW_RATIO: 0.35,
    TOLERANCE: 96,
  },
  canUsePullGesture,
  onTrigger: () => {
    showPluginQuickAccess.value = true
  },
})

/** 根据菜单分组标题获取当前用户可见的菜单项。 */
const getMenuList = (header: string) => {
  // 使用国际化菜单
  const menus = getNavMenus(t)
  const filteredMenus = filterMenusByPermission(menus, userPermissions.value)
  return filteredMenus.filter((item: NavMenu) => item.header === header)
}

/** 返回浏览历史中的上一页。 */
function goBack() {
  history.back()
}

/** 同步主题定制器变更后的布局模式。 */
function handleThemeCustomizerChange(event: Event) {
  themeLayout.value = (event as CustomEvent<ThemeCustomizerSettings>).detail.layout
}

/** 打开主题定制器面板。 */
function handleThemeCustomizerOpen() {
  showThemeCustomizer.value = true
}

/** 判断水平导航菜单项是否匹配当前路由。 */
function isHorizontalNavActive(item: NavMenu) {
  const targetPath = normalizeMenuPath(item.to)
  if (!targetPath) return false

  const currentPath = normalizeMenuPath(route.path)

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

/** 判断水平导航分组内是否存在当前路由激活项。 */
function isHorizontalNavGroupActive(group: { items: NavMenu[] }) {
  return group.items.some(isHorizontalNavActive)
}

/** 判断菜单项是否存在可在水平导航中展示的动态标签。 */
function hasHorizontalDynamicTabs(item: NavMenu) {
  return showHorizontalThemeNav.value && getHorizontalNavTabs(item).length > 0
}

/** 判断水平导航动态标签是否为当前选中项。 */
function isHorizontalDynamicTabActive(tab: DynamicHeaderTabItem) {
  return dynamicHeaderTab.value?.modelValue === tab.tab
}

/** 切换水平导航中的动态标签，必要时先跳转到目标页面。 */
async function handleHorizontalDynamicTabSelect(item: NavMenu, tab: DynamicHeaderTabItem) {
  const targetPath = normalizeMenuPath(item.to)
  const currentPath = normalizeMenuPath(route.path)

  if (targetPath && currentPath !== targetPath) {
    // 三级菜单可能在目标页面挂载前点击，先记录待切换 tab，页面注册动态 tab 后再应用。
    pendingHorizontalTab.value = { path: targetPath, tab: tab.tab }
    await router.push(targetPath)
  } else {
    handleTabChange(tab.tab)
  }

  openHorizontalNavGroup.value = null
}

/** 关闭当前展开的水平导航分组菜单。 */
function closeHorizontalNavGroup() {
  openHorizontalNavGroup.value = null
}

/** 读取可能是 Ref 的值，空值时回落到默认值。 */
function resolveMaybeRefValue<T>(value: T | ComputedRef<T> | undefined, fallback: T): T {
  return isRef(value) ? value.value : (value ?? fallback)
}

/** 解析动态头部按钮颜色。 */
function resolveHeaderButtonColor(button: DynamicHeaderTabButton) {
  return resolveMaybeRefValue(button.color, 'gray')
}

/** 解析动态头部按钮加载状态。 */
function resolveHeaderButtonLoading(button: DynamicHeaderTabButton) {
  return resolveMaybeRefValue(button.loading, false)
}

/** 校验权限后执行动态头部按钮动作。 */
function handleHeaderButtonClick(button: DynamicHeaderTabButton) {
  if (!hasItemPermission(button, userPermissions.value)) return

  button.action?.()
}

/** 获取水平导航动态标签图标，不可渲染时使用默认圆点图标。 */
function getHorizontalTabIcon(tab: DynamicHeaderTabItem) {
  const icon = tab.icon?.trim()

  // 部分页面会把业务来源标识（如 themoviedb/douban/bangumi）放进 icon 字段，
  // 这些值不是菜单里的可渲染图标，三级菜单统一回退到默认图标。
  if (!icon || (!icon.startsWith('mdi-') && !icon.startsWith('tabler-') && !icon.includes(':'))) {
    return 'mdi-circle-medium'
  }

  return icon
}

/** 标准化菜单路径，移除末尾斜杠并保留根路径。 */
function normalizeMenuPath(value: unknown) {
  if (typeof value !== 'string') return ''

  return value.replace(/\/$/, '') || '/'
}

/** 获取水平导航菜单项可展示的标签列表。 */
function getHorizontalNavTabs(item: NavMenu): DynamicHeaderTabItem[] {
  const targetPath = normalizeMenuPath(item.to)

  if (targetPath && isHorizontalNavActive(item) && hasDynamicHeaderTab.value) {
    return visibleDynamicHeaderTabItems.value
  }

  return filterItemsByPermission(item.tabs ?? [], userPermissions.value)
}

/** 在目标页面注册动态标签后应用此前暂存的标签切换。 */
function applyPendingHorizontalTab() {
  if (!pendingHorizontalTab.value || !hasDynamicHeaderTab.value) return

  const pending = pendingHorizontalTab.value
  if (normalizeMenuPath(route.path) !== pending.path) return

  const tabExists = visibleDynamicHeaderTabItems.value.some(item => item.tab === pending.tab)
  if (!tabExists) return

  handleTabChange(pending.tab)
  pendingHorizontalTab.value = null
}

/** 关闭插件快速访问面板。 */
function handleClosePluginQuickAccess() {
  showPluginQuickAccess.value = false
}

/** 点击插件入口后关闭插件快速访问面板。 */
function handlePluginClick() {
  showPluginQuickAccess.value = false
}

/** 将插件侧边栏菜单合并到对应的导航分组中。 */
function appendPluginSidebarMenus() {
  for (const { navMenu, section } of filterPluginSidebarNavEntries(
    pluginSidebarNavStore.items,
    t,
    userPermissions.value,
  )) {
    switch (section) {
      case 'start':
        startMenus.value.push(navMenu)
        break
      case 'discovery':
        discoveryMenus.value.push(navMenu)
        break
      case 'subscribe':
        subscribeMenus.value.push(navMenu)
        break
      case 'organize':
        organizeMenus.value.push(navMenu)
        break
      case 'system':
      default:
        systemMenus.value.push(navMenu)
        break
    }
  }
}

onMounted(async () => {
  // 主题定制器由布局统一承载，监听需要尽早注册，避免异步加载菜单期间丢失打开事件。
  window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)
  window.addEventListener(THEME_CUSTOMIZER_OPEN_EVENT, handleThemeCustomizerOpen)

  // 获取菜单列表
  startMenus.value = getMenuList(t('menu.start'))
  discoveryMenus.value = getMenuList(t('menu.discovery'))
  subscribeMenus.value = getMenuList(t('menu.subscribe'))
  organizeMenus.value = getMenuList(t('menu.organize'))
  systemMenus.value = getMenuList(t('menu.system'))

  await pluginSidebarNavStore.ensureSidebarNav()
  appendPluginSidebarMenus()

  // 组件卸载时清理监听
  onBeforeUnmount(() => {
    window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)
    window.removeEventListener(THEME_CUSTOMIZER_OPEN_EVENT, handleThemeCustomizerOpen)
  })
})
</script>

<template>
  <!-- 👉 Offline Page -->
  <OfflinePage />

  <!-- 👉 Pull Down Indicator -->
  <div
    v-if="appMode && showPullIndicator"
    class="app-pull-indicator"
    :style="{
      '--app-pull-indicator-navbar-extra-height': navbarExtraHeight,
      opacity: indicatorOpacity,
      transform: indicatorTransform,
    }"
  >
    <div
      class="app-pull-indicator__icon"
      :style="{
        transform: `scale(${
          1 + Math.min((pullDistance - PULL_CONFIG.SHOW_INDICATOR) / PULL_CONFIG.MAX_PULL_DISTANCE, 0.5) * 0.3
        }) rotate(${indicatorRotation}deg)`,
      }"
    >
      <VIcon
        icon="mdi-gesture-swipe-down"
        size="24"
        :color="pullDistance >= PULL_CONFIG.TRIGGER_THRESHOLD ? 'success' : 'primary'"
      />
    </div>
  </div>
  <VerticalNavLayout :style="{ '--navbar-tab-height': navbarExtraHeight }">
    <!-- 👉 Navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div
        class="theme-navbar-row d-flex h-16 align-center mx-1"
        :class="{ 'theme-navbar-row--horizontal': showHorizontalThemeNav }"
      >
        <RouterLink v-if="showHorizontalThemeNav" :to="canAdmin ? '/dashboard' : '/apps'" class="theme-horizontal-logo">
          <span class="theme-horizontal-logo__mark" v-html="logo" />
          <span class="theme-horizontal-logo__text">MOVIEPILOT</span>
        </RouterLink>
        <!-- 👉 Vertical Nav Toggle -->
        <IconBtn v-if="!appMode && display.mdAndDown.value" class="ms-n2" @click="toggleVerticalOverlayNavActive(true)">
          <VIcon icon="mdi-menu" />
        </IconBtn>
        <!-- 👉 Back Button -->
        <IconBtn v-if="appMode" class="ms-n2" @click="goBack">
          <VIcon icon="mdi-arrow-left" size="32" />
        </IconBtn>
        <!-- 👉 Search Bar -->
        <SearchBar v-if="!showHorizontalThemeNav" />
        <!-- 👉 Spacer -->
        <VSpacer />
        <div
          class="theme-navbar-actions d-flex align-center"
          :class="{ 'theme-navbar-actions--horizontal': showHorizontalThemeNav }"
        >
          <!-- 👉 Horizontal Search Bar -->
          <SearchBar v-if="showHorizontalThemeNav" />
          <!-- 👉 Shortcuts -->
          <ShortcutBar v-if="canAdmin" />
          <!-- 👉 Notification -->
          <UserNofification />
          <!-- 👉 UserProfile -->
          <UserProfile />
        </div>
      </div>
      <div v-if="showHorizontalThemeNav" class="theme-horizontal-nav">
        <VMenu
          v-for="group in horizontalNavGroups"
          :key="group.title"
          :model-value="openHorizontalNavGroup === group.title"
          location="bottom start"
          offset="8"
          open-on-hover
          :open-delay="0"
          :close-delay="120"
          :close-on-content-click="false"
          @update:model-value="openHorizontalNavGroup = $event ? group.title : null"
        >
          <template #activator="{ props: menuProps }">
            <VBtn
              v-bind="menuProps"
              :prepend-icon="group.icon"
              append-icon="mdi-chevron-down"
              :variant="isHorizontalNavGroupActive(group) ? 'tonal' : 'text'"
              :color="isHorizontalNavGroupActive(group) ? 'primary' : 'default'"
              rounded="pill"
              class="theme-horizontal-nav__item"
            >
              {{ group.title }}
            </VBtn>
          </template>

          <VList class="theme-horizontal-nav__menu" min-width="13rem" density="comfortable">
            <template v-for="item in group.items" :key="`${group.title}-${item.title}-${item.to}`">
              <VMenu
                v-if="hasHorizontalDynamicTabs(item)"
                location="end top"
                offset="8"
                open-on-hover
                :open-delay="0"
                :close-delay="120"
                :close-on-content-click="true"
              >
                <template #activator="{ props: subMenuProps }">
                  <VListItem
                    v-bind="subMenuProps"
                    :active="isHorizontalNavActive(item)"
                    class="theme-horizontal-nav__submenu-activator"
                  >
                    <template #prepend>
                      <VIcon :icon="String(item.icon || '')" />
                    </template>
                    <VListItemTitle>{{ item.full_title || item.title }}</VListItemTitle>
                    <template #append>
                      <VIcon icon="mdi-chevron-right" size="small" />
                    </template>
                  </VListItem>
                </template>

                <VList class="theme-horizontal-nav__submenu" min-width="12rem" density="comfortable">
                  <VListItem
                    v-for="tab in getHorizontalNavTabs(item)"
                    :key="`${item.to}-${tab.tab}`"
                    :active="isHorizontalDynamicTabActive(tab)"
                    @click="handleHorizontalDynamicTabSelect(item, tab)"
                  >
                    <template #prepend>
                      <VIcon :icon="getHorizontalTabIcon(tab)" />
                    </template>
                    <VListItemTitle>{{ tab.title }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>

              <VListItem
                v-else
                :to="item.to || undefined"
                :active="isHorizontalNavActive(item)"
                @click="closeHorizontalNavGroup"
              >
                <template #prepend>
                  <VIcon :icon="String(item.icon || '')" />
                </template>
                <VListItemTitle>{{ item.full_title || item.title }}</VListItemTitle>
              </VListItem>
            </template>
          </VList>
        </VMenu>
        <div v-if="visibleHorizontalHeaderButtons.length" class="theme-horizontal-nav__actions">
          <VBtn
            v-for="button in visibleHorizontalHeaderButtons"
            :key="button.icon"
            :icon="button.icon"
            :variant="button.variant || 'text'"
            :color="resolveHeaderButtonColor(button)"
            :size="button.size || 'default'"
            :class="button.class || 'settings-icon-button'"
            :loading="resolveHeaderButtonLoading(button)"
            :data-menu-activator="button.dataAttr"
            @click="handleHeaderButtonClick(button)"
          />
        </div>
      </div>
    </template>

    <template #vertical-nav-content>
      <VerticalNavLink v-for="item in startMenus" :item="item" />
      <!-- 👉 发现 -->
      <VerticalNavSectionTitle
        v-if="discoveryMenus.length > 0"
        :item="{
          heading: t('menu.discovery'),
        }"
      />
      <VerticalNavLink v-for="item in discoveryMenus" :item="item" />
      <!-- 👉 订阅 -->
      <VerticalNavSectionTitle
        v-if="subscribeMenus.length > 0"
        :item="{
          heading: t('menu.subscribe'),
        }"
      />
      <VerticalNavLink v-for="item in subscribeMenus" :item="item" />
      <!-- 👉 整理 -->
      <VerticalNavSectionTitle
        v-if="organizeMenus.length > 0"
        :item="{
          heading: t('menu.organize'),
        }"
      />
      <VerticalNavLink v-for="item in organizeMenus" :item="item" />
      <!-- 👉 系统 -->
      <VerticalNavSectionTitle
        v-if="systemMenus.length > 0"
        :item="{
          heading: t('menu.system'),
        }"
      />
      <VerticalNavLink v-for="item in systemMenus" :item="item" />
    </template>

    <template #after-vertical-nav-items />

    <!-- 👉 Dynamic Header Tab -->
    <template #dynamic-header-tab>
      <div v-if="showDynamicHeaderTab">
        <HeaderTab
          :items="visibleDynamicHeaderTabItems"
          :model-value="dynamicHeaderTab!.modelValue"
          @update:model-value="handleTabChange"
        >
          <template #append>
            <template v-for="button in visibleDynamicHeaderButtons" :key="button.icon">
              <VBtn
                :icon="button.icon"
                :variant="button.variant || 'text'"
                :color="resolveHeaderButtonColor(button)"
                :size="button.size || 'default'"
                :class="button.class || 'settings-icon-button'"
                :loading="resolveHeaderButtonLoading(button)"
                :data-menu-activator="button.dataAttr"
                @click="handleHeaderButtonClick(button)"
              />
            </template>
          </template>
        </HeaderTab>
      </div>
    </template>

    <!-- 👉 下拉跟随动画 -->
    <div
      class="main-content-wrapper"
      :style="{
        transform: contentTransform,
        transition: contentTransition,
        paddingTop: mainContentPaddingTop,
      }"
    >
      <slot />
    </div>

    <!-- 👉 Footer -->
    <template #footer>
      <Footer :show-nav="!showPluginQuickAccess" />
    </template>
  </VerticalNavLayout>

  <!-- 👉 Plugin Quick Access -->
  <QuickAccess
    v-if="appMode"
    :visible="showPluginQuickAccess"
    :pull-distance="pullDistance"
    @close="handleClosePluginQuickAccess"
    @plugin-click="handlePluginClick"
  />

  <!-- 👉 Theme Customizer -->
  <ThemeCustomizer v-if="showThemeCustomizer" @close="showThemeCustomizer = false" />

  <!-- 👉 Agent Assistant -->
  <AgentAssistantWidget v-if="showAgentAssistant" />
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.main-content-wrapper {
  backface-visibility: hidden;
  block-size: 100%;
  inline-size: 100%;
  transform: translateZ(0);
  will-change: transform;
}

.theme-navbar-row--horizontal {
  gap: 1rem;
  margin-inline: 0 !important;
}

:deep(.layout-dynamic-header-tab) {
  padding-block-end: 0.25rem;
}

.theme-horizontal-logo {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  column-gap: 0.75rem;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
  text-decoration: none;
}

.theme-horizontal-logo__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  block-size: 2rem;
  inline-size: 2rem;
}

.theme-horizontal-logo__mark :deep(svg) {
  display: block;
  block-size: 1.8rem;
  inline-size: 1.8rem;
}

.theme-horizontal-logo__text {
  font-size: 1.125rem;
  white-space: nowrap;
}

.theme-navbar-actions--horizontal {
  gap: 0.85rem;

  :deep(.ms-2),
  :deep(.ms-3) {
    margin-inline-start: 0 !important;
  }

  :deep(.v-btn.v-btn--icon) {
    flex: 0 0 auto;
    border-radius: 12px;
    block-size: 2.75rem;
    color: rgba(var(--v-theme-on-surface), 0.78);
    inline-size: 2.75rem;
  }

  :deep(.v-btn.v-btn--icon .v-icon) {
    font-size: 1.75rem;
    line-height: 1;
  }

  :deep(.v-avatar.cursor-pointer) {
    flex: 0 0 auto;
    block-size: 2.75rem !important;
    inline-size: 2.75rem !important;
    margin-inline-start: 0 !important;
  }
}

.theme-horizontal-nav {
  display: flex;
  align-items: center;
  block-size: 3.25rem;
  gap: 0.25rem;
  overflow-x: auto;
  padding-block: 0.25rem 0.5rem;
  padding-inline: 0.5rem;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.theme-horizontal-nav__item {
  flex: 0 0 auto;
  letter-spacing: 0;
}

.theme-horizontal-nav__menu,
.theme-horizontal-nav__submenu {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.theme-horizontal-nav__submenu-activator {
  cursor: pointer;
}

.theme-horizontal-nav__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  margin-inline-start: auto;
}

</style>
