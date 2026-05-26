import { computed, onBeforeUnmount, ref, type Ref } from 'vue'
import api from '@/api'

export interface LlmProviderAuthMethod {
  id: string
  type: string
  label: string
  description?: string
}

export interface LlmProviderAuthStatus {
  connected: boolean
  type?: string
  label?: string
  expires_at?: number | null
  updated_at?: number | null
}

export interface LlmProviderUrlPreset {
  id: string
  label: string
  value: string
}

export interface LlmProviderUrlPresetItem {
  id: string
  title: string
  value: string
  subtitle?: string
}

export interface LlmProvider {
  id: string
  name: string
  runtime: string
  default_base_url: string
  base_url_presets?: LlmProviderUrlPreset[]
  base_url_editable: boolean
  requires_base_url: boolean
  supports_api_key: boolean
  api_key_label: string
  api_key_hint: string
  supports_model_refresh: boolean
  oauth_methods: LlmProviderAuthMethod[]
  description?: string
  auth_status: LlmProviderAuthStatus
}

export interface LlmModel {
  id: string
  name: string
  family?: string
  context_tokens?: number | null
  input_tokens?: number | null
  output_tokens?: number | null
  context_tokens_k?: number | null
  supports_reasoning?: boolean
  supports_tools?: boolean
  supports_image_input?: boolean
  supports_audio_input?: boolean
  transport?: string
  source?: string
  release_date?: string | null
  status?: string | null
}

export interface LlmProviderAuthSession {
  session_id: string
  provider_id: string
  flow_type: string
  status: string
  message?: string
  authorize_url?: string
  verification_url?: string
  user_code?: string
  instructions?: string
  interval_seconds?: number
  expires_at?: number
}

interface UseLlmProviderDirectoryOptions {
  provider: Ref<string>
  apiKey: Ref<string>
  baseUrl: Ref<string>
  baseUrlPreset?: Ref<string>
  useProxy?: Ref<boolean>
  userAgent?: Ref<string>
  model: Ref<string>
  maxContextTokens?: Ref<number>
  authConnected?: Ref<boolean>
}

function normalizeValue(value: unknown) {
  return String(value ?? '').trim()
}

