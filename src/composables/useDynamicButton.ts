import {
  computed,
  inject,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  ref,
  unref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue'
import type { UserPermissionFeatureKey, UserPermissionKey } from '@/utils/permission'

// 声明全局变量类型
declare global {
  interface Window {
    __VUE_INJECT_DYNAMIC_BUTTON__?: (button: any) => void
    __VUE_UNINJECT_DYNAMIC_BUTTON__?: () => void
  }
}

type MaybeRefValue<T> = T | Ref<T> | ComputedRef<T>

export interface DynamicButtonMenuItem {
  title?: string
  titleKey?: string
  titleParams?: Record<string, unknown>
  icon?: string
  color?: string
  permission?: UserPermissionKey
  feature?: UserPermissionFeatureKey
  disabled?: boolean
  action: () => void
}

function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined): T | undefined
function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined, fallback: T): T
function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined, fallback?: T) {
  return value !== undefined ? unref(value) : fallback
}

/**
 * 动态按钮钩子函数
 *
 * @param options 配置选项
 * @returns 控制函数和状态
 *
 * @example
 * // 在页面中使用
 * const { openDialog } = useDynamicButton({
 *   icon: 'mdi-cog',
 *   onClick: () => {
 *     dialog.value = true
 *   }
 * })
 */
export function useDynamicButton(options: {
  icon: MaybeRefValue<string>
  onClick?: () => void
  menuItems?: MaybeRefValue<DynamicButtonMenuItem[] | undefined>
  permission?: UserPermissionKey
  feature?: UserPermissionFeatureKey
  show?: MaybeRefValue<boolean>
  autoRegister?: boolean // 是否自动注册，默认为true
}) {
  // 提取配置
  const { icon, onClick, menuItems, permission, feature, show, autoRegister = true } = options

  // 动态按钮相关
  const registerDynamicButton = inject<((button: any) => void) | null>('registerDynamicButton', null)
  const unregisterDynamicButton = inject<(() => void) | null>('unregisterDynamicButton', null)

  // 按钮注册状态
  const dynamicButtonRegistered = ref(false)
  const componentActive = ref(false)

  const resolvedIcon = computed(() => resolveMaybeRef(icon, 'mdi-plus'))
  const resolvedShow = computed(() => resolveMaybeRef(show, true))
  const resolvedMenuItems = computed(() => resolveMaybeRef(menuItems))

  /** 根据当前响应式配置生成可注册的动态按钮对象。 */
  function buildDynamicButton() {
    const buttonMenuItems = resolvedMenuItems.value

    return {
      icon: resolvedIcon.value,
      action: onClick || (() => {}),
      permission,
      feature,
      show: resolvedShow.value,
      menuItems: buttonMenuItems && buttonMenuItems.length > 0 ? buttonMenuItems : undefined,
    }
  }

  /** 在当前页面激活时注册动态按钮。 */
  function setupDynamicButton() {
    if (!componentActive.value) return

    const button = buildDynamicButton()

    if (!button.show) {
      cleanupDynamicButton()
      return
    }

    // 确保注册方法存在
    if (!registerDynamicButton) {
      // 尝试获取全局注册方法
      const tryUseGlobalMethod = () => {
        if (!componentActive.value) return false

        if (typeof window !== 'undefined' && window.__VUE_INJECT_DYNAMIC_BUTTON__) {
          window.__VUE_INJECT_DYNAMIC_BUTTON__(button)
          dynamicButtonRegistered.value = true
          return true
        }
        return false
      }

      // 立即尝试一次
      if (!tryUseGlobalMethod()) {
        // 如果失败，延迟再试一次
        setTimeout(tryUseGlobalMethod, 1000)
      }
      return
    }

    // 如果注册方法存在，直接注册
    nextTick(() => {
      if (!componentActive.value) return

      registerDynamicButton(button)
      dynamicButtonRegistered.value = true
    })
  }

  /** 清理当前页面注册过的动态按钮。 */
  function cleanupDynamicButton() {
    if (unregisterDynamicButton && dynamicButtonRegistered.value) {
      unregisterDynamicButton()
      dynamicButtonRegistered.value = false
      return
    }

    if (typeof window !== 'undefined' && window.__VUE_UNINJECT_DYNAMIC_BUTTON__) {
      window.__VUE_UNINJECT_DYNAMIC_BUTTON__()
      dynamicButtonRegistered.value = false
    }
  }

  /** 手动触发动态按钮主操作。 */
  function openDialog() {
    onClick?.()
  }

  // 生命周期钩子
  if (autoRegister) {
    onMounted(() => {
      componentActive.value = true
      // 延迟执行，确保Footer组件已加载
      setTimeout(() => {
        setupDynamicButton()
      }, 500)
    })

    onActivated(() => {
      componentActive.value = true
      // 重置注册状态，确保每次激活时都重新注册
      dynamicButtonRegistered.value = false
      setupDynamicButton()
    })

    onDeactivated(() => {
      componentActive.value = false
      cleanupDynamicButton()
    })

    onUnmounted(() => {
      componentActive.value = false
      cleanupDynamicButton()
    })

    watch([resolvedIcon, resolvedShow, resolvedMenuItems, () => permission], () => {
      if (!componentActive.value) return

      setupDynamicButton()
    }, { deep: true })
  }

  // 返回控制函数和状态
  return {
    setupDynamicButton, // 手动注册按钮
    cleanupDynamicButton, // 手动取消注册
    openDialog, // 手动触发点击事件
    isRegistered: dynamicButtonRegistered, // 注册状态
  }
}
