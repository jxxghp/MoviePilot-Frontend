import type { ComputedRef, Ref } from 'vue'
import { useTabStateRestore } from '@/composables/useStateRestore'
import type { UserPermissionFeatureKey, UserPermissionKey } from '@/utils/permission'

/** 页内标签附属按钮，回调只保留在当前页面。 */
interface DynamicHeaderTabButton {
  /** 原生与辅助功能可使用的操作文案；旧页面可省略。 */
  title?: string
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
  disabled?: boolean | ComputedRef<boolean>
  dataAttr?: string // 用于VMenu定位的data属性
}

/** 页内分类声明；网页与原生均使用相同权限条件。 */
interface DynamicHeaderTabItem {
  title: string
  icon?: string
  tab: string
  permission?: UserPermissionKey
  feature?: UserPermissionFeatureKey
}

/** 由页面实例持有的当前标签注册，兼容旧模块省略 owner。 */
interface DynamicHeaderTabConfig {
  ownerId?: string
  items: DynamicHeaderTabItem[]
  modelValue: string
  appendButtons?: DynamicHeaderTabButton[]
  routePath?: string
  onUpdateModelValue?: (value: string) => void
}

declare global {
  interface Window {
    /** 与 inject 相同的跨模块注册，旧插件可省略 owner。 */
    __VUE_INJECT_DYNAMIC_HEADER_TAB__?: (config: DynamicHeaderTabConfig) => void
    /** 按路由和 owner 注销，防止旧实例清除新注册。 */
    __VUE_UNINJECT_DYNAMIC_HEADER_TAB__?: (routePath?: string, ownerId?: string) => void
  }
}

/** 提供页面动态头部标签的注册、状态恢复和注销能力。 */
export function useDynamicHeaderTab() {
  const route = useRoute()

  // 尝试从inject获取
  const registerDynamicHeaderTab = inject<(tab: DynamicHeaderTabConfig) => void>('registerDynamicHeaderTab')
  const unregisterDynamicHeaderTab =
    inject<(routePath?: string, ownerId?: string) => void>('unregisterDynamicHeaderTab')
  let ownedConfig: DynamicHeaderTabConfig | undefined

  /** 注册当前页面的动态头部标签配置。 */
  const registerHeaderTab = (config: {
    items: DynamicHeaderTabItem[] | ComputedRef<DynamicHeaderTabItem[]> | Ref<DynamicHeaderTabItem[]>
    modelValue: Ref<string>
    appendButtons?: DynamicHeaderTabButton[]
    enableStateRestore?: boolean
  }) => {
    // 集成PWA状态恢复功能
    const enablePWARestore = config.enableStateRestore !== false // 默认启用
    const pwaTabState = enablePWARestore ? useTabStateRestore(config.modelValue.value) : null

    // 标记是否已经初始化过，避免重复恢复状态
    let isInitialized = false

    // 如果启用了PWA状态恢复，先尝试恢复状态（仅在首次初始化时）
    if (pwaTabState && pwaTabState.activeTab.value && !isInitialized) {
      config.modelValue.value = pwaTabState.activeTab.value
      isInitialized = true
    }

    const tabConfig: DynamicHeaderTabConfig = {
      ownerId: `header:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`}`,
      items: Array.isArray(config.items) ? config.items : config.items.value,
      modelValue: config.modelValue.value,
      appendButtons: config.appendButtons,
      routePath: route.path,
      onUpdateModelValue: (value: string) => {
        config.modelValue.value = value
        // 同步到PWA状态
        if (pwaTabState && value) {
          pwaTabState.activeTab.value = value
        }
      },
    }
    ownedConfig = tabConfig
    let componentActive = false

    /** 仅激活且仍属于当前路径的页面能够替换注册，防止 KeepAlive 后台更新抢占导航。 */
    const publish = () => {
      if (!componentActive || tabConfig.routePath !== route.path) return
      if (registerDynamicHeaderTab) registerDynamicHeaderTab(tabConfig)
      else if (typeof window !== 'undefined') window.__VUE_INJECT_DYNAMIC_HEADER_TAB__?.(tabConfig)
    }

    // 如果启用了PWA状态恢复，监听PWA状态变化并同步到modelValue
    // 但只在非激活状态下响应，避免干扰页面激活时的状态
    if (pwaTabState) {
      watch(pwaTabState.activeTab, newTab => {
        if (newTab && newTab !== config.modelValue.value) {
          config.modelValue.value = newTab
          // 更新tabConfig并重新注册
          tabConfig.modelValue = newTab
          publish()
        }
      })
    }

    // 监听modelValue变化并更新配置
    watch(config.modelValue, newValue => {
      tabConfig.modelValue = newValue
      // 同步到PWA状态
      if (pwaTabState && newValue) {
        pwaTabState.activeTab.value = newValue
      }
      // 重新注册以更新值
      publish()
    })

    // 如果items是computed或ref，也需要监听其变化
    if (!Array.isArray(config.items)) {
      watch(
        config.items,
        newItems => {
          tabConfig.items = newItems
          // 重新注册以更新items
          publish()
        },
        { deep: true },
      )
    }

    /** 激活时重新读取实际状态，并将这次注册绑定到当前路由。 */
    const doRegister = () => {
      componentActive = true
      // 确保路由路径是最新的
      tabConfig.routePath = route.path
      // 确保items是最新的
      tabConfig.items = Array.isArray(config.items) ? config.items : config.items.value
      // 确保modelValue是最新的
      tabConfig.modelValue = config.modelValue.value

      publish()
    }

    /** 离开时先停止响应式重注册，只按自己的 owner 释放当前注册。 */
    const doUnregister = () => {
      componentActive = false
      if (unregisterDynamicHeaderTab) {
        unregisterDynamicHeaderTab(tabConfig.routePath, tabConfig.ownerId)
      } else if (typeof window !== 'undefined') {
        window.__VUE_UNINJECT_DYNAMIC_HEADER_TAB__?.(tabConfig.routePath, tabConfig.ownerId)
      }
    }

    // 页签高度必须在页面首帧布局前确定，避免内容先渲染后再整体下移。
    onBeforeMount(() => {
      doRegister()
    })

    // 处理页面激活时重新注册（支持keep-alive缓存的页面）
    onActivated(() => {
      // 页面激活时，优先使用当前页面的实际状态，而不是恢复的PWA状态
      // 这样可以避免从后台切换回来时显示错误的标签页
      // 确保使用当前页面的实际modelValue，不受PWA状态恢复影响
      tabConfig.modelValue = config.modelValue.value
      // 同步当前状态到PWA存储，确保状态一致性
      if (pwaTabState && config.modelValue.value) {
        pwaTabState.activeTab.value = config.modelValue.value
      }
      doRegister()
    })

    // 处理页面失活时取消注册（支持keep-alive缓存的页面）
    onDeactivated(() => {
      doUnregister()
    })

    // 在组件卸载时取消注册
    onUnmounted(() => {
      doUnregister()
    })
  }

  /** 取消当前页面注册的动态头部标签。 */
  const unregisterHeaderTab = () => {
    if (unregisterDynamicHeaderTab) {
      if (ownedConfig) unregisterDynamicHeaderTab(ownedConfig.routePath, ownedConfig.ownerId)
    }
  }

  return {
    registerHeaderTab,
    unregisterHeaderTab,
  }
}

// 导出类型以供其他地方使用
export type { DynamicHeaderTabButton, DynamicHeaderTabItem, DynamicHeaderTabConfig }
