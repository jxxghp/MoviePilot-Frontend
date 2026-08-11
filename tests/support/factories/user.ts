import type { User } from '@/api/types'
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
