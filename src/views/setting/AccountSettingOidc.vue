<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

const $toast = useToast()

const showSecret = ref(false)

const oidcSettings = ref({
  OIDC_ENABLE: false,
  OIDC_ISSUER: null as string | null,
  OIDC_CLIENT_ID: null as string | null,
  OIDC_CLIENT_SECRET: null as string | null,
  OIDC_SCOPES: 'openid profile email',
})

// OIDC 是否已启用（开关打开且 Issuer 已配置）
const oidcEnabled = computed(() => !!oidcSettings.value.OIDC_ENABLE && !!oidcSettings.value.OIDC_ISSUER)

const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)
const configChanged = ref(false)

// 保存按钮是否可用：测试通过后才能保存，关闭开关时可直接保存
const canSave = computed(() => {
  if (!oidcSettings.value.OIDC_ENABLE) return true
  return !!testResult.value?.success && !configChanged.value
})

// 监听配置变化，标记为未测试
watch(
  () => [
    oidcSettings.value.OIDC_ISSUER,
    oidcSettings.value.OIDC_CLIENT_ID,
    oidcSettings.value.OIDC_CLIENT_SECRET,
    oidcSettings.value.OIDC_SCOPES,
  ],
  () => {
    if (oidcSettings.value.OIDC_ENABLE) {
      configChanged.value = true
      testResult.value = null
    }
  },
)

async function loadOidcSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.data) {
      if (result.data.OIDC_ENABLE !== undefined)
        oidcSettings.value.OIDC_ENABLE = !!result.data.OIDC_ENABLE
      if (result.data.OIDC_ISSUER !== undefined)
        oidcSettings.value.OIDC_ISSUER = result.data.OIDC_ISSUER || null
      if (result.data.OIDC_CLIENT_ID !== undefined)
        oidcSettings.value.OIDC_CLIENT_ID = result.data.OIDC_CLIENT_ID || null
      if (result.data.OIDC_CLIENT_SECRET !== undefined)
        oidcSettings.value.OIDC_CLIENT_SECRET = result.data.OIDC_CLIENT_SECRET || null
      if (result.data.OIDC_SCOPES !== undefined)
        oidcSettings.value.OIDC_SCOPES = result.data.OIDC_SCOPES || 'openid profile email'
    }
    configChanged.value = false
    testResult.value = null
  }
  catch (error) {
    console.log(error)
  }
}

async function saveOidcSettings() {
  try {
    const result: { [key: string]: any } = await api.post('system/env', {
      OIDC_ENABLE: oidcSettings.value.OIDC_ENABLE,
      OIDC_ISSUER: oidcSettings.value.OIDC_ISSUER || null,
      OIDC_CLIENT_ID: oidcSettings.value.OIDC_CLIENT_ID || null,
      OIDC_CLIENT_SECRET: oidcSettings.value.OIDC_CLIENT_SECRET || null,
      OIDC_SCOPES: oidcSettings.value.OIDC_SCOPES || 'openid profile email',
    })
    if (result.success) {
      testResult.value = null
      configChanged.value = false
      $toast.success(t('setting.oidc.saveSuccess'))
    }
    else {
      $toast.error(result.message || t('setting.oidc.saveFailed'))
    }
  }
  catch (error) {
    console.log(error)
    $toast.error(t('setting.oidc.saveFailed'))
  }
}

async function testOidcConnection() {
  if (!oidcSettings.value.OIDC_ISSUER) {
    $toast.warning(t('setting.oidc.issuerRequired'))
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const result: { [key: string]: any } = await api.get('system/setting/OIDC_ISSUER')
    const issuer = result.data?.value
    if (!issuer) {
      testResult.value = { success: false, message: t('setting.oidc.testNotSaved') }
      testing.value = false
      return
    }

    const discoveryUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
    const response = await fetch(discoveryUrl)
    if (!response.ok) {
      testResult.value = { success: false, message: t('setting.oidc.testDiscoveryFailed', { status: response.status }) }
      testing.value = false
      return
    }

    const discovery = await response.json()
    if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
      testResult.value = { success: false, message: t('setting.oidc.testInvalidDiscovery') }
      testing.value = false
      return
    }

    testResult.value = { success: true, message: t('setting.oidc.testSuccess') }
    configChanged.value = false
  }
  catch (error: any) {
    testResult.value = { success: false, message: t('setting.oidc.testError', { error: error.message || String(error) }) }
  }
  finally {
    testing.value = false
  }
}

