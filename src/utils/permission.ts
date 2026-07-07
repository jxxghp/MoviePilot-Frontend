// 权限类型定义
export type UserPermissionCategoryKey = 'discovery' | 'search' | 'subscribe' | 'manage'
export type UserPermissionKey = UserPermissionCategoryKey | 'admin'
export type UserPermissionFeatureKey = string
export type UserPermissionFeatureMap = Record<UserPermissionFeatureKey, boolean>

export interface UserPermissionFeatureOption {
  key: UserPermissionFeatureKey
  permission: UserPermissionCategoryKey
  titleKey: string
  descriptionKey: string
  icon: string
  path?: string
}

export interface UserPermissions {
  discovery: boolean // 发现权限
  search: boolean // 搜索权限
  subscribe: boolean // 订阅权限
  manage: boolean // 管理权限
  admin?: boolean // 管理员权限，仅用于前端入口标识，实际由 is_superuser 决定
  features?: UserPermissionFeatureMap // 功能级权限，缺省功能默认继承分类权限
}

export type UserPermissionContext = UserPermissions & { is_superuser?: boolean; [key: string]: unknown }
export type PermissionProtectedItem = { permission?: UserPermissionKey; feature?: UserPermissionFeatureKey }

export const PERMISSION_FEATURE = {
  DISCOVERY_RECOMMEND: 'discovery.recommend',
  DISCOVERY_EXPLORE: 'discovery.explore',
  SEARCH_RESOURCE: 'search.resource',
  SUBSCRIBE_MOVIE: 'subscribe.movie',
  SUBSCRIBE_TV: 'subscribe.tv',
  SUBSCRIBE_CALENDAR: 'subscribe.calendar',
  SUBSCRIBE_SHARE: 'subscribe.share',
  MANAGE_WORKFLOW: 'manage.workflow',
  MANAGE_DOWNLOADING: 'manage.downloading',
  MANAGE_HISTORY: 'manage.history',
  MANAGE_FILEMANAGER: 'manage.filemanager',
  MANAGE_SITE: 'manage.site',
} as const

export const USER_PERMISSION_FEATURES: UserPermissionFeatureOption[] = [
  {
    key: PERMISSION_FEATURE.DISCOVERY_RECOMMEND,
    permission: 'discovery',
    titleKey: 'dialog.userAddEdit.permissions.features.recommend',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.recommend',
    icon: 'mdi-star-outline',
    path: '/recommend',
  },
  {
    key: PERMISSION_FEATURE.DISCOVERY_EXPLORE,
    permission: 'discovery',
    titleKey: 'dialog.userAddEdit.permissions.features.explore',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.explore',
    icon: 'mdi-apple-safari',
    path: '/discover',
  },
  {
    key: PERMISSION_FEATURE.SEARCH_RESOURCE,
    permission: 'search',
    titleKey: 'dialog.userAddEdit.permissions.features.resourceSearch',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.resourceSearch',
    icon: 'mdi-magnify',
    path: '/resource',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_MOVIE,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.movieSubscribe',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.movieSubscribe',
    icon: 'mdi-movie-open-outline',
    path: '/subscribe/movie',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_TV,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.tvSubscribe',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.tvSubscribe',
    icon: 'mdi-television',
    path: '/subscribe/tv',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_CALENDAR,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.calendar',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.calendar',
    icon: 'mdi-calendar',
    path: '/calendar',
  },
  {
    key: PERMISSION_FEATURE.SUBSCRIBE_SHARE,
    permission: 'subscribe',
    titleKey: 'dialog.userAddEdit.permissions.features.subscribeShare',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.subscribeShare',
    icon: 'mdi-share-variant',
    path: '/subscribe-share',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_WORKFLOW,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.workflow',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.workflow',
    icon: 'mdi-state-machine',
    path: '/workflow',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_DOWNLOADING,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.downloading',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.downloading',
    icon: 'mdi-download-outline',
    path: '/downloading',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_HISTORY,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.history',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.history',
    icon: 'mdi-folder-play-outline',
    path: '/history',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_FILEMANAGER,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.fileManager',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.fileManager',
    icon: 'mdi-folder-multiple-outline',
    path: '/filemanager',
  },
  {
    key: PERMISSION_FEATURE.MANAGE_SITE,
    permission: 'manage',
    titleKey: 'dialog.userAddEdit.permissions.features.site',
    descriptionKey: 'dialog.userAddEdit.permissions.featureDescriptions.site',
    icon: 'mdi-web',
    path: '/site',
  },
]

