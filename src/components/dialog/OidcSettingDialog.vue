<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue: boolean
  oidcEnabled: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue', 'update:oidcEnabled'])

const { t } = useI18n()
const $toast = useToast()

// 内部状态
const show = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// ============ 管理员：OIDC 服务配置 ============
const oidcSettings = ref({
  OIDC_ENABLE: false,
  OIDC_ISSUER: null as string | null,
  OIDC_CLIENT_ID: null as string | null,
  OIDC_CLIENT_SECRET: null as string | null,
  OIDC_SCOPES: 'openid profile email',
})

const oidcConfigEnabled = computed(() => !!oidcSettings.value.OIDC_ENABLE && !!oidcSettings.value.OIDC_ISSUER)
const showSecret = ref(false)
const oidcTesting = ref(false)
const oidcTestResult = ref<{ success: boolean; message: string } | null>(null)
const oidcConfigChanged = ref(false)
const oidcSaving = ref(false)

const canSave = computed(() => {
  if (!oidcSettings.value.OIDC_ENABLE) return true
  if (oidcConfigChanged.value) return !!oidcTestResult.value?.success
  return true
})

// 监听配置变化
watch(
  () => [
    oidcSettings.value.OIDC_ISSUER,
    oidcSettings.value.OIDC_CLIENT_ID,
    oidcSettings.value.OIDC_CLIENT_SECRET,
    oidcSettings.value.OIDC_SCOPES,
  ],
  () => {
    if (oidcSettings.value.OIDC_ENABLE) {
      oidcConfigChanged.value = true
      oidcTestResult.value = null
    }
  },
)

// 推算回调地址
const computedOidcRedirectUri = computed(() => `${window.location.origin}/api/v1/login/oidc/callback`)

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
    oidcConfigChanged.value = false
    oidcTestResult.value = null
  }
  catch (error) {
    console.log(error)
  }
}

async function saveOidcSettings() {
  oidcSaving.value = true
  try {
    const result: { [key: string]: any } = await api.post('system/env', {
      OIDC_ENABLE: oidcSettings.value.OIDC_ENABLE,
      OIDC_ISSUER: oidcSettings.value.OIDC_ISSUER || null,
      OIDC_CLIENT_ID: oidcSettings.value.OIDC_CLIENT_ID || null,
      OIDC_CLIENT_SECRET: oidcSettings.value.OIDC_CLIENT_SECRET || null,
      OIDC_SCOPES: oidcSettings.value.OIDC_SCOPES || 'openid profile email',
    })
    if (result.success) {
      oidcTestResult.value = null
      oidcConfigChanged.value = false
      emit('update:oidcEnabled', oidcConfigEnabled.value)
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
  finally {
    oidcSaving.value = false
  }
}

async function testOidcConnection() {
  if (!oidcSettings.value.OIDC_ISSUER) {
    $toast.warning(t('setting.oidc.issuerRequired'))
    return
  }
  oidcTesting.value = true
  oidcTestResult.value = null
  try {
    const result: { [key: string]: any } = await api.post('login/oidc/test', {
      issuer: oidcSettings.value.OIDC_ISSUER,
    })
    if (result.success) {
      oidcTestResult.value = { success: true, message: t('setting.oidc.testSuccess') }
      oidcConfigChanged.value = false
    } else {
      oidcTestResult.value = { success: false, message: result.message || t('setting.oidc.testError', { error: 'Unknown' }) }
    }
  }
  catch (error: any) {
    oidcTestResult.value = { success: false, message: t('setting.oidc.testError', { error: error.message || String(error) }) }
  }
  finally {
    oidcTesting.value = false
  }
}

function copyValue(text: string) {
  navigator.clipboard.writeText(text)
  $toast.success(t('setting.oidc.redirectUriCopy'))
}

// 加载
onMounted(() => {
  loadOidcSettings()
})

// 弹窗每次打开时重新加载配置
watch(show, (val) => {
  if (val) {
    loadOidcSettings()
  }
})
</script>

<template>
  <VDialog v-model="show" max-width="700" scrollable>
    <VCard :title="t('setting.oidc.title')">
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <!-- 启用开关 -->
          <div class="d-flex align-center justify-space-between mb-4">
            <div class="flex-grow-1">
              <VAlert
                v-if="oidcConfigEnabled"
                type="success"
                variant="tonal"
                class="mb-0"
                density="compact"
              >
                {{ t('setting.oidc.enabledStatus') }}
              </VAlert>
              <VAlert
                v-else
                type="info"
                variant="tonal"
                class="mb-0"
                density="compact"
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
                  density="compact"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_CLIENT_ID"
                  :label="t('setting.oidc.clientId')"
                  :placeholder="t('setting.oidc.clientIdPlaceholder')"
                  prepend-inner-icon="mdi-identifier"
                  clearable
                  density="compact"
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
                  density="compact"
                  @click:append-inner="showSecret = !showSecret"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="oidcSettings.OIDC_SCOPES"
                  :label="t('setting.oidc.scopes')"
                  placeholder="openid profile email"
                  :hint="t('setting.oidc.scopesHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-format-list-checks"
                  density="compact"
                />
              </VCol>
            </VRow>

            <!-- 测试连接 -->
            <div class="d-flex flex-wrap gap-3 mt-4 align-center">
              <VBtn
                variant="tonal"
                color="info"
                prepend-icon="mdi-connection"
                :loading="oidcTesting"
                @click="testOidcConnection"
              >
                {{ t('setting.oidc.testConnection') }}
              </VBtn>
              <VAlert
                v-if="oidcTestResult"
                :type="oidcTestResult.success ? 'success' : 'error'"
                variant="tonal"
                density="compact"
                class="flex-grow-1"
              >
                {{ oidcTestResult.message }}
              </VAlert>
            </div>

            <!-- 使用指南 -->
            <VExpansionPanels class="mt-4">
              <VExpansionPanel>
                <VExpansionPanelTitle>{{ t('setting.oidc.usageGuide') }}</VExpansionPanelTitle>
                <VExpansionPanelText>
                  <div class="text-body-2">
                    <p class="mb-2">{{ t('setting.oidc.guideStep1') }}</p>
                    <p class="mb-2">
                      {{ t('setting.oidc.guideStep2') }}
                      <VChip size="small" @click="copyValue(computedOidcRedirectUri)">
                        {{ computedOidcRedirectUri }}
                      </VChip>
                    </p>
                    <p class="mb-2">{{ t('setting.oidc.guideStep3') }}</p>
                    <p class="mb-2">{{ t('setting.oidc.guideStep4') }}</p>
                    <p class="mb-0">{{ t('setting.oidc.guideStep5') }}</p>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </template>

          <!-- 保存按钮 -->
          <div class="mt-4">
            <VBtn prepend-icon="mdi-content-save" :disabled="!canSave" :loading="oidcSaving" @click="saveOidcSettings">
              {{ t('common.save') }}
            </VBtn>
          </div>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn @click="show = false">{{ t('common.close') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
