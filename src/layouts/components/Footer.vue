<script setup lang="ts">
import { getNavMenus } from '@/router/i18n-menu'
import { useDisplay } from 'vuetify'
import { NavMenu } from '@/@layouts/types'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores'
import { filterMenusByPermission } from '@/utils/permission'
import { usePWA } from '@/composables/usePWA'

// 是否显示的输入参数
defineProps({
  showNav: {
    type: Boolean,
    default: true,
  },
})


const display = useDisplay()
// PWA模式检测
const { appMode } = usePWA()
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

  return {
    is_superuser: userStore.superUser,
    ...userStore.permissions,
  }
})

// 获取导航菜单
const navMenus = computed(() => {
  const allMenus = getNavMenus()
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
    // 当路由变化时，清除动态按钮
    dynamicButton.value = null
  },
  { immediate: false },
)

// 动态按钮相关
// 定义动态按钮类型
interface DynamicButton {
  icon: string
  action: () => void
  show: boolean
  routePath?: string // 添加路径属性，用于标识哪个路由注册的
}

// 提供动态按钮注册和获取的方法
const dynamicButton = ref<DynamicButton | null>(null)

// 提供一个方法让其他组件注册动态按钮
const registerDynamicButton = (button: DynamicButton) => {
  // 保存注册按钮的路由路径
  button.routePath = route.path
  dynamicButton.value = button
}

// 提供一个方法让其他组件取消注册动态按钮
const unregisterDynamicButton = () => {
  dynamicButton.value = null
}

// 添加全局注册方法，解决注入不可用的问题
if (typeof window !== 'undefined') {
  // 确保在浏览器环境中
  ;(window as any).__VUE_INJECT_DYNAMIC_BUTTON__ = registerDynamicButton
}

// 提供给其他组件使用
provide('registerDynamicButton', registerDynamicButton)
provide('unregisterDynamicButton', unregisterDynamicButton)

// 在组件销毁时清理
onUnmounted(() => {
  dynamicButton.value = null
  // 清理全局方法
  if (typeof window !== 'undefined') {
    delete (window as any).__VUE_INJECT_DYNAMIC_BUTTON__
  }
})

// 显示动态按钮
const showDynamicButton = computed(() => {
  return (
    dynamicButton.value &&
    dynamicButton.value.show &&
    // 确保只在注册的路由路径下显示按钮
    (!dynamicButton.value.routePath || dynamicButton.value.routePath === route.path)
  )
})
</script>

<template>
  <Teleport v-if="appMode && showNav" to="body">
    <div class="footer-nav-container">
      <VCard elevation="3" class="footer-nav-card border" rounded="pill" :class="{ 'shift-left': showDynamicButton }">
        <VCardText class="footer-card-content">
          <!-- 添加指示器 -->
          <div ref="indicator" class="nav-indicator"></div>
          <VBtnToggle class="footer-btn-group" :mandatory="true" v-model="currentMenu">
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
            >
              <div class="btn-content">
                <VIcon icon="mdi-dots-horizontal" size="32"></VIcon>
                <span v-if="!isEnglish" class="text-xs">{{ t('nav.more') }}</span>
              </div>
            </VBtn>
          </VBtnToggle>
        </VCardText>
      </VCard>
      <Transition name="fade-slide">
        <VCard v-if="showDynamicButton" elevation="3" class="footer-nav-card dynamic-btn-card border" rounded="pill">
          <VCardText class="footer-card-content">
            <!-- 各页面的动态按钮 -->
            <VBtn
              icon
              variant="text"
              :ripple="false"
              @click="dynamicButton?.action()"
              rounded="pill"
              class="footer-nav-btn"
            >
              <VIcon color="secondary" :icon="dynamicButton?.icon || 'mdi-plus'" size="28"></VIcon>
            </VBtn>
          </VCardText>
        </VCard>
      </Transition>
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

  // 按钮卡片之间的间距
  > .v-card + .v-card {
    margin-inline-start: 2px; // 减少间距
  }
}

.footer-nav-card {
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(24px);
  background-color: rgba(var(--v-theme-surface), 0.6);
  pointer-events: auto;
  transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);

  // 透明主题下的特殊样式
  .v-theme--transparent & {
    backdrop-filter: blur(var(--transparent-blur-heavy, 16px));
    background-color: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy, 0.5));
  }

  &.shift-left {
    transform: translateX(0);
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

.footer-btn-group {
  position: relative;
  display: flex;
  justify-content: space-around;
  border: none;
  background-color: transparent;
  inline-size: 100%;
}

.footer-nav-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  block-size: 48px;

  &.v-btn--active {
    background-color: transparent;
    box-shadow: none;
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
      transform-origin: center;
      white-space: nowrap;
    }
  }
}

// 动态按钮卡片样式
.dynamic-btn-card {
  block-size: auto;
  inline-size: auto;
  min-block-size: 0;

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

// 淡入滑动动画
.fade-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
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
