import type { ComputedRef, Ref } from 'vue'

// 动态标签页相关类型
interface DynamicHeaderTabButton {
  icon: string
  color?: string | ComputedRef<string>
  variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
  size?: string
  class?: string
  action?: () => void
  show?: boolean | ComputedRef<boolean>
  dataAttr?: string // 用于VMenu定位的data属性
}

interface DynamicHeaderTabItem {
  title: string
  icon?: string
  tab: string
}

interface DynamicHeaderTabConfig {
  items: DynamicHeaderTabItem[]
  modelValue: string
  appendButtons?: DynamicHeaderTabButton[]
  routePath?: string
  onUpdateModelValue?: (value: string) => void
}

export function useDynamicHeaderTab() {
  const route = useRoute()

  // 尝试从inject获取
  const registerDynamicHeaderTab = inject<(tab: DynamicHeaderTabConfig) => void>('registerDynamicHeaderTab')
  const unregisterDynamicHeaderTab = inject<() => void>('unregisterDynamicHeaderTab')

  // 注册动态标签页
  const registerHeaderTab = (config: {
    items: DynamicHeaderTabItem[] | ComputedRef<DynamicHeaderTabItem[]> | Ref<DynamicHeaderTabItem[]>
    modelValue: Ref<string>
    appendButtons?: DynamicHeaderTabButton[]
  }) => {
    const tabConfig: DynamicHeaderTabConfig = {
      items: Array.isArray(config.items) ? config.items : config.items.value,
      modelValue: config.modelValue.value,
      appendButtons: config.appendButtons,
      routePath: route.path,
      onUpdateModelValue: (value: string) => {
        config.modelValue.value = value
      },
    }

    // 监听modelValue变化并更新配置
    watch(config.modelValue, newValue => {
      tabConfig.modelValue = newValue
      // 重新注册以更新值
      if (registerDynamicHeaderTab) {
        registerDynamicHeaderTab(tabConfig)
      } else if (typeof window !== 'undefined') {
        // 使用全局方法作为备用
        const globalRegister = (window as any).__VUE_INJECT_DYNAMIC_HEADER_TAB__
        if (globalRegister) {
          globalRegister(tabConfig)
        }
      }
    })

    // 如果items是computed或ref，也需要监听其变化
    if (!Array.isArray(config.items)) {
      watch(
        config.items,
        newItems => {
          tabConfig.items = newItems
          // 重新注册以更新items
          if (registerDynamicHeaderTab) {
            registerDynamicHeaderTab(tabConfig)
          } else if (typeof window !== 'undefined') {
            // 使用全局方法作为备用
            const globalRegister = (window as any).__VUE_INJECT_DYNAMIC_HEADER_TAB__
            if (globalRegister) {
              globalRegister(tabConfig)
            }
          }
        },
        { deep: true },
      )
    }

    // 注册函数
    const doRegister = () => {
      // 确保路由路径是最新的
      tabConfig.routePath = route.path
      // 确保items是最新的
      tabConfig.items = Array.isArray(config.items) ? config.items : config.items.value
      // 确保modelValue是最新的
      tabConfig.modelValue = config.modelValue.value

      if (registerDynamicHeaderTab) {
        registerDynamicHeaderTab(tabConfig)
      } else if (typeof window !== 'undefined') {
        // 使用全局方法作为备用
        const globalRegister = (window as any).__VUE_INJECT_DYNAMIC_HEADER_TAB__
        if (globalRegister) {
          globalRegister(tabConfig)
        }
      }
    }

    // 取消注册函数
    const doUnregister = () => {
      if (unregisterDynamicHeaderTab) {
        unregisterDynamicHeaderTab()
      }
    }

    // 初始注册（延迟到下个tick，确保路由已经完全切换）
    nextTick(() => {
      doRegister()
    })

    // 处理页面激活时重新注册（支持keep-alive缓存的页面）
    onActivated(() => {
      nextTick(() => {
        doRegister()
      })
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

  // 取消注册
  const unregisterHeaderTab = () => {
    if (unregisterDynamicHeaderTab) {
      unregisterDynamicHeaderTab()
    }
  }

  return {
    registerHeaderTab,
    unregisterHeaderTab,
  }
}

// 导出类型以供其他地方使用
export type { DynamicHeaderTabButton, DynamicHeaderTabItem, DynamicHeaderTabConfig }
