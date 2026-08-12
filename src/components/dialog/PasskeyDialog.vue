<script lang="ts" setup>
import { bufferToBase64Url, base64UrlToUint8Array } from '@/@core/utils/navigator'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { formatDateDifference } from '@core/utils/formatters'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import type { PassKey } from '@/api/types'
import { isAxiosError } from 'axios'

interface Props {
  modelValue: boolean
}

// WebAuthn 相关接口定义
interface PublicKeyCredentialDescriptorJSON {
  id: string
  type: 'public-key'
  transports?: AuthenticatorTransport[]
}

const props = defineProps<Props>()

const emit = defineEmits(['update:modelValue', 'update:passkeyList', 'verifyPassword'])

const { t, locale } = useI18n()
const display = useDisplay()
const $toast = useToast()

// 内部状态
const show = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// PassKey列表
const passkeyList = ref<PassKey[]>([])

// 列表请求状态用于区分加载失败和合法空列表。
const passkeyListLoading = ref(false)
const passkeyListFailed = ref(false)

// PassKey注册loading
const passkeyRegistering = ref(false)

// PassKey名称
const passkeyName = ref('')

let passkeyListGeneration = 0
let passkeyRegistrationGeneration = 0
let passkeyRegistrationAbortController: AbortController | null = null

// 注册尝试只属于当前对话框会话，结束会话或开始新尝试时取消整条 WebAuthn 链路。
function invalidatePasskeyRegistration() {
  passkeyRegistrationGeneration += 1
  passkeyRegistrationAbortController?.abort()
  passkeyRegistrationAbortController = null
  passkeyRegistering.value = false
}

// 格式化日期
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(locale.value)
}

// 获取PassKey列表
async function fetchPassKeyList() {
  const generation = ++passkeyListGeneration
  passkeyListLoading.value = true
  passkeyListFailed.value = false
  try {
    const result = await api.get<PassKey[]>('mfa/passkey/list')
    if (generation !== passkeyListGeneration || !props.modelValue) return
    passkeyList.value = result || []
    emit('update:passkeyList', passkeyList.value)
  } catch (error) {
    if (generation !== passkeyListGeneration || !props.modelValue) return
    passkeyListFailed.value = true
    console.error(error)
  } finally {
    if (generation === passkeyListGeneration) passkeyListLoading.value = false
  }
}

// 注册PassKey
async function registerPassKey() {
  if (!passkeyName.value) {
    $toast.error(t('profile.passkeyNameRequired'))
    return
  }

  // 检查浏览器环境
  if (!window.PublicKeyCredential) {
    if (!window.isSecureContext) {
      $toast.error(t('login.passkeySecureContextRequired'))
    } else {
      $toast.error(t('login.passkeyNotSupported'))
    }
    return
  }

  invalidatePasskeyRegistration()
  const generation = passkeyRegistrationGeneration
  const registrationAbortController = new AbortController()
  passkeyRegistrationAbortController = registrationAbortController
  const registrationName = passkeyName.value
  passkeyRegistering.value = true
  try {
    // 1. 开始注册
    const startResult = await api.post<{ options: string; transaction_token: string }>(
      'mfa/passkey/register/start',
      {
        name: registrationName,
      },
      {
        signal: registrationAbortController.signal,
        feedback: 'silent',
      },
    )

    if (generation !== passkeyRegistrationGeneration || !props.modelValue) return

    const { options, transaction_token: transactionToken } = startResult
    const publicKeyOptions = JSON.parse(options)

    // 2. 调用WebAuthn API
    const credential = (await navigator.credentials.create({
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToUint8Array(publicKeyOptions.challenge),
        user: {
          ...publicKeyOptions.user,
          id: base64UrlToUint8Array(publicKeyOptions.user.id),
        },
        excludeCredentials: publicKeyOptions.excludeCredentials?.map((cred: PublicKeyCredentialDescriptorJSON) => ({
          ...cred,
          id: base64UrlToUint8Array(cred.id),
        })),
      },
      signal: registrationAbortController.signal,
    })) as PublicKeyCredential

    if (generation !== passkeyRegistrationGeneration || !props.modelValue) return

    if (!credential) {
      $toast.error(t('profile.passkeyRegisterCancelled'))
      return
    }

    // 3. 转换credential为可传输格式
    const response = credential.response as AuthenticatorAttestationResponse
    const credentialJSON = {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: bufferToBase64Url(response.attestationObject),
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
      },
    }

    // 4. 完成注册
    await api.post(
      'mfa/passkey/register/finish',
      {
        credential: credentialJSON,
        transaction_token: transactionToken,
        name: registrationName,
      },
      {
        signal: registrationAbortController.signal,
        feedback: 'silent',
      },
    )

    if (generation !== passkeyRegistrationGeneration || !props.modelValue) return

    $toast.success(t('profile.passkeyRegisterSuccess'))
    passkeyName.value = ''
    await fetchPassKeyList()
  } catch (error) {
    if (generation !== passkeyRegistrationGeneration || !props.modelValue) return
    console.error('PassKey注册失败:', error)
    if (error instanceof Error && error.name === 'NotAllowedError') {
      $toast.error(t('profile.passkeyRegisterCancelled'))
    } else if (error instanceof Error && error.name === 'NotSupportedError') {
      $toast.error(t('login.passkeyNotSupported'))
    } else if (error instanceof Error && error.message.includes('start failed')) {
      $toast.error(t('login.passkeyLoginStartFailed'))
    } else if (isAxiosError(error) && error.response) {
      $toast.error(error.response.data?.message || error.response.data?.detail || t('profile.passkeyRegisterFailed'))
    } else {
      $toast.error(error instanceof Error ? error.message : t('profile.passkeyRegisterFailed'))
    }
  } finally {
    if (generation === passkeyRegistrationGeneration) passkeyRegistering.value = false
    if (passkeyRegistrationAbortController === registrationAbortController) {
      passkeyRegistrationAbortController = null
    }
  }
}

