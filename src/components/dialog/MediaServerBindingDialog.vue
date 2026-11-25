<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { getApiErrorMessage } from '@/api/client'
import {
  bindMediaServerAccount,
  listMediaServerAccountBindings,
  unbindMediaServerAccount,
  type MediaServerAccountBinding,
} from '@/api/mediaServer'
import { getLogoUrl, hasLogo } from '@/utils/imageUtils'

/** 当前用户管理各媒体服务器播放同步账号绑定的共享弹窗。 */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: true })
const emit = defineEmits<{ (event: 'close'): void; (event: 'update:modelValue', value: boolean): void }>()

const { t } = useI18n()
const toast = useToast()

const loading = ref(false)
const submitting = ref(false)
const unbindingServer = ref<string | null>(null)
const error = ref('')
const formError = ref('')
const bindings = ref<MediaServerAccountBinding[]>([])

// 当前展开绑定表单的目标服务器名称
const activeServer = ref<string | null>(null)
const authMode = ref<'password' | 'token'>('password')
const username = ref('')
const password = ref('')
const directToken = ref('')
const showPassword = ref(false)

let controller: AbortController | null = null
let generation = 0
let disposed = false

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const activeBinding = computed(() => bindings.value.find(item => item.server === activeServer.value) ?? null)

function resetForm() {
  activeServer.value = null
  authMode.value = 'password'
  username.value = ''
  password.value = ''
  directToken.value = ''
  showPassword.value = false
  formError.value = ''
}

function clearSession() {
  generation++
  controller?.abort()
  loading.value = false
  submitting.value = false
  unbindingServer.value = null
  error.value = ''
  resetForm()
}

async function loadBindings() {
  controller?.abort()
  controller = new AbortController()
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const result = await listMediaServerAccountBindings(controller.signal)
    if (!disposed && visible.value && current === generation) {
      bindings.value = result
    }
  } catch (cause) {
    if (!disposed && visible.value && current === generation) {
      error.value = getApiErrorMessage(cause) || t('mediaServerBinding.loadFailed')
    }
  } finally {
    if (!disposed && current === generation) loading.value = false
  }
}

function openBindForm(item: MediaServerAccountBinding) {
  activeServer.value = item.server
  authMode.value = 'password'
  username.value = item.remote_username ?? ''
  password.value = ''
  directToken.value = ''
  showPassword.value = false
  formError.value = ''
}

async function submitBinding() {
  const target = activeBinding.value
  if (!target || submitting.value) return
  formError.value = ''
  const useToken = target.server_type === 'plex' && authMode.value === 'token'
  if (useToken) {
    if (!directToken.value.trim()) {
      formError.value = t('mediaServerBinding.tokenRequired')
      return
    }
  } else if (!username.value.trim() || !password.value) {
    formError.value = t('mediaServerBinding.credentialsRequired')
    return
  }

  submitting.value = true
  try {
    const updated = await bindMediaServerAccount(
      useToken
        ? {
            server: target.server,
            username: username.value.trim() || undefined,
            token: directToken.value.trim(),
          }
        : {
            server: target.server,
            username: username.value.trim(),
            password: password.value,
          },
    )
    bindings.value = bindings.value.map(entry => (entry.server === updated.server ? updated : entry))
    toast.success(t('mediaServerBinding.bindSuccess', { server: updated.server }))
    resetForm()
  } catch (cause) {
    formError.value = getApiErrorMessage(cause) || t('mediaServerBinding.bindFailed')
  } finally {
    submitting.value = false
  }
}

async function handleUnbind(item: MediaServerAccountBinding) {
  if (unbindingServer.value) return
  unbindingServer.value = item.server
  error.value = ''
  try {
    await unbindMediaServerAccount(item.server)
    toast.success(t('mediaServerBinding.unbindSuccess', { server: item.server }))
    if (activeServer.value === item.server) resetForm()
    await loadBindings()
  } catch (cause) {
    error.value = getApiErrorMessage(cause) || t('mediaServerBinding.unbindFailed')
  } finally {
    unbindingServer.value = null
  }
}

function statusChipColor(item: MediaServerAccountBinding): string {
  if (item.status === 'invalid') return 'error'
  if (item.sync_mode === 'session') return 'success'
  if (item.sync_mode === 'scrobble') return 'info'
  if (item.sync_mode === 'userdata') return 'warning'
  return 'default'
}

function statusChipLabel(item: MediaServerAccountBinding): string {
  if (item.status === 'invalid') return t('mediaServerBinding.statusInvalid')
  if (item.sync_mode === 'session') return t('mediaServerBinding.modeSession')
  if (item.sync_mode === 'scrobble') return t('mediaServerBinding.modeScrobble')
  if (item.sync_mode === 'userdata') return t('mediaServerBinding.modeUserData')
  return t('mediaServerBinding.modeUnsupported')
}

function serverIconUrl(serverType: string): string | null {
  return hasLogo(serverType) ? getLogoUrl(serverType) : null
}

watch(
  () => props.modelValue,
  value => {
    clearSession()
    if (value) void loadBindings()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  disposed = true
  clearSession()
})
</script>

