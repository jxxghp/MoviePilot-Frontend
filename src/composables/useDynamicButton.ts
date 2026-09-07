import {
  computed,
  inject,
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
import {
  dynamicButtonRegistry,
  type DynamicButton,
  type DynamicButtonMenuItem,
  type DynamicButtonOwnerId,
  type DynamicButtonRegister,
  type DynamicButtonUnregister,
} from '@/composables/dynamicButtonRegistry'
import type { UserPermissionFeatureKey, UserPermissionKey } from '@/utils/permission'

export type { DynamicButton, DynamicButtonMenuItem }

type MaybeRefValue<T> = T | Ref<T> | ComputedRef<T>

function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined): T | undefined
function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined, fallback: T): T
function resolveMaybeRef<T>(value: MaybeRefValue<T> | undefined, fallback?: T) {
  return value !== undefined ? unref(value) : fallback
}

let dynamicButtonOwnerSequence = 0

function createDynamicButtonOwnerId(): DynamicButtonOwnerId {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dynamic-button:${crypto.randomUUID()}`
  }

  dynamicButtonOwnerSequence += 1
  return `dynamic-button:${Date.now().toString(36)}:${dynamicButtonOwnerSequence.toString(36)}`
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

  const route = useRoute()
  const ownerId = createDynamicButtonOwnerId()
  const ownerRoutePath = route.path

  // 页面可能在 Footer 之前 setup；共享 registry 承接该窗口，global bridge 仍兼容外部模块。
  const injectedRegister = inject<DynamicButtonRegister | null>('registerDynamicButton', null)
  const injectedUnregister = inject<DynamicButtonUnregister | null>('unregisterDynamicButton', null)

  // 按钮注册状态
  const dynamicButtonRegistered = ref(false)
  const componentActive = ref(false)
  let registrationTarget: RegistrationTarget | null = null
  let globalBridgeRetryTimer: ReturnType<typeof setTimeout> | null = null
  let setupGeneration = 0

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
      routePath: ownerRoutePath,
      menuItems: buttonMenuItems && buttonMenuItems.length > 0 ? buttonMenuItems : undefined,
    }
  }

  type RegistrationTarget = {
    kind: 'inject' | 'global' | 'shared'
    register: DynamicButtonRegister
    unregister: DynamicButtonUnregister
  }

  const sharedRegistrationTarget: RegistrationTarget = {
    kind: 'shared',
    register: dynamicButtonRegistry.register,
    unregister: dynamicButtonRegistry.unregister,
  }

  function resolveRegistrationTarget(): RegistrationTarget {
    if (injectedRegister) {
      return {
        kind: 'inject',
        register: injectedRegister,
        unregister: injectedUnregister ?? (() => undefined),
      }
    }

    if (typeof window !== 'undefined' && window.__VUE_INJECT_DYNAMIC_BUTTON__) {
      return {
        kind: 'global',
        register: window.__VUE_INJECT_DYNAMIC_BUTTON__,
        unregister: window.__VUE_UNINJECT_DYNAMIC_BUTTON__ ?? (() => undefined),
      }
    }

    return sharedRegistrationTarget
  }

  function clearGlobalBridgeRetry() {
    if (globalBridgeRetryTimer === null) return

    clearTimeout(globalBridgeRetryTimer)
    globalBridgeRetryTimer = null
  }

  function commitRegistration(button: DynamicButton, target: RegistrationTarget) {
    if (registrationTarget && registrationTarget.kind !== target.kind) {
      registrationTarget.unregister(ownerId)
    }

    target.register(button, ownerId)
    registrationTarget = target
    dynamicButtonRegistered.value = true
  }

  function retryGlobalBridge(generation: number) {
    if (!componentActive.value || generation !== setupGeneration || registrationTarget?.kind !== 'shared') return
    // 交接窗口内新页面可以先注册；旧实例仍未卸载也不能重新夺回命令。
    if (dynamicButtonRegistry.registration.value?.ownerId !== ownerId || route.path !== ownerRoutePath) return

    const target = resolveRegistrationTarget()
    if (target.kind === 'shared') return

    commitRegistration(buildDynamicButton(), target)
  }

  function scheduleGlobalBridgeRetry(generation: number) {
    clearGlobalBridgeRetry()
    globalBridgeRetryTimer = setTimeout(() => {
      globalBridgeRetryTimer = null
      retryGlobalBridge(generation)
    }, 0)
  }

  /** 在当前页面激活时注册动态按钮。 */
  function setupDynamicButton() {
    const generation = ++setupGeneration
    if (!componentActive.value) return

    clearGlobalBridgeRetry()
    const button = buildDynamicButton()

    if (!button.show) {
      cleanupDynamicButton()
      return
    }

    const target = resolveRegistrationTarget()
    commitRegistration(button, target)

    if (target.kind === 'shared' && !injectedRegister) {
      scheduleGlobalBridgeRetry(generation)
    }
  }

  /** 清理当前页面注册过的动态按钮。 */
  function cleanupDynamicButton() {
    setupGeneration += 1
    clearGlobalBridgeRetry()

    registrationTarget?.unregister(ownerId)
    registrationTarget = null
    dynamicButtonRegistered.value = false
  }

  /** 手动触发动态按钮主操作。 */
  function openDialog() {
    onClick?.()
  }

  // 生命周期钩子
  if (autoRegister) {
    onMounted(() => {
      componentActive.value = true
      setupDynamicButton()
    })

    onActivated(() => {
      componentActive.value = true
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

    watch(
      [resolvedIcon, resolvedShow, resolvedMenuItems, () => permission],
      () => {
        if (!componentActive.value) return

        setupDynamicButton()
      },
      { deep: true },
    )
  }

  // 返回控制函数和状态
  return {
    setupDynamicButton, // 手动注册按钮
    cleanupDynamicButton, // 手动取消注册
    openDialog, // 手动触发点击事件
    isRegistered: dynamicButtonRegistered, // 注册状态
  }
}
