import { onScopeDispose, provide, toValue, type MaybeRefOrGetter } from 'vue'
import { agentHost, type ScopedAgentHost } from '@/utils/agentHost'

/** 联邦宿主注入 Agent 宿主能力使用的 key。 */
export const AGENT_HOST_INJECTION_KEY = 'moviepilot:agent'

/**
 * 创建按插件实例绑定的 Agent 宿主视图，组件作用域销毁时自动清空该实例的订阅。
 * @param pluginId 插件实例 ID，可为异步才确定的 ref/getter
 */
export function useScopedAgentHost(pluginId: MaybeRefOrGetter<string | undefined | null>): ScopedAgentHost {
  const scoped = agentHost.createScoped(() => toValue(pluginId) || '')
  onScopeDispose(() => scoped.dispose())
  return scoped
}

/** 联邦宿主以 `moviepilot:agent` 注入按实例绑定的 Agent 宿主视图，并返回该视图供 prop 透传。 */
export function provideScopedAgentHost(pluginId: MaybeRefOrGetter<string | undefined | null>): ScopedAgentHost {
  const scoped = useScopedAgentHost(pluginId)
  provide(AGENT_HOST_INJECTION_KEY, scoped)
  return scoped
}