/** 构造功能级权限默认值，新建用户默认不收窄已拥有的分类权限。 */
export function buildDefaultFeaturePermissions(enabled = true): UserPermissionFeatureMap {
  return Object.fromEntries(USER_PERMISSION_FEATURES.map(feature => [feature.key, enabled]))
}

/** 构造插件导航的功能权限键，供动态插件入口复用。 */
export function buildPluginPermissionFeatureKey(pluginId: string, navKey = 'main'): UserPermissionFeatureKey {
  return `plugin.${pluginId}.${navKey}`
}

/** 判断传入值是否为可安全读取的普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 规整用户权限数据，兼容没有 features 字段的历史用户。 */
export function normalizeUserPermissions(permissions: Partial<UserPermissions> | null | undefined = {}): UserPermissions {
  const permissionData = permissions ?? {}
  const rawFeatures = isRecord(permissionData.features) ? permissionData.features : {}
  const features = Object.fromEntries(
    Object.entries(rawFeatures).filter(([, value]) => typeof value === 'boolean'),
  ) as UserPermissionFeatureMap

  return {
    discovery: permissionData.discovery ?? DEFAULT_PERMISSIONS.discovery,
    search: permissionData.search ?? DEFAULT_PERMISSIONS.search,
    subscribe: permissionData.subscribe ?? DEFAULT_PERMISSIONS.subscribe,
    manage: permissionData.manage ?? DEFAULT_PERMISSIONS.manage,
    admin: permissionData.admin ?? DEFAULT_PERMISSIONS.admin,
    features,
  }
}

/** 构造权限检查上下文，统一超级管理员标记、分类权限与功能权限字段。 */
export function buildUserPermissionContext(isSuperuser: boolean, permissions: Partial<UserPermissions> = {}): UserPermissionContext {
  return {
    is_superuser: isSuperuser,
    ...normalizeUserPermissions(permissions),
  }
}

// 默认权限配置
export const DEFAULT_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: false,
  admin: false,
  features: {},
}

// 管理员权限配置
export const ADMIN_PERMISSIONS: UserPermissions = {
  discovery: true,
  search: true,
  subscribe: true,
  manage: true,
  admin: true,
  features: buildDefaultFeaturePermissions(),
}

/** 检查用户是否拥有指定权限分类。 */
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

/** 检查用户是否拥有指定功能权限，缺省功能项默认放行以兼容历史数据。 */
export function hasFeaturePermission(
  userPermissions: any,
  feature?: UserPermissionFeatureKey,
  permission?: UserPermissionKey,
): boolean {
  if (!feature) {
    return true
  }

  if (userPermissions?.is_superuser === true) {
    return true
  }

  if (permission && !hasPermission(userPermissions, permission)) {
    return false
  }

  const features = isRecord(userPermissions?.features) ? userPermissions.features : {}
  return features[feature] !== false
}

/** 批量检查是否拥有任一权限分类。 */
export function hasAnyPermission(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.some(permission => hasPermission(userPermissions, permission))
}

/** 批量检查是否拥有全部权限分类。 */
export function hasAllPermissions(userPermissions: any, permissionList: UserPermissionKey[]): boolean {
  return permissionList.every(permission => hasPermission(userPermissions, permission))
}

/** 统一检查带 permission / feature 字段的入口，避免菜单、按钮、快捷入口各自实现判断。 */
export function hasItemPermission(item: PermissionProtectedItem, userPermissions: any): boolean {
  if (item.permission && !hasPermission(userPermissions, item.permission)) {
    return false
  }

  return hasFeaturePermission(userPermissions, item.feature, item.permission)
}

/** 根据权限过滤带 permission / feature 字段的入口。 */
export function filterItemsByPermission<T extends PermissionProtectedItem>(items: T[], userPermissions: any): T[] {
  return items.filter(item => hasItemPermission(item, userPermissions))
}

/** 根据权限过滤菜单项。 */
export function filterMenusByPermission(menus: any[], userPermissions: any): any[] {
  return filterItemsByPermission(menus, userPermissions)
}
