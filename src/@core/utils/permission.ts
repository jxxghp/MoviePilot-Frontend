import store from '@/store'

// 检查是否有权限
export function hasPermission(permission: string | null = null) {
  if (!permission) return true
  // permission是一个以.分隔的字符串，例如：'user.create'
  const permissionList = permission.split('.')
  let permissions_obj = store.state.auth.permissions
  for (const element of permissionList) {
    if (!permissions_obj[element]) {
      return false
    } else if (typeof permissions_obj[element] === 'object') {
      permissions_obj = permissions_obj[element]
    } else {
      return true
    }
  }
  return false
}
