import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime'
import type { Component } from 'vue'

/**
 * 模块联邦运行时接受的远程入口配置。
 *
 * 字段沿用旧版调用约定：`format: 'esm'` 对应 Module Federation 的 `type: 'module'`；
 * `from` 仅为兼容保留，运行时按 remoteEntry 的实际容器格式加载，OriginJS 与 `@module-federation/vite`
 * 构建的 ESM remoteEntry 都导出 `get`/`init`，可由同一运行时加载。
 */
export interface FederationRemoteConfig {
  format: 'esm'
  from: 'vite'
  url: () => Promise<string>
}

// 已登记但尚未解析入口地址的 remote；入口地址在首次加载时解析，与旧运行时的惰性语义一致。
const remoteConfigs = new Map<string, FederationRemoteConfig>()

// 已写入 Module Federation 运行时的 remote 及其入口地址。
const registeredEntries = new Map<string, string>()

// 失败的容器在下次加载前重新注册，清除运行时记住的失败 Promise。
const failedRemotes = new Set<string>()

/** 注册模块联邦远程入口。 */
export function setFederationRemote(id: string, config: FederationRemoteConfig): void {
  remoteConfigs.set(id, config)
}

/** 解析入口地址并写入运行时；同一 remote 改用新地址时强制替换旧容器。 */
async function ensureRuntimeRemote(id: string): Promise<void> {
  const config = remoteConfigs.get(id)
  if (!config) throw new Error(`Federation remote is not registered: ${id}`)

  const entry = await config.url()
  const previousEntry = registeredEntries.get(id)
  if (previousEntry === entry && !failedRemotes.has(id)) return

  registerRemotes([{ name: id, entry, type: 'module' }], { force: previousEntry !== undefined })
  registeredEntries.set(id, entry)
  failedRemotes.delete(id)
}

/** 从已注册远程入口加载指定 expose。 */
export async function getFederationRemote(id: string, componentName: string): Promise<unknown> {
  await ensureRuntimeRemote(id)
  const expose = componentName.replace(/^\.\//, '')
  try {
    const module = await loadRemote(`${id}/${expose}`)
    if (module === null || module === undefined) {
      throw new Error(`Federation remote module is unavailable: ${id}/${expose}`)
    }
    return module
  } catch (error) {
    failedRemotes.add(id)
    throw error
  }
}

/** 解包默认导出；插件契约中的每个 expose 都是 Vue 组件，宿主按组件使用其结果。 */
export function unwrapFederationDefault(module: unknown): Component {
  if (module !== null && typeof module === 'object' && 'default' in module) {
    return (module as { default: Component }).default
  }
  return module as Component
}
