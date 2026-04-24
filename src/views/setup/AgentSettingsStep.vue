<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, validationErrors } = useSetupWizard()

const llmModels = ref<string[]>([])
const loadingModels = ref(false)

const providerItems = [
  { title: 'OpenAI', value: 'openai' },
  { title: 'Google', value: 'google' },
  { title: 'DeepSeek', value: 'deepseek' },
]

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

async function loadLlmModels() {
  if (!wizardData.value.agent.provider || !wizardData.value.agent.apiKey) {
    return
  }

  loadingModels.value = true
  try {
    const result: { [key: string]: any } = await api.get('system/llm-models', {
      params: {
        provider: wizardData.value.agent.provider,
        api_key: wizardData.value.agent.apiKey,
        base_url: wizardData.value.agent.baseUrl,
      },
    })

    if (result.success) {
      llmModels.value = result.data || []
      if (!wizardData.value.agent.model && llmModels.value.length > 0) {
        wizardData.value.agent.model = llmModels.value[0]
      }
    }
  } catch (error) {
    console.log('Load LLM models failed:', error)
  } finally {
    loadingModels.value = false
  }
}

onMounted(() => {
  if (wizardData.value.agent.enabled && wizardData.value.agent.apiKey) {
    loadLlmModels()
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

          <VCol cols="12" md="3">
            <VSwitch
              v-model="wizardData.agent.supportImageInput"
              :label="t('setting.system.llmSupportImageInput')"
              :hint="t('setting.system.llmSupportImageInputHint')"
              persistent-hint
              color="primary"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VSelect
              v-model="wizardData.agent.provider"
              :label="t('setting.system.llmProvider')"
              :hint="t('setting.system.llmProviderHint')"
              :items="providerItems"
              :error="validationErrors.agent.provider"
              :error-messages="validationErrors.agent.provider ? [t('setupWizard.agent.providerRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-robot-outline"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.agent.baseUrl"
              :label="t('setting.system.llmBaseUrl')"
              :hint="t('setting.system.llmBaseUrlHint')"
              placeholder="https://api.deepseek.com"
              persistent-hint
              prepend-inner-icon="mdi-link-variant"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VTextField
              v-model="wizardData.agent.apiKey"
              :label="t('setting.system.llmApiKey')"
              :hint="t('setting.system.llmApiKeyHint')"
              :placeholder="t('setting.system.llmApiKeyPlaceholder')"
              :error="validationErrors.agent.apiKey"
              :error-messages="validationErrors.agent.apiKey ? [t('setupWizard.agent.apiKeyRequired')] : []"
              persistent-hint
              prepend-inner-icon="mdi-key-variant"
              type="password"
            />
          </VCol>

          <VCol cols="12" md="6">
            <VCombobox
              v-model="wizardData.agent.model"
              :label="t('setting.system.llmModel')"
              :hint="t('setting.system.llmModelHint')"
              :items="llmModels"
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
                  :disabled="!wizardData.agent.provider || !wizardData.agent.apiKey"
                  @click="loadLlmModels"
                />
              </template>
            </VCombobox>
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

          <VCol cols="12" md="6">
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
