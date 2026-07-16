import {
  ADMIN_PERMISSIONS,
  buildDefaultFeaturePermissions,
  buildPluginPermissionFeatureKey,
  buildUserPermissionContext,
  DEFAULT_PERMISSIONS,
  filterItemsByPermission,
  filterMenusByPermission,
  hasAllPermissions,
  hasAnyPermission,
  hasFeaturePermission,
  hasItemPermission,
  hasPermission,
  normalizeUserPermissions,
  PERMISSION_FEATURE,
  USER_PERMISSION_FEATURES,
  type UserPermissionFeatureMap,
} from '@/utils/permission'
import { describe, expect, it } from 'vitest'

describe('permission utilities', () => {
  it('normalizes legacy permissions and filters invalid feature values', () => {
    const normalized = normalizeUserPermissions({
      discovery: false,
      features: {
        enabled: true,
        invalid: 'yes',
      } as unknown as UserPermissionFeatureMap,
    })

    expect(normalized).toEqual({
      ...DEFAULT_PERMISSIONS,
      discovery: false,
      features: { enabled: true },
    })
    expect(normalizeUserPermissions(null)).toEqual(DEFAULT_PERMISSIONS)
  })

  it('builds default and plugin feature contracts', () => {
    const disabledFeatures = buildDefaultFeaturePermissions(false)

    expect(Object.keys(disabledFeatures)).toHaveLength(USER_PERMISSION_FEATURES.length)
    expect(Object.values(disabledFeatures).every(enabled => enabled === false)).toBe(true)
    expect(buildPluginPermissionFeatureKey('demo')).toBe('plugin.demo.main')
    expect(buildPluginPermissionFeatureKey('demo', 'settings')).toBe('plugin.demo.settings')
    expect(ADMIN_PERMISSIONS.features?.[PERMISSION_FEATURE.MANAGE_SITE]).toBe(true)
  })

  it('grants every category and admin entry only to superusers', () => {
    const superuser = buildUserPermissionContext(true, {})

    expect(hasPermission(superuser, 'admin')).toBe(true)
    expect(hasPermission(superuser, 'manage')).toBe(true)
    expect(hasFeaturePermission(superuser, PERMISSION_FEATURE.MANAGE_SITE, 'manage')).toBe(true)
    expect(hasPermission({ admin: true, manage: true }, 'admin')).toBe(false)
  })

  it('checks category permissions as explicit booleans', () => {
    const permissions = { discovery: true, search: false, subscribe: 1, manage: undefined }

    expect(hasPermission(permissions, 'discovery')).toBe(true)
    expect(hasPermission(permissions, 'search')).toBe(false)
    expect(hasPermission(permissions, 'subscribe')).toBe(false)
    expect(hasPermission(null, 'manage')).toBe(false)
    expect(hasAnyPermission(permissions, ['search', 'discovery'])).toBe(true)
    expect(hasAllPermissions(permissions, ['discovery', 'search'])).toBe(false)
  })

  it('inherits missing feature flags but honors explicit denial and parent categories', () => {
    const legacyUser = { discovery: true }
    const restrictedUser = {
      discovery: true,
      features: { [PERMISSION_FEATURE.DISCOVERY_RECOMMEND]: false },
    }

    expect(hasFeaturePermission(legacyUser)).toBe(true)
    expect(hasFeaturePermission(legacyUser, PERMISSION_FEATURE.DISCOVERY_RECOMMEND, 'discovery')).toBe(true)
    expect(hasFeaturePermission(restrictedUser, PERMISSION_FEATURE.DISCOVERY_RECOMMEND, 'discovery')).toBe(false)
    expect(
      hasFeaturePermission(
        { discovery: false, features: { [PERMISSION_FEATURE.DISCOVERY_RECOMMEND]: true } },
        PERMISSION_FEATURE.DISCOVERY_RECOMMEND,
        'discovery',
      ),
    ).toBe(false)
  })

  it('checks and filters permission-protected items consistently', () => {
    const permissions = {
      discovery: true,
      manage: false,
      features: { [PERMISSION_FEATURE.DISCOVERY_EXPLORE]: false },
    }
    const items = [
      { id: 'open' },
      { id: 'recommend', permission: 'discovery' as const, feature: PERMISSION_FEATURE.DISCOVERY_RECOMMEND },
      { id: 'explore', permission: 'discovery' as const, feature: PERMISSION_FEATURE.DISCOVERY_EXPLORE },
      { id: 'manage', permission: 'manage' as const },
    ]

    expect(hasItemPermission(items[1], permissions)).toBe(true)
    expect(hasItemPermission(items[2], permissions)).toBe(false)
    expect(filterItemsByPermission(items, permissions).map(item => item.id)).toEqual(['open', 'recommend'])
    expect(filterMenusByPermission(items, permissions).map(item => item.id)).toEqual(['open', 'recommend'])
  })
})
