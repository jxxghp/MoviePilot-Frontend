<script setup lang="ts">
import { getNavMenus } from '@/router/i18n-menu'
import { NavMenu } from '@/@layouts/types'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores'
import {
  buildUserPermissionContext,
  filterItemsByPermission,
  filterMenusByPermission,
  hasItemPermission,
} from '@/utils/permission'
import { useLaunchLoading } from '@/composables/useLaunchLoading'
import { usePWA } from '@/composables/usePWA'
import {
  dynamicButtonRegistry,
  type DynamicButtonRegister,
  type DynamicButtonUnregister,
} from '@/composables/dynamicButtonRegistry'
import type { DynamicButtonMenuItem } from '@/composables/useDynamicButton'

const { register: registerSharedDynamicButton, unregister: unregisterSharedDynamicButton } = dynamicButtonRegistry

// 是否显示的输入参数
const props = defineProps({
  showNav: {
    type: Boolean,
    default: true,
  },
})

// PWA模式检测
const { appMode } = usePWA()
const { isLaunchLoading } = useLaunchLoading()
const { t, locale } = useI18n()

// 判断当前是否为英文环境
const isEnglish = computed(() => locale.value === 'en-US')

const route = useRoute()

// 用户Store
const userStore = useUserStore()

// 获取用户权限信息
const userPermissions = computed(() => {
  // 确保用户已认证且信息已加载
  if (!userStore || userStore.userID === -1) {
    return {
      is_superuser: false,
      discovery: false,
      search: false,
      subscribe: false,
      manage: false,
    }
  }

  return buildUserPermissionContext(userStore.superUser, userStore.permissions)
})

// 获取导航菜单
const navMenus = computed(() => {
  const allMenus = getNavMenus(t)
  return filterMenusByPermission(allMenus, userPermissions.value)
})

// 根据当前路径获取匹配的菜单路径
function getMenuPathFromRoute(path: string): string {
  const matchedMenu = navMenus.value.find((menu: NavMenu) => menu.footer === true && path.startsWith(menu.to as string))
  return matchedMenu ? (matchedMenu.to as string) : '/apps'
}

// 当前选中的菜单，初始值基于当前路由
const currentMenu = ref<string>(getMenuPathFromRoute(route.path))

// 过滤出底部菜单项
const footerMenus = computed(() => {
  // 获取所有有权限的菜单
  const allAuthorizedMenus = navMenus.value

  // 优先获取有 footer: true 属性的菜单
  const footerMenusWithProperty = allAuthorizedMenus.filter((menu: NavMenu) => menu.footer === true)

  // 设置期望的底部菜单数量（不包括"更多"按钮）
  // 一般来说，底部导航栏显示 3-4 个主要功能比较合适
  const expectedFooterMenuCount = 3

  // 如果有 footer 属性的菜单已经足够，优先显示它们
  if (footerMenusWithProperty.length >= expectedFooterMenuCount) {
    return footerMenusWithProperty.slice(0, expectedFooterMenuCount)
  }

  // 如果不够，从没有 footer 属性或 footer 为 false 的菜单中补充
  // 优先选择一些常用的功能菜单
  const nonFooterMenus = allAuthorizedMenus.filter(
    (menu: NavMenu) =>
      menu.footer !== true &&
      // 排除已经在 footerMenusWithProperty 中的菜单
      !footerMenusWithProperty.some(footerMenu => footerMenu.to === menu.to),
  )

  // 计算还需要多少个菜单
  const needCount = expectedFooterMenuCount - footerMenusWithProperty.length

  // 合并菜单：优先显示有 footer 属性的，然后按菜单定义顺序添加其他菜单
  let finalMenus = [...footerMenusWithProperty, ...nonFooterMenus.slice(0, needCount)]

  // 确保至少有一个菜单显示，如果都没有权限，则显示第一个有权限的菜单
  if (finalMenus.length === 0 && allAuthorizedMenus.length > 0) {
    finalMenus = [allAuthorizedMenus[0]]
  }

  return finalMenus
})

// 监听路由变化来更新currentMenu
watch(
  () => route.path,
  newPath => {
    currentMenu.value = getMenuPathFromRoute(newPath)
    // 路由离开后立即撤销旧命令；新页面可在同一状态窗口直接替换它。
    const registration = dynamicButtonRegistry.registration.value
    if (registration?.button.routePath && registration.button.routePath !== newPath) {
      unregisterSharedDynamicButton(registration.ownerId ?? undefined)
    }
  },
  { immediate: false },
)

