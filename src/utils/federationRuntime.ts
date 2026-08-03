import {
  __federation_method_getRemote,
  __federation_method_setRemote,
  __federation_method_unwrapDefault,
  // @ts-expect-error -- virtual 模块由 federation 插件在开发与生产构建时提供。
} from 'virtual:__federation__'

/** 模块联邦运行时接受的远程入口配置。 */
export interface FederationRemoteConfig {
  format: 'esm'
  from: 'vite'
  url: () => Promise<string>
}

/** 注册模块联邦远程入口。 */
export function setFederationRemote(id: string, config: FederationRemoteConfig): void {
  __federation_method_setRemote(id, config)
}

/** 从已注册远程入口加载指定 expose。 */
export async function getFederationRemote(id: string, componentName: string): Promise<unknown> {
  return __federation_method_getRemote(id, componentName)
}

/** 解包默认导出；具体类型由各 expose 的宿主契约决定。 */
export function unwrapFederationDefault(module: unknown) {
  return __federation_method_unwrapDefault(module)
}