// 删除PassKey
async function deletePassKey(passkeyId: number) {
  emit('verifyPassword', {
    title: t('profile.deletePasskey'),
    text: t('profile.confirmToDeletePasskey'),
    callback: async (password: string) => {
      try {
        await api.post('mfa/passkey/delete', { passkey_id: passkeyId, password }, { feedback: 'silent' })
        $toast.success(t('profile.passkeyDeleteSuccess'))
        await fetchPassKeyList()
      } catch (error) {
        console.error(error)
        $toast.error(getApiBusinessErrorMessage(error) || t('profile.passkeyDeleteFailed'))
      }
    },
  })
}

// 监听弹窗打开，自动加载列表
watch(
  () => props.modelValue,
  val => {
    if (val) {
      fetchPassKeyList()
      passkeyName.value = ''
    } else {
      // 弹窗关闭时，清空数据
      passkeyListGeneration += 1
      invalidatePasskeyRegistration()
      passkeyName.value = ''
      passkeyList.value = []
      passkeyListLoading.value = false
      passkeyListFailed.value = false
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  passkeyListGeneration += 1
  invalidatePasskeyRegistration()
})
</script>

<template>
  <VDialog v-model="show" max-width="45rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="material-symbols:passkey" class="me-2" />
          {{ t('profile.passkeyManagement') }}
        </VCardTitle>
        <VDialogCloseBtn @click="show = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <p class="mb-6">
          {{ t('profile.passkeyAppDescription') }}
        </p>

        <!-- 安全警告 -->
        <VAlert type="warning" variant="tonal" class="mb-6" icon="mdi-alert">
          <i18n-t keypath="profile.passkeyDomainWarning" tag="span">
            <template #domain>
              <b>{{ t('profile.accessDomain') }}</b>
            </template>
          </i18n-t>
        </VAlert>

        <!-- 注册新通行密钥 -->
        <VCard variant="tonal" class="mb-6">
          <VCardText>
            <h5 class="text-h5 font-weight-medium mb-2">{{ t('profile.registerNewPasskey') }}</h5>
            <p class="mb-4">{{ t('profile.passkeyDescription') }}</p>
            <VForm @submit.prevent="registerPassKey">
              <VTextField
                v-model="passkeyName"
                :label="t('profile.passkeyName')"
                :placeholder="t('profile.passkeyNamePlaceholder')"
                class="mb-4"
                variant="outlined"
                prepend-inner-icon="mdi-form-textbox"
              />
              <VBtn color="primary" type="submit" :loading="passkeyRegistering" prepend-icon="mdi-plus">
                {{ t('profile.registerPasskey') }}
              </VBtn>
            </VForm>
          </VCardText>
        </VCard>

        <!-- 已注册的通行密钥列表 -->
        <LoadingBanner v-if="passkeyListLoading" class="mt-6" />
        <VAlert
          v-else-if="passkeyListFailed"
          type="error"
          variant="tonal"
          :title="t('common.serverConnectionFailed')"
          class="mt-6"
        >
          <template #append>
            <VBtn color="error" variant="text" :loading="passkeyListLoading" @click="fetchPassKeyList">
              {{ t('common.retry') }}
            </VBtn>
          </template>
        </VAlert>
        <div v-else-if="passkeyList.length > 0" class="mt-6 px-4">
          <div
            v-for="passkey in passkeyList"
            :key="passkey.id"
            class="py-4 d-flex align-center justify-space-between border-b last:border-0"
          >
            <div>
              <div class="text-body-1 font-weight-bold mb-1">{{ passkey.name }}</div>
              <div class="text-caption text-disabled d-flex flex-wrap gap-x-3">
                <span>{{ t('profile.createdAt') }} {{ formatDate(passkey.created_at) }}</span>
                <span v-if="passkey.last_used_at">
                  {{ t('profile.lastUsedAt') }} {{ formatDateDifference(passkey.last_used_at) }}
                </span>
              </div>
            </div>
            <div>
              <VBtn
                variant="flat"
                color="error"
                size="small"
                class="rounded delete-btn"
                @click="deletePassKey(passkey.id)"
              >
                <VIcon icon="mdi-trash-can-outline" size="20" />
              </VBtn>
            </div>
          </div>
        </div>
        <VAlert v-else type="info" variant="tonal" class="mt-6">
          {{ t('profile.noPasskeys') }}
        </VAlert>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" class="px-5" @click="show = false">{{ t('common.close') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.v-btn.delete-btn {
  min-width: 45px;
  padding: 0;
  background-color: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
  transition: all 0.2s ease;
}

.v-btn.delete-btn:hover {
  background-color: rgba(var(--v-theme-error), 0.2);
  color: rgb(var(--v-theme-error));
}
</style>