// 动态按钮相关
const dynamicButton = computed(() => dynamicButtonRegistry.registration.value?.button ?? null)

/** 注册动态按钮并补齐旧 global bridge 未携带的路由归属。 */
const registerDynamicButton: DynamicButtonRegister = (button, ownerId) => {
  registerSharedDynamicButton(
    {
      ...button,
      routePath: button.routePath ?? route.path,
    },
    ownerId,
  )
}

/** 仅注销仍由指定页面持有的动态按钮；无 owner 时保留旧 bridge 的清空语义。 */
const unregisterDynamicButton: DynamicButtonUnregister = ownerId => {
  unregisterSharedDynamicButton(ownerId)
}

// 添加全局注册方法，解决注入不可用的问题
if (typeof window !== 'undefined') {
  // 确保在浏览器环境中
  window.__VUE_INJECT_DYNAMIC_BUTTON__ = registerDynamicButton
  window.__VUE_UNINJECT_DYNAMIC_BUTTON__ = unregisterDynamicButton
}

// 提供给其他组件使用
provide('registerDynamicButton', registerDynamicButton)
provide('unregisterDynamicButton', unregisterDynamicButton)
provide('dynamicButton', dynamicButton)

// 在组件销毁时清理
onUnmounted(() => {
  if (typeof window === 'undefined') return

  const ownsRegisterBridge = window.__VUE_INJECT_DYNAMIC_BUTTON__ === registerDynamicButton
  const ownsUnregisterBridge = window.__VUE_UNINJECT_DYNAMIC_BUTTON__ === unregisterDynamicButton

  // 旧 Footer 可能晚于新 Footer 销毁，只有仍拥有完整 bridge 的实例才能清理共享注册。
  if (ownsRegisterBridge && ownsUnregisterBridge) {
    const registration = dynamicButtonRegistry.registration.value
    if (registration) unregisterSharedDynamicButton(registration.ownerId ?? undefined)
  }

  if (ownsRegisterBridge) {
    delete window.__VUE_INJECT_DYNAMIC_BUTTON__
  }
  if (ownsUnregisterBridge) {
    delete window.__VUE_UNINJECT_DYNAMIC_BUTTON__
  }
})

const isDynamicButtonOnCurrentRoute = computed(
  () => !dynamicButton.value?.routePath || dynamicButton.value.routePath === route.path,
)

// 显示动态按钮
const showDynamicButton = computed(() => {
  return (
    dynamicButton.value &&
    dynamicButton.value.show &&
    hasItemPermission(dynamicButton.value, userPermissions.value) &&
    isDynamicButtonOnCurrentRoute.value
  )
})

const visibleDynamicButtonMenuItems = computed(() => {
  if (!showDynamicButton.value) return []

  return filterItemsByPermission(dynamicButton.value?.menuItems ?? [], userPermissions.value)
})

const hasDynamicButtonMenu = computed(() => visibleDynamicButtonMenuItems.value.length > 0)
const isAccessoryVisible = ref(false)
const accessoryIcon = ref('mdi-plus')
let accessoryExitTimer: ReturnType<typeof setTimeout> | undefined

// 路由的异步组件可能稍晚注册命令；只给外形一个120ms交接窗口，旧操作及菜单立即失效。
watch(
  () => [showDynamicButton.value, hasDynamicButtonMenu.value, dynamicButton.value?.icon] as const,
  ([visible, hasMenu, icon]) => {
    if (visible) {
      clearTimeout(accessoryExitTimer)
      accessoryExitTimer = undefined
      accessoryIcon.value = hasMenu ? 'mdi-chevron-up' : icon || 'mdi-plus'
      isAccessoryVisible.value = true
    } else if (isAccessoryVisible.value && accessoryExitTimer === undefined) {
      accessoryExitTimer = setTimeout(() => {
        isAccessoryVisible.value = false
        accessoryExitTimer = undefined
      }, 120)
    }
  },
  { immediate: true, flush: 'sync' },
)
onUnmounted(() => clearTimeout(accessoryExitTimer))

const shouldRenderFooterNav = computed(() => appMode.value && props.showNav)
const shouldRevealFooterNav = computed(() => shouldRenderFooterNav.value && !isLaunchLoading.value)

const legacyDynamicMenuTitleKeyMap: Record<string, string> = {
  'components.subscribeHistory.title': 'dialog.subscribeHistory.title',
  'components.subscribeEdit.titleDefault': 'dialog.subscribeEdit.titleDefault',
  'components.transferQueue.title': 'dialog.transferQueue.title',
  'components.pluginMarketSetting.title': 'dialog.pluginMarketSetting.title',
}

