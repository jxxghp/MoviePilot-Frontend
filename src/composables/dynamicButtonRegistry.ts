import { shallowRef, type ShallowRef } from 'vue'
import type { UserPermissionFeatureKey, UserPermissionKey } from '@/utils/permission'

/** 页面附属命令菜单项；权限及禁用状态由 Dock 在执行前复核。 */
export interface DynamicButtonMenuItem {
  /** 无本地化键时使用的显示标题。 */
  title?: string
  /** 优先使用的本地化键。 */
  titleKey?: string
  /** 本地化标题插值。 */
  titleParams?: Record<string, unknown>
  /** 图标库标识。 */
  icon?: string
  /** 可选的语义颜色。 */
  color?: string
  /** 执行此命令所需的用户权限。 */
  permission?: UserPermissionKey
  /** 执行此命令所需的功能权限。 */
  feature?: UserPermissionFeatureKey
  /** 保留菜单项但禁止执行。 */
  disabled?: boolean
  /** 当前页面仍持有此命令时执行的操作。 */
  action: () => void
}

/** 当前路由对主 Dock 提供的单个附属按钮。 */
export interface DynamicButton {
  /** 图标库标识。 */
  icon: string
  /** 没有菜单时执行的主操作。 */
  action: () => void
  /** 显示及执行所需的用户权限。 */
  permission?: UserPermissionKey
  /** 显示及执行所需的功能权限。 */
  feature?: UserPermissionFeatureKey
  /** 页面是否需要显示此按钮。 */
  show: boolean
  /** 注册页面路径；离开该路径后操作立即失效。 */
  routePath?: string
  /** 可选的附属菜单，存在可见项时替代主操作。 */
  menuItems?: DynamicButtonMenuItem[]
}

/** 页面实例的跨模块所有权标识，避免旧实例注销新实例命令。 */
export type DynamicButtonOwnerId = string
/** 替换当前按钮；旧外部模块可省略 owner 以保持兼容。 */
export type DynamicButtonRegister = (button: DynamicButton, ownerId?: DynamicButtonOwnerId) => void
/** 有 owner 时只清除自身注册；省略 owner 保留旧桥接接口的全清语义。 */
export type DynamicButtonUnregister = (ownerId?: DynamicButtonOwnerId) => void

/** 当前操作及其持有者的原子快照。 */
export interface DynamicButtonRegistration {
  /** 当前有效的页面按钮。 */
  button: DynamicButton
  /** null 表示未声明所有者的兼容接口。 */
  ownerId: DynamicButtonOwnerId | null
}

/** 生命周期交接时仍保留同一响应式容器的命令注册表。 */
export interface DynamicButtonRegistry {
  /** 当前命令快照，只有 register/unregister 可以替换。 */
  registration: Readonly<ShallowRef<DynamicButtonRegistration | null>>
  /** 注册或替换页面命令。 */
  register: DynamicButtonRegister
  /** 按所有权注销页面命令。 */
  unregister: DynamicButtonUnregister
}

/** 将动态按钮的单一当前值与其页面所有者绑定，避免旧页面注销新页面的命令。 */
export function createDynamicButtonRegistry(): DynamicButtonRegistry {
  const registration = shallowRef<DynamicButtonRegistration | null>(null)

  const register: DynamicButtonRegister = (button, ownerId) => {
    registration.value = {
      button,
      ownerId: ownerId ?? null,
    }
  }

  const unregister: DynamicButtonUnregister = ownerId => {
    if (ownerId !== undefined && registration.value?.ownerId !== ownerId) return

    registration.value = null
  }

  return {
    registration,
    register,
    unregister,
  }
}

/** 主应用中 Footer 与页面共用的单一注册表，不建立额外等待队列。 */
export const dynamicButtonRegistry = createDynamicButtonRegistry()

declare global {
  interface Window {
    /** 跨模块联邦的按钮注册桥接入口。 */
    __VUE_INJECT_DYNAMIC_BUTTON__?: DynamicButtonRegister
    /** 跨模块联邦的所有权注销入口。 */
    __VUE_UNINJECT_DYNAMIC_BUTTON__?: DynamicButtonUnregister
  }
}
