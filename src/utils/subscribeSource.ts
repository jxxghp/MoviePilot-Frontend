import type { Subscribe } from '@/api/types'

/**
 * 订阅来源类别。
 * 订阅记录的 username 只是一个名字：可能是 MoviePilot 账号，也可能是插件写入的插件名，
 * 或 Seerr、API 客户端、消息渠道用户等外部名字，所以展示前要先归类。
 */
export type SubscribeSourceKind = 'user' | 'plugin' | 'other'

/** 订阅卡片上展示的订阅来源。 */
export interface SubscribeSource {
  // 来源类别，决定使用头像、插件图标还是首字圆点
  kind: SubscribeSourceKind
  // 订阅记录里的原始名字，用于悬停提示
  name: string
  // 展示名：账号优先使用昵称，其余直接使用原始名字
  label: string
  // 徽标图片：账号头像或插件 Logo；缺失或加载失败时账号改用首字圆点、插件改用拼图图标
  image?: string
  // 首字圆点上的文字
  initial: string
  // 首字圆点底色：当前登录用户用主题色，其余按原始名字固定，同一来源在每张卡片上颜色一致
  color: string
}

/** 识别订阅来源所需的目录信息，只有管理员能读取。 */
export interface SubscribeSourceDirectory {
  // 账号名 -> 昵称与头像
  users: Map<string, { nickname?: string; avatar?: string }>
  // 已安装插件显示名 -> 可直接展示的 Logo 地址（插件未配置 Logo 时为空）
  plugins: Map<string, string | undefined>
}

export const emptySubscribeSourceDirectory = (): SubscribeSourceDirectory => ({
  users: new Map(),
  plugins: new Map(),
})

/** 去掉首尾空白；空名字视为来源未知，不参与展示和计数。 */
function normalizeSourceName(name: string | null | undefined) {
  return name?.trim() ?? ''
}

/** 列表中出现的不同来源名字。 */
export function collectSubscribeSourceNames(subscribes: Pick<Subscribe, 'username'>[]) {
  const names = new Set<string>()
  for (const subscribe of subscribes) {
    const name = normalizeSourceName(subscribe.username)
    if (name) names.add(name)
  }
  return names
}

/**
 * 是否需要在卡片上标出来源。
 * 只有一个来源时（单用户实例、普通用户只看得到自己的订阅）标识没有区分意义，不显示，
 * 以此代替设置开关。
 */
export function shouldShowSubscribeSource(sourceNames: Set<string>) {
  return sourceNames.size >= 2
}

/** 当前登录用户自己的订阅使用主题主色，便于一眼认出“我的”。 */
export const SELF_SOURCE_COLOR = 'rgb(var(--v-theme-primary))'

/** 按名字计算固定色相，饱和度和亮度固定，保证白字在深色卡片上可读；不是随机色，刷新后不变。 */
export function getSubscribeSourceColor(name: string) {
  let hash = 0
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360
  }
  return `hsl(${hash} 52% 48%)`
}

/** 取展示名首字；按码点切分，避免把 emoji 等代理对切成乱码。 */
function getInitial(label: string) {
  return (Array.from(label)[0] ?? '').toUpperCase()
}

/** 把订阅记录里的名字归类为账号、插件或外部来源。 */
export function resolveSubscribeSource(
  rawName: string | null | undefined,
  directory: SubscribeSourceDirectory,
  // 当前登录用户名，用于给自己的订阅换成主题色
  selfName?: string | null,
): SubscribeSource | null {
  const name = normalizeSourceName(rawName)
  if (!name) return null
  const color = name === normalizeSourceName(selfName) ? SELF_SOURCE_COLOR : getSubscribeSourceColor(name)

  const user = directory.users.get(name)
  if (user) {
    const label = user.nickname?.trim() || name
    return {
      kind: 'user',
      name,
      label,
      image: user.avatar || undefined,
      initial: getInitial(label),
      color,
    }
  }

  if (directory.plugins.has(name)) {
    return {
      kind: 'plugin',
      name,
      label: name,
      image: directory.plugins.get(name) || undefined,
      initial: getInitial(name),
      color,
    }
  }

  return {
    kind: 'other',
    name,
    label: name,
    initial: getInitial(name),
    color,
  }
}
