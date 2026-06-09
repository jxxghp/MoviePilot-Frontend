// 权限类型定义
export interface UserPermissions {
  discovery: boolean // 发现权限
  search: boolean // 搜索权限
  subscribe: boolean // 订阅权限
  manage: boolean // 管理权限
  admin?: boolean // 管理员权限，仅用于前端入口标识，实际由 is_superuser 决定
}

export type UserPermissionKey = keyof UserPermissions
export type UserPermissionContext = UserPermissions & { is_superuser?: boolean; [key: string]: unknown }
export type PermissionProtectedItem = { permission?: UserPermissionKey }

// 构造权限检查上下文，统一超级管理员标记与功能权限字段。
export function buildUserPermissionContext(isSuperuser: boolean, permissions: Partial<UserPermissions> = {}): UserPermissionContext {
  return {
    is_superuser: isSuperuser,
    ...DEFAULT_PERMISSIONS,
    ...permissions,
  }
}

// 默认权限配置
export const DEFAULT_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: false,
  admin: false,
}

// 管理员权限配置
export const ADMIN_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: true,
  admin: true,
}

// 权限检查函数
export function hasPermission(userPermissions: any, permission: UserPermissionKey): boolean {
  // 如果用户是超级用户，拥有所有权限
  if (userPermissions?.is_superuser === true) {
    return true
  }

  // admin 入口只允许超级管理员，不从普通用户 permissions 字段放行
  if (permission === 'admin') {
    return false
  }

  // 检查具体权限
  const permissions = userPermissions || {}
  return permissions[permission] === true
}

// 批量权限检查
export function hasAnyPermission(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.some(permission => hasPermission(userPermissions, permission))
}

// 检查是否有所有权限
export function hasAllPermissions(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.every(permission => hasPermission(userPermissions, permission))
}

// 统一检查带 permission 字段的入口，避免菜单、按钮、快捷入口各自实现判断。
export function hasItemPermission(item: PermissionProtectedItem, userPermissions: any): boolean {
  if (!item.permission) {
    return true
  }

  return hasPermission(userPermissions, item.permission)
}

// 根据权限过滤带 permission 字段的入口
export function filterItemsByPermission<T extends PermissionProtectedItem>(items: T[], userPermissions: any): T[] {
  return items.filter(item => hasItemPermission(item, userPermissions))
}

// 根据权限过滤菜单项
export function filterMenusByPermission(menus: any[], userPermissions: any): any[] {
  return filterItemsByPermission(menus, userPermissions)
}
