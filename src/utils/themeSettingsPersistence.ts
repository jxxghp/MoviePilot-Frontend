import api from '@/api'

/**
 * 主题与玻璃设置的服务端持久化通道。
 *
 * 浏览器本地存储会在用户清理站点数据后丢失，导致主题回落到默认玻璃外观。
 * 这里把同一份设置镜像到 MoviePilot 用户配置（`userconfig` 表，按用户名隔离），
 * 使清理缓存、更换浏览器或更换设备后仍能恢复用户选择的外观。
 *
 * 读取策略固定为「本地优先」：本地已有设置时以本地为准，仅在本地缺失时用服务端值回填，
 * 因此不会出现服务端旧值覆盖当前会话外观的情况。
 */

/** 主题定制设置的服务端配置键。 */
export const THEME_CUSTOMIZER_REMOTE_KEY = 'ThemeCustomizerSettings'

/** 透明主题设置的服务端配置键。 */
export const TRANSPARENCY_REMOTE_KEY = 'TransparencySettings'

/** 服务端用户配置接口前缀。 */
const USER_CONFIG_ENDPOINT = 'user/config'

/** 判断当前是否运行在浏览器环境。 */
function isBrowser() {
  return typeof window !== 'undefined'
}

/** 读取一个服务端用户配置值，失败时返回 null 而不是抛出。 */
export async function readRemoteUserConfig<T>(key: string): Promise<T | null> {
  if (!isBrowser()) return null

  try {
    const result = await api.get<{ value?: T } | null>(`${USER_CONFIG_ENDPOINT}/${key}`)

    return (result?.value ?? null) as T | null
  } catch (error) {
    console.warn(`读取服务端用户配置失败：${key}`, error)

    return null
  }
}

/** 写入一个服务端用户配置值，失败时返回 false 而不是抛出。 */
export async function writeRemoteUserConfig(key: string, value: unknown): Promise<boolean> {
  if (!isBrowser()) return false

  try {
    await api.post<null>(`${USER_CONFIG_ENDPOINT}/${key}`, value)

    return true
  } catch (error) {
    console.warn(`写入服务端用户配置失败：${key}`, error)

    return false
  }
}