export function useLlmProviderDirectory(options: UseLlmProviderDirectoryOptions) {
  const providers = ref<LlmProvider[]>([])
  const models = ref<LlmModel[]>([])
  const loadingProviders = ref(false)
  const loadingModels = ref(false)
  const authDialogVisible = ref(false)
  const authPolling = ref(false)
  const authPopupBlocked = ref(false)
  const authSession = ref<LlmProviderAuthSession | null>(null)

  let pollTimer: number | null = null

  const selectedProvider = computed(
    () => providers.value.find(item => item.id === normalizeValue(options.provider.value)) || null,
  )
  const selectedModel = computed(
    () => models.value.find(item => item.id === normalizeValue(options.model.value)) || null,
  )
  const providerItems = computed(() => providers.value.map(item => ({ title: item.name, value: item.id })))
  const baseUrlPresetItems = computed<LlmProviderUrlPresetItem[]>(() =>
    (selectedProvider.value?.base_url_presets || []).map(item => ({
      id: item.id,
      title: item.value,
      value: item.value,
      subtitle: item.label,
    })),
  )
  const providerConnected = computed(() => Boolean(selectedProvider.value?.auth_status?.connected))
  const showBaseUrlField = computed(
    () => Boolean(selectedProvider.value && (selectedProvider.value.oauth_methods || []).length === 0),
  )
  const showApiKeyField = computed(() => selectedProvider.value?.supports_api_key !== false)
  const hasUsableCredential = computed(() => {
    if (providerConnected.value) return true
    return Boolean(normalizeValue(options.apiKey.value))
  })
  const canRefreshModels = computed(() => {
    if (!selectedProvider.value?.supports_model_refresh) return false
    if (!hasUsableCredential.value) return false
    if (selectedProvider.value.requires_base_url && !normalizeValue(options.baseUrl.value)) return false
    return true
  })

  function clearPollTimer() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function syncAuthConnected() {
    if (options.authConnected) {
      options.authConnected.value = providerConnected.value
    }
  }

  function ensureBaseUrl(reset = false) {
    const provider = selectedProvider.value
    if (!provider) return

    const currentBaseUrl = normalizeValue(options.baseUrl.value)
    const defaultBaseUrl = provider.default_base_url || ''
    const defaultPresetId = normalizeValue(provider.base_url_presets?.[0]?.id)
    if (reset) {
      options.baseUrl.value = defaultBaseUrl
      if (options.baseUrlPreset) {
        options.baseUrlPreset.value = defaultPresetId
      }
      return
    }

    if (!currentBaseUrl && defaultBaseUrl) {
      options.baseUrl.value = defaultBaseUrl
    }

    if (!options.baseUrlPreset) return

    const currentPresetId = normalizeValue(options.baseUrlPreset.value)
    if (currentPresetId) return

    const matchedPreset = (provider.base_url_presets || []).find(
      item => normalizeValue(item.value) === normalizeValue(options.baseUrl.value),
    )
    options.baseUrlPreset.value = matchedPreset?.id || defaultPresetId
  }

  function setBaseUrlPreset(presetId?: string, presetValue?: string) {
    if (!options.baseUrlPreset) return

    options.baseUrlPreset.value = normalizeValue(presetId)
    if (presetValue !== undefined) {
      options.baseUrl.value = presetValue || ''
    }
  }

  function handleProviderSelection(resetBaseUrl = true) {
    ensureBaseUrl(resetBaseUrl)
    options.apiKey.value = ''
    if (options.maxContextTokens) {
      options.maxContextTokens.value = 64
    }
    models.value = []
    options.model.value = ''
    syncAuthConnected()
  }

  function applyModelMetadata(modelId?: string) {
    const targetId = normalizeValue(modelId ?? options.model.value)
    if (!targetId) return null

    const matched = models.value.find(item => item.id === targetId) || null
    if (matched?.context_tokens_k && options.maxContextTokens) {
      // models.dev / provider 返回的是精确 token，这里回填到现有的 K 单位配置。
      options.maxContextTokens.value = matched.context_tokens_k
    }
    return matched
  }

  function updateProviderAuthStatus(providerId: string, authStatus?: LlmProviderAuthStatus) {
    if (!authStatus) return
    const index = providers.value.findIndex(item => item.id === providerId)
    if (index === -1) return

    providers.value[index] = {
      ...providers.value[index],
      auth_status: authStatus,
    }
    syncAuthConnected()
  }

  async function loadProviders(preserveBaseUrl = true) {
    loadingProviders.value = true
    try {
      const result: { [key: string]: any } = await api.get('llm/providers')
      if (!result.success) {
        throw new Error(result.message || 'Load LLM providers failed')
      }

      providers.value = Array.isArray(result.data) ? result.data : []
      if (!selectedProvider.value && providers.value.length > 0) {
        options.provider.value = providers.value[0].id
      }
      ensureBaseUrl(!preserveBaseUrl)
      syncAuthConnected()
      return providers.value
    } finally {
      loadingProviders.value = false
    }
  }

  async function loadModels(forceRefresh = false) {
    if (!selectedProvider.value) return []

    loadingModels.value = true
    try {
      const result: { [key: string]: any } = await api.get('llm/models', {
        params: {
          provider: normalizeValue(options.provider.value),
          api_key: normalizeValue(options.apiKey.value) || undefined,
          base_url: normalizeValue(options.baseUrl.value) || undefined,
          base_url_preset: normalizeValue(options.baseUrlPreset?.value) || undefined,
          use_proxy: options.useProxy?.value,
          user_agent: normalizeValue(options.userAgent?.value) || undefined,
          force_refresh: forceRefresh,
        },
      })
      if (!result.success) {
        throw new Error(result.message || 'Load LLM models failed')
      }

      const payload = result.data || {}
      models.value = Array.isArray(payload.models) ? payload.models : []
      updateProviderAuthStatus(normalizeValue(options.provider.value), payload.auth_status)

      const currentModelId = normalizeValue(options.model.value)
      const matchedModel = currentModelId
        ? models.value.find(item => item.id === currentModelId)
        : null

      if (matchedModel) {
        applyModelMetadata(matchedModel.id)
      } else if (models.value.length > 0) {
        options.model.value = models.value[0].id
        applyModelMetadata(models.value[0].id)
      }

      return models.value
    } finally {
      loadingModels.value = false
    }
  }

  function openAuthPage() {
    const session = authSession.value
    const targetUrl = session?.authorize_url || session?.verification_url
    if (!targetUrl) return

    const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer,width=960,height=780')
    authPopupBlocked.value = !popup
  }

  async function pollAuthSession() {
    if (!authSession.value) return null

    authPolling.value = true
    clearPollTimer()
    try {
      const result: { [key: string]: any } = await api.post(
        `llm/provider-auth/${authSession.value.session_id}/poll`,
      )
      if (!result.success) {
        throw new Error(result.message || 'Poll LLM auth failed')
      }

      authSession.value = {
        ...authSession.value,
        ...result.data,
      }
      const nextSession = authSession.value
      if (!nextSession) return null

      if (nextSession.status === 'pending') {
        pollTimer = window.setTimeout(
          () => pollAuthSession().catch(() => undefined),
          Math.max(nextSession.interval_seconds || 5, 1) * 1000,
        )
        return nextSession
      }

      await loadProviders()
      if (nextSession.status === 'authorized') {
        await loadModels(true).catch(() => undefined)
      }
      return nextSession
    } finally {
      authPolling.value = false
    }
  }

  async function startAuth(methodId: string) {
    if (!selectedProvider.value) {
      throw new Error('LLM provider is required')
    }

    const result: { [key: string]: any } = await api.post('llm/provider-auth/start', {
      provider: normalizeValue(options.provider.value),
      method: methodId,
    })
    if (!result.success) {
      throw new Error(result.message || 'Start LLM auth failed')
    }

    authSession.value = {
      status: 'pending',
      provider_id: normalizeValue(options.provider.value),
      ...result.data,
    }
    authDialogVisible.value = true
    authPopupBlocked.value = false
    openAuthPage()
    pollTimer = window.setTimeout(() => pollAuthSession().catch(() => undefined), 1200)
    return authSession.value
  }

  async function disconnectAuth() {
    if (!selectedProvider.value) return false

    const result: { [key: string]: any } = await api.delete(
      `llm/provider-auth/${normalizeValue(options.provider.value)}`,
    )
    if (!result.success) {
      throw new Error(result.message || 'Disconnect LLM auth failed')
    }

    await loadProviders()
    return true
  }

  function closeAuthDialog() {
    authDialogVisible.value = false
    clearPollTimer()
  }

  onBeforeUnmount(() => {
    clearPollTimer()
  })

  return {
    providers,
    providerItems,
    baseUrlPresetItems,
    models,
    selectedProvider,
    selectedModel,
    loadingProviders,
    loadingModels,
    providerConnected,
    showBaseUrlField,
    showApiKeyField,
    hasUsableCredential,
    canRefreshModels,
    setBaseUrlPreset,
    authDialogVisible,
    authPolling,
    authPopupBlocked,
    authSession,
    handleProviderSelection,
    applyModelMetadata,
    loadProviders,
    loadModels,
    openAuthPage,
    startAuth,
    pollAuthSession,
    disconnectAuth,
    closeAuthDialog,
  }
}
