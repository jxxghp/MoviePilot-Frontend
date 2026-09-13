import { ref, watch, type Ref } from 'vue'
import { getInstalledPlugins } from '@/api/pluginInstanceManage'
import { getPluginInstanceLogLevels } from '@/api/pluginLogLevel'
import type { Plugin, PluginInstanceLogLevelOverview } from '@/api/types'

/** 一个插件实例在实例管理界面上的展示行。 */
export interface PluginInstanceRow {
  // 实例 ID，也是全部按实例接口的寻址键
  instanceId: string
  // 实例展示名称，取不到时回落到实例 ID
  displayName: string
  // 是否为源插件本体自身，而非共享源码的分身
  isHost: boolean
  // 是否为本插件的默认调用目标
  isDefaultTarget: boolean
  // 该实例设置的日志等级覆盖，为空表示跟随全局
  configuredLevel: string | null
  // 日志等级覆盖的失效时间，为空表示不过期
  expiresAt: string | null
  // 按过期回落判定后实际生效的日志等级
  effectiveLevel: string
}

/** 按实例 ID 大小写不敏感索引已安装插件：注册表键与实例登记 ID 可能只差大小写。 */
function indexPluginsById(plugins: Plugin[]): Map<string, Plugin> {
  return new Map(plugins.map(plugin => [(plugin.id ?? '').toLowerCase(), plugin]))
}

/**
 * 读取一个插件全部在册实例（本体与分身）的按实例设置。
 *
 * 实例清单以日志等级总览为准，它给出的正是后端认定在册的那一组实例；展示名与默认
 * 调用目标置位则只在已装插件清单上，两份数据按实例 ID 合并成展示行。
 */
export function usePluginInstanceOverview(pluginId: Ref<string>) {
  const loading = ref(false)
  const loadFailed = ref(false)
  // 已装插件清单单独记失败：取不到它只是少了展示名与默认目标置位，实例清单本身仍然可用
  const overlayFailed = ref(false)
  const rows = ref<PluginInstanceRow[]>([])
  // 请求代际：刷新与重试可能叠在一起，只有最后发出的那次结果算数，否则列表会退回旧状态
  let generation = 0

  /** 读取已装插件清单；失败只让展示名与默认目标置位不可用，不阻断实例清单。 */
  async function loadOverlay(): Promise<Plugin[]> {
    try {
      const plugins = await getInstalledPlugins()
      overlayFailed.value = false
      return plugins
    } catch (error) {
      console.error(error)
      overlayFailed.value = true
      return []
    }
  }

  /** 把实例清单与已装插件清单合并为展示行。 */
  function buildRows(overview: PluginInstanceLogLevelOverview, plugins: Plugin[]): PluginInstanceRow[] {
    const pluginsById = indexPluginsById(plugins)
    // 本体行的实例 ID 就是插件 ID 自身，以后端回执的插件 ID 为准而不是打开弹窗的那张卡片
    const hostId = (overview.plugin_id || pluginId.value).toLowerCase()
    return (overview.instances ?? []).map(item => {
      const plugin = pluginsById.get(item.instance_id.toLowerCase())
      return {
        instanceId: item.instance_id,
        displayName: plugin?.plugin_name || item.instance_id,
        isHost: item.instance_id.toLowerCase() === hostId,
        isDefaultTarget: plugin?.is_default_target === true,
        configuredLevel: item.configured_level ?? null,
        expiresAt: item.expires_at ?? null,
        effectiveLevel: item.effective_level,
      }
    })
  }

  /** 重新读取该插件的实例清单与展示信息。 */
  async function load(): Promise<boolean> {
    if (!pluginId.value) return false

    const current = ++generation
    loading.value = true
    loadFailed.value = false
    try {
      const [overview, plugins] = await Promise.all([getPluginInstanceLogLevels(pluginId.value), loadOverlay()])
      if (current !== generation) return false
      rows.value = buildRows(overview, plugins)
      return true
    } catch (error) {
      console.error(error)
      if (current === generation) loadFailed.value = true
      return false
    } finally {
      if (current === generation) loading.value = false
    }
  }

  watch(
    pluginId,
    () => {
      rows.value = []
      void load()
    },
    { immediate: true },
  )

  return { loading, loadFailed, overlayFailed, rows, load }
}