<template>
  <VDialog v-model="visible" max-width="40rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('mediaServerBinding.title') }}</VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>

      <VCardText>
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ t('mediaServerBinding.hint') }}
        </p>

        <VAlert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">
          {{ error }}
          <template #append>
            <VBtn variant="text" size="small" color="error" :loading="loading" @click="loadBindings">
              {{ t('common.retry') }}
            </VBtn>
          </template>
        </VAlert>

        <VProgressLinear v-if="loading" indeterminate color="primary" :aria-label="t('common.loading')" />

        <div v-else-if="bindings.length === 0" class="text-center py-6 text-medium-emphasis">
          {{ t('mediaServerBinding.empty') }}
        </div>

        <div v-else class="d-flex flex-column ga-3">
          <VCard v-for="item in bindings" :key="item.server" variant="outlined">
            <VCardText class="pa-4">
              <div class="d-flex flex-wrap align-center justify-space-between ga-3">
                <div class="d-flex align-center ga-3">
                  <VAvatar size="36" rounded="lg" variant="tonal">
                    <VImg v-if="serverIconUrl(item.server_type)" :src="serverIconUrl(item.server_type)!" />
                    <VIcon v-else icon="mdi-server" />
                  </VAvatar>
                  <div>
                    <div class="d-flex align-center flex-wrap ga-2">
                      <span class="text-subtitle-1 font-weight-medium">{{ item.server }}</span>
                      <VChip size="x-small" :color="statusChipColor(item)" variant="tonal">
                        {{ statusChipLabel(item) }}
                      </VChip>
                    </div>
                    <div class="text-caption text-medium-emphasis mt-1">
                      <template v-if="item.status === 'bound' && item.remote_username">
                        {{ t('mediaServerBinding.boundAs', { username: item.remote_username }) }}
                        <span v-if="item.source === 'auxiliary_auth'" class="ms-1">
                          ({{ t('mediaServerBinding.sourceAuxiliary') }})
                        </span>
                      </template>
                      <template v-else-if="item.status === 'invalid'">
                        {{ t('mediaServerBinding.invalidHint') }}
                      </template>
                      <template v-else-if="item.status === 'builtin'">
                        {{ t('mediaServerBinding.builtinHint') }}
                      </template>
                      <template v-else-if="item.supports_binding">
                        {{ t('mediaServerBinding.unboundHint') }}
                      </template>
                      <template v-else>
                        {{ t('mediaServerBinding.unsupportedHint') }}
                      </template>
                    </div>
                  </div>
                </div>

                <div v-if="item.supports_binding" class="d-flex align-center ga-2">
                  <VBtn
                    v-if="item.bound || item.status === 'invalid'"
                    size="small"
                    variant="text"
                    color="error"
                    :loading="unbindingServer === item.server"
                    :disabled="submitting"
                    @click="handleUnbind(item)"
                  >
                    {{ t('mediaServerBinding.unbind') }}
                  </VBtn>
                  <VBtn
                    size="small"
                    variant="tonal"
                    color="primary"
                    :disabled="submitting"
                    @click="activeServer === item.server ? resetForm() : openBindForm(item)"
                  >
                    {{
                      item.bound || item.status === 'invalid'
                        ? t('mediaServerBinding.rebind')
                        : t('mediaServerBinding.bind')
                    }}
                  </VBtn>
                </div>
              </div>

              <VExpandTransition>
                <div v-if="activeServer === item.server" class="mt-4 pt-4 border-t">
                  <VBtnToggle
                    v-if="item.server_type === 'plex'"
                    v-model="authMode"
                    mandatory
                    density="compact"
                    color="primary"
                    class="mb-3"
                  >
                    <VBtn value="password" size="small">{{ t('mediaServerBinding.modePasswordAuth') }}</VBtn>
                    <VBtn value="token" size="small">{{ t('mediaServerBinding.modeTokenAuth') }}</VBtn>
                  </VBtnToggle>

                  <VAlert v-if="formError" type="error" variant="tonal" density="compact" class="mb-3" role="alert">
                    {{ formError }}
                  </VAlert>

                  <VRow dense>
                    <VCol v-if="!(item.server_type === 'plex' && authMode === 'token')" cols="12" sm="6">
                      <VTextField
                        v-model="username"
                        density="compact"
                        :label="t('mediaServerBinding.username')"
                        autocomplete="username"
                        hide-details="auto"
                      />
                    </VCol>
                    <VCol v-if="!(item.server_type === 'plex' && authMode === 'token')" cols="12" sm="6">
                      <VTextField
                        v-model="password"
                        density="compact"
                        :type="showPassword ? 'text' : 'password'"
                        :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                        :label="t('mediaServerBinding.password')"
                        autocomplete="current-password"
                        hide-details="auto"
                        @click:append-inner="showPassword = !showPassword"
                      />
                    </VCol>
                    <VCol v-else cols="12">
                      <VTextField
                        v-model="directToken"
                        density="compact"
                        type="password"
                        :label="t('mediaServerBinding.plexToken')"
                        :placeholder="t('mediaServerBinding.plexTokenPlaceholder')"
                        autocomplete="off"
                        hide-details="auto"
                      />
                    </VCol>
                  </VRow>

                  <div class="d-flex justify-space-between align-center mt-3">
                    <span class="text-caption text-medium-emphasis">
                      {{ t('mediaServerBinding.passwordNotStored') }}
                    </span>
                    <div class="d-flex ga-2">
                      <VBtn size="small" variant="text" :disabled="submitting" @click="resetForm">
                        {{ t('common.cancel') }}
                      </VBtn>
                      <VBtn size="small" variant="flat" color="primary" :loading="submitting" @click="submitBinding">
                        {{ t('mediaServerBinding.submitBind') }}
                      </VBtn>
                    </div>
                  </div>
                </div>
              </VExpandTransition>
            </VCardText>
          </VCard>
        </div>
      </VCardText>

      <VCardActions class="app-dialog-actions px-4 pb-4">
        <VSpacer />
        <VBtn variant="text" @click="visible = false">{{ t('common.close') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
