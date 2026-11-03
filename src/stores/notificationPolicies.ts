import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '@/api'

/** 后台自动整理接管的推送策略，不控制整理功能或手动会话回复。 */
export type AgentTransferNotificationMode = 'all' | 'attention' | 'off'

interface NotificationPolicies {
  agent_transfer_takeover: AgentTransferNotificationMode
  [key: string]: unknown
}

const endpoint = 'system/setting/NotificationPolicies'

/** 两个设置页面共用服务端配置、编辑草稿和在途请求，避免出现两套开关。 */
export const useNotificationPoliciesStore = defineStore('notificationPolicies', () => {
  const mode = ref<AgentTransferNotificationMode>('all')
  const savedMode = ref<AgentTransferNotificationMode>('all')
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const loadFailed = ref(false)
  const saveFailed = ref(false)
  const dirty = computed(() => mode.value !== savedMode.value)
  let policies: NotificationPolicies = { agent_transfer_takeover: 'all' }
  let pendingLoad: Promise<void> | undefined
  let generation = 0

  /** 读取同一配置；不覆盖未保存的编辑，也不允许旧读取覆盖新保存。 */
  function load(refresh = false): Promise<void> {
    if (pendingLoad) return pendingLoad
    if (saving.value || dirty.value || (loaded.value && !refresh)) return Promise.resolve()
    const requestGeneration = generation
    loading.value = true
    loadFailed.value = false
    pendingLoad = Promise.resolve().then(async () => {
      try {
        const result = await api.get<{ value?: Partial<NotificationPolicies> | null }>(endpoint)
        const value = result.value ?? {}
        const nextMode = value.agent_transfer_takeover ?? 'all'
        if (!['all', 'attention', 'off'].includes(nextMode)) throw new Error('通知策略不受支持')
        if (generation !== requestGeneration || dirty.value) return
        policies = { ...value, agent_transfer_takeover: nextMode }
        mode.value = savedMode.value = nextMode
        loaded.value = true
      } catch {
        if (generation === requestGeneration) loadFailed.value = true
      } finally {
        loading.value = false
        pendingLoad = undefined
      }
    })
    return pendingLoad
  }

  /** 只持久化通知策略，不提交系统设置表单或改动其他通知配置。 */
  async function save(): Promise<boolean> {
    if (!loaded.value || loading.value || saving.value || loadFailed.value) return false
    generation += 1
    saving.value = true
    saveFailed.value = false
    const nextMode = mode.value
    try {
      const nextPolicies = { ...policies, agent_transfer_takeover: nextMode }
      await api.post(
        'system/settings',
        { setting_key: 'NotificationPolicies', operation: 'replace', value: nextPolicies },
        { feedback: 'silent' },
      )
      policies = nextPolicies
      savedMode.value = nextMode
      return true
    } catch {
      saveFailed.value = true
      return false
    } finally {
      saving.value = false
    }
  }

  return { mode, loaded, loading, saving, dirty, loadFailed, saveFailed, load, save }
})
