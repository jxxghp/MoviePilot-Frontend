export interface authState {
  // 用户令牌
  token: string | null
  // 记住我
  remember: boolean
  // 原始路径
  originalPath?: string | null
}

export interface userState {
  // 是否属于超级管理员
  superUser: boolean
  // 用户ID
  userID: number
  // 用户名
  userName: string
  // 头像
  avatar: string
  // 用户认证等级 1-未认证 2-已认证
  level: number
  // 权限
  permissions: { [key: string]: any }
}

export interface globalSettingsState {
  // 全局设置数据
  data: { [key: string]: any }
  // 是否已初始化
  initialized: boolean
  // 是否正在加载
  loading: boolean
}