// 解析动态按钮菜单项标题，兼容旧版直接传入 i18n key 的写法。
function resolveDynamicMenuItemTitle(item: DynamicButtonMenuItem) {
  if (item.titleKey) {
    return t(item.titleKey, item.titleParams ?? {})
  }

  if (!item.title) {
    return ''
  }

  const normalizedTitleKey = legacyDynamicMenuTitleKeyMap[item.title] || item.title
  const looksLikeI18nKey = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$/i.test(normalizedTitleKey)

  return looksLikeI18nKey ? t(normalizedTitleKey, item.titleParams ?? {}) : item.title
}

// 处理页面注册的动态按钮主操作点击。
function handleDynamicButtonClick() {
  if (
    !showDynamicButton.value ||
    !dynamicButton.value ||
    !hasItemPermission(dynamicButton.value, userPermissions.value)
  ) {
    return
  }

  dynamicButton.value.action()
}

// 处理页面注册的动态按钮菜单项点击。
function handleDynamicMenuItemClick(item: DynamicButtonMenuItem) {
  if (
    !showDynamicButton.value ||
    !visibleDynamicButtonMenuItems.value.includes(item) ||
    item.disabled ||
    !hasItemPermission(item, userPermissions.value)
  ) {
    return
  }

  item.action()
}
</script>

<template>
  <Teleport v-if="shouldRenderFooterNav" to="body">
    <div v-show="shouldRevealFooterNav" class="footer-nav-container">
      <div class="footer-nav-group">
        <VCard
          key="main-nav"
          data-footer-nav-role="primary"
          elevation="3"
          class="footer-nav-card border"
          rounded="pill"
        >
          <VCardText class="footer-card-content">
            <!-- 添加指示器 -->
            <div ref="indicator" class="nav-indicator"></div>
            <VBtnToggle class="footer-btn-group" :mandatory="true" variant="plain" v-model="currentMenu">
              <!-- 遍历底部菜单项 -->
              <VBtn
                v-for="menu in footerMenus"
                :key="menu.to"
                :to="menu.to"
                :variant="currentMenu === menu.to ? 'text' : 'plain'"
                color="primary"
                :ripple="false"
                class="footer-nav-btn"
                rounded="pill"
                :class="{ 'footer-nav-btn-active': currentMenu === menu.to }"
                :value="menu.to"
                :aria-label="menu.title"
              >
                <div class="btn-content">
                  <VIcon :icon="menu.icon" size="32"></VIcon>
                  <span v-if="!isEnglish" class="text-xs">{{ menu.title }}</span>
                </div>
              </VBtn>

              <!-- 更多按钮 -->
              <VBtn
                :variant="currentMenu === '/apps' ? 'text' : 'plain'"
                color="primary"
                :ripple="false"
                to="/apps"
                rounded="pill"
                class="footer-nav-btn"
                :class="{ 'footer-nav-btn-active': currentMenu === '/apps' }"
                value="/apps"
                :aria-label="t('nav.more')"
              >
                <div class="btn-content">
                  <VIcon icon="mdi-dots-horizontal" size="32"></VIcon>
                  <span v-if="!isEnglish" class="text-xs">{{ t('nav.more') }}</span>
                </div>
              </VBtn>
            </VBtnToggle>
          </VCardText>
        </VCard>
        <VCard
          key="dynamic-btn"
          data-footer-nav-role="accessory"
          elevation="3"
          class="footer-nav-card dynamic-btn-card border"
          :class="{ 'footer-nav-card--collapsed': !isAccessoryVisible }"
          :aria-hidden="showDynamicButton ? undefined : 'true'"
          rounded="pill"
        >
          <VCardText class="footer-card-content">
            <!-- 各页面的动态按钮 -->
            <div class="dynamic-btn-activator">
              <VBtn
                icon
                variant="text"
                :ripple="false"
                :disabled="!showDynamicButton"
                :tabindex="showDynamicButton ? undefined : -1"
                @click="!hasDynamicButtonMenu && handleDynamicButtonClick()"
                rounded="pill"
                class="footer-nav-btn"
              >
                <VIcon color="secondary" :icon="accessoryIcon" size="28"></VIcon>
              </VBtn>
              <VMenu v-if="hasDynamicButtonMenu" activator="parent" location="top end" close-on-content-click>
                <VList>
                  <VListItem
                    v-for="(item, index) in visibleDynamicButtonMenuItems"
                    :key="item.titleKey || item.title || index"
                    :base-color="item.color"
                    :disabled="item.disabled"
                    @click="handleDynamicMenuItemClick(item)"
                  >
                    <template #prepend>
                      <VIcon v-if="item.icon" :icon="item.icon" />
                    </template>
                    <VListItemTitle>{{ resolveDynamicMenuItemTitle(item) }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </div>
          </VCardText>
        </VCard>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss">
.footer-nav-container {
  position: fixed;
  z-index: 1999;
  display: flex;
  align-items: center;
  justify-content: center;
  inset-block-end: 0;
  inset-inline: 0;
  padding-block-end: calc(6px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}

// 移动端两个设置面板都是全屏展示，打开时隐藏底部导航，避免不可见控件继续参与焦点和合成。
html[data-theme-customizer-open='true'],
html[data-agent-assistant-open='true'] {
  .footer-nav-container {
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
  }
}

.footer-nav-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.footer-nav-card {
  // 主导航和动态按钮共同参与组宽度计算，禁止 Flex 收缩，确保整体组件按真实宽度居中。
  flex: 0 0 auto;
  position: relative;
  overflow: hidden;
  border-radius: 9999px !important;
  backdrop-filter: blur(24px);
  background-color: rgba(var(--v-theme-surface), 0.6);
  pointer-events: auto;
  transition:
    border-radius 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    max-inline-size 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    opacity 0.2s ease,
    transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  will-change: transform, max-inline-size, opacity;

  --app-control-radius: var(--app-vuetify-rounded-pill);
  --app-surface-radius: var(--app-vuetify-rounded-pill);

  // 透明主题下的特殊样式
  .v-theme--transparent & {
    backdrop-filter: blur(var(--transparent-blur-heavy, 16px));
    background-color: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy, 0.5));
  }

  .v-btn-toggle {
    block-size: auto;
    min-block-size: 56px;
  }
}

