<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { useLlmProviderDirectory } from '@/composables/useLlmProviderDirectory'
import { openSharedDialog } from '@/composables/useSharedDialog'

const LlmProviderAuthDialog = defineAsyncComponent(() => import('@/components/dialog/LlmProviderAuthDialog.vue'))

const { t } = useI18n()
const $toast = useToast()
const { wizardData, validationErrors } = useSetupWizard()

const providerRef = computed({
  get: () => wizardData.value.agent.provider,
  set: value => {
    wizardData.value.agent.provider = value || ''
  },
})

const apiKeyRef = computed({
  get: () => wizardData.value.agent.apiKey,
  set: value => {
    wizardData.value.agent.apiKey = value || ''
  },
})

const baseUrlRef = computed({
  get: () => wizardData.value.agent.baseUrl,
  set: value => {
    wizardData.value.agent.baseUrl = value || ''
  },
})

const baseUrlPresetRef = computed({
  get: () => wizardData.value.agent.baseUrlPreset,
  set: value => {
    wizardData.value.agent.baseUrlPreset = value || ''
  },
})

const useProxyRef = computed({
  get: () => wizardData.value.agent.useProxy,
  set: value => {
    wizardData.value.agent.useProxy = Boolean(value)
  },
})

const userAgentRef = computed({
  get: () => wizardData.value.agent.userAgent,
  set: value => {
    wizardData.value.agent.userAgent = value || ''
  },
})

const modelRef = computed({
  get: () => wizardData.value.agent.model,
  set: value => {
    wizardData.value.agent.model = value || ''
  },
})

const maxContextTokensRef = computed({
  get: () => wizardData.value.agent.maxContextTokens,
  set: value => {
    wizardData.value.agent.maxContextTokens = value || 0
  },
})

const authConnectedRef = computed({
  get: () => wizardData.value.agent.authConnected,
  set: value => {
    wizardData.value.agent.authConnected = Boolean(value)
  },
})

const {
  providerItems,
  baseUrlPresetItems,
  models: llmModels,
  selectedProvider,
  selectedModel,
  loadingProviders,
  loadingModels,
  providerConnected,
  showBaseUrlField,
  showApiKeyField,
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
} = useLlmProviderDirectory({
  provider: providerRef,
  apiKey: apiKeyRef,
  baseUrl: baseUrlRef,
  baseUrlPreset: baseUrlPresetRef,
  useProxy: useProxyRef,
  userAgent: userAgentRef,
  model: modelRef,
  maxContextTokens: maxContextTokensRef,
  authConnected: authConnectedRef,
})

let authDialogController: ReturnType<typeof openSharedDialog> | null = null

// 生成 LLM 授权共享弹窗所需的最新状态。
function getProviderAuthDialogProps() {
  return {
    authSession: authSession.value,
    polling: authPolling.value,
    popupBlocked: authPopupBlocked.value,
  }
}

