<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'
import { useLlmProviderDirectory } from '@/composables/useLlmProviderDirectory'

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
  model: modelRef,
  maxContextTokens: maxContextTokensRef,
  authConnected: authConnectedRef,
})

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
              v-model="wizardData.agent.supportAudioInputOutput"
              :label="t('setting.system.llmSupportAudioInputOutput')"
              :hint="t('setting.system.llmSupportAudioInputOutputHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <template v-if="wizardData.agent.supportAudioInputOutput">
            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceApiKey"
                :label="t('setting.system.aiVoiceApiKey')"
                :hint="t('setting.system.aiVoiceApiKeyHint')"
                persistent-hint
                prepend-inner-icon="mdi-key-variant"
                type="password"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceBaseUrl"
                :label="t('setting.system.aiVoiceBaseUrl')"
                :hint="t('setting.system.aiVoiceBaseUrlHint')"
                persistent-hint
                prepend-inner-icon="mdi-link-variant"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceSttModel"
                :label="t('setting.system.aiVoiceSttModel')"
                :hint="t('setting.system.aiVoiceSttModelHint')"
                persistent-hint
                prepend-inner-icon="mdi-waveform"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceTtsModel"
                :label="t('setting.system.aiVoiceTtsModel')"
                :hint="t('setting.system.aiVoiceTtsModelHint')"
                persistent-hint
                prepend-inner-icon="mdi-waveform"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceTtsVoice"
                :label="t('setting.system.aiVoiceTtsVoice')"
                :hint="t('setting.system.aiVoiceTtsVoiceHint')"
                persistent-hint
                prepend-inner-icon="mdi-account-voice"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="wizardData.agent.voiceLanguage"
                :label="t('setting.system.aiVoiceLanguage')"
                :hint="t('setting.system.aiVoiceLanguageHint')"
                persistent-hint
                prepend-inner-icon="mdi-translate"
              />
            </VCol>

            <VCol cols="12">
              <VSwitch
                v-model="wizardData.agent.voiceReplyWithText"
                :label="t('setting.system.aiVoiceReplyWithText')"
                :hint="t('setting.system.aiVoiceReplyWithTextHint')"
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

  <VDialog v-model="authDialogVisible" max-width="560">
    <VCard>
      <VCardTitle>{{ t('setting.system.llmProviderAuthDialogTitle') }}</VCardTitle>
      <VCardText class="d-flex flex-column ga-4">
        <VAlert v-if="authSession?.instructions" type="info" variant="tonal">
          {{ authSession.instructions }}
        </VAlert>

        <VAlert v-if="authPopupBlocked" type="warning" variant="tonal">
          {{ t('setting.system.llmProviderPopupBlocked') }}
        </VAlert>

        <div v-if="authSession?.user_code">
          <div class="text-caption text-medium-emphasis mb-1">{{ t('setting.system.llmProviderDeviceCode') }}</div>
          <div class="text-h5 font-weight-bold">{{ authSession.user_code }}</div>
        </div>

        <div v-if="authSession?.message" class="text-body-2">
          {{ authSession.message }}
        </div>

        <div class="d-flex flex-wrap ga-2">
          <VBtn color="primary" prepend-icon="mdi-open-in-new" @click="openAuthPage">
            {{ t('setting.system.llmProviderOpenAuthPage') }}
          </VBtn>
          <VBtn
            variant="tonal"
            prepend-icon="mdi-refresh"
            :loading="authPolling"
            @click="pollAuthSession"
          >
            {{ t('setting.system.llmProviderCheckAuthStatus') }}
          </VBtn>
        </div>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="closeAuthDialog">
          {{ t('common.close') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