.footer-card-content {
  position: relative;
  padding-block: 4px;
  padding-inline: 6px;
}

.footer-nav-card .footer-btn-group.v-btn-group {
  position: relative;
  display: flex;
  justify-content: space-around;
  border: none;
  border-radius: 9999px !important;
  background-color: transparent;
  box-shadow: none !important;
  inline-size: 100%;

  &:hover {
    box-shadow: none !important;
  }
}

.footer-nav-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  border-radius: 9999px !important;
  background-color: transparent;
  block-size: 48px;
  box-shadow: none !important;

  &:hover,
  &.v-btn--active {
    background-color: transparent;
    box-shadow: none !important;
  }

  .btn-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    inline-size: 100%;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

// 动态按钮卡片样式
.dynamic-btn-card {
  block-size: 48px;
  inline-size: auto;
  max-inline-size: 60px;
  min-block-size: 0;
  transition:
    flex-basis var(--mp-motion-duration-overlay, 160ms) var(--mp-motion-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1)),
    max-inline-size var(--mp-motion-duration-overlay, 160ms)
      var(--mp-motion-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1)),
    opacity 120ms var(--mp-motion-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1)),
    transform var(--mp-motion-duration-overlay, 160ms) var(--mp-motion-ease-standard, cubic-bezier(0.2, 0.8, 0.2, 1));
  will-change: flex-basis, max-inline-size, opacity, transform;

  .footer-card-content {
    padding: 3px;
  }

  .footer-nav-btn {
    padding: 0;
    block-size: 40px;
    inline-size: 40px;
    min-inline-size: 40px;

    .btn-content {
      margin: 0;
    }

    .v-icon {
      margin-block-end: 0;
    }
  }
}

// 动态按钮容器常驻 Dock；折叠态不占横向空间，也不让隐藏控件参与点击或焦点。
.footer-nav-card.dynamic-btn-card.footer-nav-card--collapsed {
  flex-basis: 0 !important;
  min-inline-size: 0 !important;
  max-inline-size: 0 !important;
  border-width: 0 !important;
  opacity: 0;
  pointer-events: none;
  transform: translateX(8px);

  .footer-card-content {
    padding-inline: 0;
  }
}

.footer-nav-group:has(.footer-nav-card--collapsed) {
  gap: 0;
}

[dir='rtl'] .footer-nav-card.dynamic-btn-card.footer-nav-card--collapsed {
  transform: translateX(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .footer-nav-card {
    transition-duration: 0.01ms !important;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
</style>