// 打开或刷新 LLM 授权共享弹窗。
function openProviderAuthDialog() {
  const dialogProps = getProviderAuthDialogProps()
  if (authDialogController) {
    authDialogController.updateProps(dialogProps)
    return
  }

  authDialogController = openSharedDialog(
    LlmProviderAuthDialog,
    dialogProps,
    {
      close: () => {
        closeAuthDialog()
        authDialogController = null
      },
      openAuthPage,
      poll: () => {
        void pollAuthSession()
      },
      'update:modelValue': (value: boolean) => {
        if (!value) {
          closeAuthDialog()
          authDialogController = null
        }
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭 LLM 授权共享弹窗控制器。
function closeProviderAuthDialog() {
  authDialogController?.close()
  authDialogController = null
}

const jobIntervalItems = computed(() => [
  { title: t('setting.system.aiAgentJobIntervalDisabled'), value: 0 },
  { title: t('setting.system.aiAgentJobInterval1h'), value: 1 },
  { title: t('setting.system.aiAgentJobInterval3h'), value: 3 },
  { title: t('setting.system.aiAgentJobInterval6h'), value: 6 },
  { title: t('setting.system.aiAgentJobInterval12h'), value: 12 },
  { title: t('setting.system.aiAgentJobInterval24h'), value: 24 },
  { title: t('setting.system.aiAgentJobInterval1w'), value: 168 },
  { title: t('setting.system.aiAgentJobInterval1M'), value: 720 },
])

const thinkingLevelItems = computed(() => [
  { title: t('setting.system.llmThinkingLevelOff'), value: 'off' },
  { title: t('setting.system.llmThinkingLevelAuto'), value: 'auto' },
  { title: t('setting.system.llmThinkingLevelMinimal'), value: 'minimal' },
  { title: t('setting.system.llmThinkingLevelLow'), value: 'low' },
  { title: t('setting.system.llmThinkingLevelMedium'), value: 'medium' },
  { title: t('setting.system.llmThinkingLevelHigh'), value: 'high' },
  { title: t('setting.system.llmThinkingLevelMax'), value: 'max' },
  { title: t('setting.system.llmThinkingLevelXhigh'), value: 'xhigh' },
])

const audioProviderItems = computed(() => [
  { title: t('setting.system.audioProviderOpenAiAudio'), value: 'openai' },
  { title: t('setting.system.audioProviderChatAudio'), value: 'openai_chat_audio' },
  { title: t('setting.system.audioProviderMimo'), value: 'mimo' },
  { title: t('setting.system.audioProviderMinimax'), value: 'minimax' },
])

const providerAuthMethods = computed(() => selectedProvider.value?.oauth_methods || [])
const providerAuthLabel = computed(() => selectedProvider.value?.auth_status?.label || '')
const selectedModelInfo = computed(() => {
  if (!selectedModel.value?.context_tokens_k) return ''
  return t('setting.system.llmModelResolvedHint', {
    context: selectedModel.value.context_tokens_k,
    source: selectedModel.value.source || 'models.dev',
  })
})

async function refreshModels(forceRefresh = true) {
  try {
    await loadModels(forceRefresh)
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
    console.log('Load LLM models failed:', error)
  }
}

async function handleProviderChanged() {
  handleProviderSelection(true)
  if (canRefreshModels.value) {
    await refreshModels(false)
  }
}

function handleModelChanged() {
  applyModelMetadata()
}

async function startProviderAuth(methodId: string) {
  try {
    await startAuth(methodId)
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function disconnectProviderAuth() {
  try {
    await disconnectAuth()
    $toast.success(t('setting.system.llmProviderDisconnected'))
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
  }
}

watch(authDialogVisible, visible => {
  if (visible) {
    openProviderAuthDialog()
    return
  }

  closeProviderAuthDialog()
})

watch([authSession, authPolling, authPopupBlocked], () => {
  authDialogController?.updateProps(getProviderAuthDialogProps())
})

onMounted(async () => {
  try {
    await loadProviders()
    if (wizardData.value.agent.enabled && canRefreshModels.value) {
      await refreshModels(false)
    }
  } catch (error) {
    console.log('Load LLM providers failed:', error)
  }
})
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.agent.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.agent.description') }}</p>
      </div>

      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.agent.info') }}</VAlertTitle>
            {{ t('setupWizard.agent.infoDesc') }}
          </VAlert>
        </VCol>

        <VCol cols="12">
          <VSwitch
            v-model="wizardData.agent.enabled"
            :label="t('setting.system.aiAgentEnable')"
            :hint="t('setting.system.aiAgentEnableHint')"
            persistent-hint
            color="primary"
          />
        </VCol>

        <template v-if="wizardData.agent.enabled">
          <VCol cols="12" md="3">
            <VSwitch
              v-model="wizardData.agent.global"
              :label="t('setting.system.aiAgentGlobal')"
              :hint="t('setting.system.aiAgentGlobalHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12" md="3">
            <VSwitch
              v-model="wizardData.agent.verbose"
              :label="t('setting.system.aiAgentVerbose')"
              :hint="t('setting.system.aiAgentVerboseHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VAutocomplete
              v-model="wizardData.agent.provider"
              :label="t('setting.system.llmProvider')"
              :hint="t('setting.system.llmProviderHint')"
              :items="providerItems"
              :loading="loadingProviders"
              :error="validationErrors.agent.provider"
              :error-messages="validationErrors.agent.provider ? [t('setupWizard.agent.providerRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-robot-outline"
              @update:model-value="handleProviderChanged"
            />
          </VCol>

          <VCol v-if="showBaseUrlField" cols="12" md="6">
            <VCombobox
              :model-value="wizardData.agent.baseUrl"
              @update:model-value="(value: any) => {
                if (typeof value === 'object' && value !== null) {
                  setBaseUrlPreset(value.id, value.value);
                } else {
                  setBaseUrlPreset('', value || '');
                }
              }"
              :label="t('setting.system.llmBaseUrl')"
              :hint="t('setting.system.llmBaseUrlHint')"
              :placeholder="selectedProvider?.default_base_url || 'https://api.deepseek.com'"
              :items="baseUrlPresetItems"
              item-title="title"
              item-value="value"
              persistent-hint
              prepend-inner-icon="mdi-link-variant"
            >
              <template #item="{ props, item }">
                <VListItem v-bind="props" :subtitle="item.raw.subtitle" />
              </template>
            </VCombobox>
          </VCol>

          <VCol v-if="showBaseUrlField" cols="12">
            <VSwitch
              v-model="wizardData.agent.useProxy"
              :label="t('setting.system.llmUseProxy')"
              :hint="t('setting.system.llmUseProxyHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol v-if="showApiKeyField" cols="12" md="6">
            <VTextField
              v-model="wizardData.agent.apiKey"
              :label="selectedProvider?.api_key_label || t('setting.system.llmApiKey')"
              :hint="selectedProvider?.api_key_hint || t('setting.system.llmApiKeyHint')"
              :placeholder="t('setting.system.llmApiKeyPlaceholder')"
              :error="validationErrors.agent.apiKey"
              :error-messages="
                validationErrors.agent.apiKey ? [t('setupWizard.agent.authOrApiKeyRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-key-variant"
              type="password"
            />
          </VCol>

          <VCol v-if="providerAuthMethods.length > 0" cols="12">
            <VAlert type="info" variant="tonal">
              <div class="d-flex flex-column ga-3">
                <div>
                  <div class="text-subtitle-2">{{ t('setting.system.llmProviderAuth') }}</div>
                  <div class="text-body-2">
                    {{ selectedProvider?.description || t('setting.system.llmProviderAuthHint') }}
                  </div>
                  <div v-if="providerConnected" class="text-body-2 mt-2">
                    {{ t('setting.system.llmProviderConnectedAs', { label: providerAuthLabel || selectedProvider?.name }) }}
                  </div>
                </div>

                <div class="d-flex flex-wrap ga-2">
                  <VBtn
                    v-for="method in providerAuthMethods"
                    :key="method.id"
                    color="primary"
                    variant="tonal"
                    prepend-icon="mdi-account-arrow-right-outline"
                    @click="startProviderAuth(method.id)"
                  >
                    {{ method.label }}
                  </VBtn>

                  <VBtn
                    v-if="providerConnected"
                    color="error"
                    variant="text"
                    prepend-icon="mdi-link-off"
                    @click="disconnectProviderAuth"
                  >
                    {{ t('setting.system.llmProviderDisconnect') }}
                  </VBtn>
                </div>
              </div>
            </VAlert>
          </VCol>

          <VCol cols="12" md="6">
            <VCombobox
              :model-value="wizardData.agent.model"
              @update:model-value="(val: any) => {
                wizardData.agent.model = typeof val === 'object' && val !== null ? val.id : val;
                handleModelChanged();
              }"
              :label="t('setting.system.llmModel')"
              :hint="t('setting.system.llmModelHint')"
              :items="llmModels"
              item-title="name"
              item-value="id"
              :loading="loadingModels"
              :error="validationErrors.agent.model"
              :error-messages="validationErrors.agent.model ? [t('setupWizard.agent.modelRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-brain"
            >
              <template #append-inner>
                <VBtn
                  variant="text"
                  icon="mdi-refresh"
                  size="small"
                  :disabled="!canRefreshModels"
                  @click="refreshModels(true)"
                />
              </template>
            </VCombobox>

            <VAlert v-if="selectedModelInfo" type="info" variant="tonal" density="compact" class="mt-2">
              {{ selectedModelInfo }}
            </VAlert>
          </VCol>

          <VCol cols="12" md="6">
            <VTextField
              v-model.number="wizardData.agent.maxContextTokens"
              :label="t('setting.system.llmMaxContextTokens')"
              :hint="t('setting.system.llmMaxContextTokensHint')"
              :error="validationErrors.agent.maxContextTokens"
              :error-messages="
                validationErrors.agent.maxContextTokens ? [t('setupWizard.agent.maxContextTokensRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-counter"
              type="number"
              min="1"
            />
          </VCol>

          <VCol v-if="showBaseUrlField" cols="12" md="6">
            <VTextField
              v-model="wizardData.agent.userAgent"
              :label="t('setting.system.llmUserAgent')"
              :hint="t('setting.system.llmUserAgentHint')"
              persistent-hint
              prepend-inner-icon="mdi-card-account-details-outline"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VTextField
              v-model.number="wizardData.agent.temperature"
              :label="t('setting.system.llmTemperature')"
              :hint="t('setting.system.llmTemperatureHint')"
              persistent-hint
              prepend-inner-icon="mdi-thermometer"
              type="number"
              min="0"
              max="2"
              step="0.1"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VSelect
              v-model="wizardData.agent.thinkingLevel"
              :label="t('setting.system.llmThinking')"
              :hint="t('setting.system.llmThinkingHint')"
              :items="thinkingLevelItems"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12">
            <VSwitch
              v-model="wizardData.agent.supportImageInput"
              :label="t('setting.system.llmSupportImageInput')"
              :hint="t('setting.system.llmSupportImageInputHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12">
            <VSwitch
              v-model="wizardData.agent.supportAudioInput"
              :label="t('setting.system.llmSupportAudioInput')"
              :hint="t('setting.system.llmSupportAudioInputHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <template v-if="wizardData.agent.supportAudioInput">
            <VCol cols="12" md="6">
              <VSelect
                v-model="wizardData.agent.audioInputProvider"
                :label="t('setting.system.audioInputProvider')"
                :hint="t('setting.system.audioInputProviderHint')"
                :items="audioProviderItems"
                persistent-hint
                prepend-inner-icon="mdi-microphone-message"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioInputModel"
                :label="t('setting.system.audioInputModel')"
                :hint="t('setting.system.audioInputModelHint')"
                persistent-hint
                prepend-inner-icon="mdi-waveform"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioInputApiKey"
                :label="t('setting.system.audioInputApiKey')"
                :hint="t('setting.system.audioInputApiKeyHint')"
                persistent-hint
                prepend-inner-icon="mdi-key-variant"
                type="password"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioInputBaseUrl"
                :label="t('setting.system.audioInputBaseUrl')"
                :hint="t('setting.system.audioInputBaseUrlHint')"
                persistent-hint
                prepend-inner-icon="mdi-link-variant"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioInputLanguage"
                :label="t('setting.system.audioInputLanguage')"
                :hint="t('setting.system.audioInputLanguageHint')"
                persistent-hint
                prepend-inner-icon="mdi-translate"
              />
            </VCol>
          </template>

          <VCol cols="12">
            <VSwitch
              v-model="wizardData.agent.supportAudioOutput"
              :label="t('setting.system.llmSupportAudioOutput')"
              :hint="t('setting.system.llmSupportAudioOutputHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <template v-if="wizardData.agent.supportAudioOutput">
            <VCol cols="12" md="6">
              <VSelect
                v-model="wizardData.agent.audioOutputProvider"
                :label="t('setting.system.audioOutputProvider')"
                :hint="t('setting.system.audioOutputProviderHint')"
                :items="audioProviderItems"
                persistent-hint
                prepend-inner-icon="mdi-account-voice"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioOutputModel"
                :label="t('setting.system.audioOutputModel')"
                :hint="t('setting.system.audioOutputModelHint')"
                persistent-hint
                prepend-inner-icon="mdi-waveform"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioOutputApiKey"
                :label="t('setting.system.audioOutputApiKey')"
                :hint="t('setting.system.audioOutputApiKeyHint')"
                persistent-hint
                prepend-inner-icon="mdi-key-variant"
                type="password"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioOutputBaseUrl"
                :label="t('setting.system.audioOutputBaseUrl')"
                :hint="t('setting.system.audioOutputBaseUrlHint')"
                persistent-hint
                prepend-inner-icon="mdi-link-variant"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.audioOutputVoice"
                :label="t('setting.system.audioOutputVoice')"
                :hint="t('setting.system.audioOutputVoiceHint')"
                persistent-hint
                prepend-inner-icon="mdi-account-voice"
              />
            </VCol>

            <VCol cols="12">
              <VSwitch
                v-model="wizardData.agent.audioOutputIncludeText"
                :label="t('setting.system.audioOutputIncludeText')"
                :hint="t('setting.system.audioOutputIncludeTextHint')"
                persistent-hint
                color="primary"
              />
            </VCol>
          </template>

          <VCol cols="12">
            <VSelect
              v-model="wizardData.agent.jobInterval"
              :label="t('setting.system.aiAgentJobInterval')"
              :hint="t('setting.system.aiAgentJobIntervalHint')"
              :items="jobIntervalItems"
              persistent-hint
              prepend-inner-icon="mdi-timer-outline"
            />
          </VCol>

          <VCol cols="12">
            <VSwitch
              v-model="wizardData.agent.retryTransfer"
              :label="t('setting.system.aiAgentRetryTransfer')"
              :hint="t('setting.system.aiAgentRetryTransferHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12">
            <VSwitch
              v-model="wizardData.agent.recommendEnabled"
              :label="t('setting.system.aiRecommendEnabled')"
              :hint="t('setting.system.aiRecommendEnabledHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol v-if="wizardData.agent.recommendEnabled" cols="12" md="6">
            <VTextarea
              v-model="wizardData.agent.recommendUserPreference"
              :label="t('setting.system.aiRecommendUserPreference')"
              :hint="t('setting.system.aiRecommendUserPreferenceHint')"
              persistent-hint
              prepend-inner-icon="mdi-account-heart-outline"
              rows="2"
              auto-grow
            />
          </VCol>

          <VCol v-if="wizardData.agent.recommendEnabled" cols="12" md="6">
            <VTextField
              v-model.number="wizardData.agent.recommendMaxItems"
              :label="t('setting.system.aiRecommendMaxItems')"
              :hint="t('setting.system.aiRecommendMaxItemsHint')"
              :error="validationErrors.agent.recommendMaxItems"
              :error-messages="
                validationErrors.agent.recommendMaxItems ? [t('setupWizard.agent.recommendMaxItemsRequired')] : []
              "
              persistent-hint
              prepend-inner-icon="mdi-format-list-numbered"
              type="number"
              min="1"
            />
          </VCol>
        </template>
      </VRow>
    </VCardText>
  </VCard>
</template>