async function loadPageData() {
  await loadOidcSettings()
}

onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.oidc.title') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.oidc.description') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <VRow>
              <VCol cols="12">
                <div class="d-flex align-center justify-space-between">
                  <div class="flex-grow-1">
                    <VAlert
                      v-if="oidcEnabled"
                      type="success"
                      variant="tonal"
                      class="mb-0"
                    >
                      {{ t('setting.oidc.enabledStatus') }}
                    </VAlert>
                    <VAlert
                      v-else
                      type="info"
                      variant="tonal"
                      class="mb-0"
                    >
                      {{ t('setting.oidc.disabledStatus') }}
                    </VAlert>
                  </div>
                  <VSwitch
                    v-model="oidcSettings.OIDC_ENABLE"
                    color="primary"
                    hide-details
                    class="flex-shrink-0 ml-4"
                  />
                </div>
              </VCol>
            </VRow>
            <template v-if="oidcSettings.OIDC_ENABLE">
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_ISSUER"
                  :label="t('setting.oidc.issuer')"
                  :placeholder="t('setting.oidc.issuerPlaceholder')"
                  :hint="t('setting.oidc.issuerHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-openid"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_CLIENT_ID"
                  :label="t('setting.oidc.clientId')"
                  :placeholder="t('setting.oidc.clientIdPlaceholder')"
                  prepend-inner-icon="mdi-identifier"
                  clearable
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_CLIENT_SECRET"
                  :label="t('setting.oidc.clientSecret')"
                  :placeholder="t('setting.oidc.clientSecretPlaceholder')"
                  :type="showSecret ? 'text' : 'password'"
                  :append-inner-icon="showSecret ? 'mdi-eye-off' : 'mdi-eye'"
                  prepend-inner-icon="mdi-key"
                  clearable
                  @click:append-inner="showSecret = !showSecret"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_SCOPES"
                  :label="t('setting.oidc.scopes')"
                  :placeholder="'openid profile email'"
                  :hint="t('setting.oidc.scopesHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-format-list-checks"
                />
              </VCol>
            </VRow>
            </template>
          </VForm>
        </VCardText>
        <template v-if="oidcSettings.OIDC_ENABLE">
        <VCardText>
          <div class="d-flex flex-wrap gap-4 mt-4 align-center">
            <VBtn prepend-icon="mdi-content-save" :disabled="!canSave" @click="saveOidcSettings">
              {{ t('common.save') }}
            </VBtn>
            <VBtn
              variant="tonal"
              color="info"
              prepend-icon="mdi-connection"
              :loading="testing"
              @click="testOidcConnection"
            >
              {{ t('setting.oidc.testConnection') }}
            </VBtn>
            <VAlert
              v-if="testResult"
              :type="testResult.success ? 'success' : 'error'"
              variant="tonal"
              density="compact"
              class="flex-grow-1"
            >
              {{ testResult.message }}
            </VAlert>
          </div>
        </VCardText>
        </template>
      </VCard>
    </VCol>
  </VRow>

  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.oidc.usageGuide') }}</VCardTitle>
        </VCardItem>
        <VCardText>
          <div class="text-body-2">
            <p class="mb-2">{{ t('setting.oidc.guideStep1') }}</p>
            <p class="mb-2">{{ t('setting.oidc.guideStep2') }}</p>
            <p class="mb-2">{{ t('setting.oidc.guideStep3') }}</p>
            <p class="mb-2">{{ t('setting.oidc.guideStep4') }}</p>
            <p class="mb-0">{{ t('setting.oidc.guideStep5') }}</p>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
