import type { PassKey, User } from '@/api/types'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'

/** 构造与用户查询接口一致的稳定测试数据。 */
export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    name: 'alice',
    email: 'alice@example.com',
    is_active: true,
    is_superuser: false,
    avatar: '',
    is_otp: false,
    permissions: { ...DEFAULT_PERMISSIONS },
    settings: {},
    ...overrides,
  }
}

/** 构造与通行密钥列表接口一致的稳定测试数据。 */
export function createPassKey(overrides: Partial<PassKey> = {}): PassKey {
  return {
    id: 11,
    name: 'MacBook Touch ID',
    created_at: '2026-08-01T08:00:00Z',
    last_used_at: '2026-08-10T08:00:00Z',
    ...overrides,
  }
}
