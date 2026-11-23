<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import copy from 'copy-to-clipboard'
import { createChannelBinding, type ChannelBindingData } from '@/api/authorization'
import { getApiErrorMessage } from '@/api/client'

/** 当前网页账号主动打开的一次性关联窗口。 */
const props = withDefaults(defineProps<{ modelValue?: boolean }>(), { modelValue: true })
/** 关闭后由共享弹窗宿主释放凭据内容。 */
const emit = defineEmits<{ (event: 'close'): void; (event: 'update:modelValue', value: boolean): void }>()
const { t } = useI18n()
const loading = ref(false)
const binding = ref<ChannelBindingData | null>(null)
const error = ref('')
const copied = ref(false)
const now = ref(Date.now())
const remaining = computed(() => Math.max(0, Math.ceil((binding.value?.expires_at ?? 0) - now.value / 1000)))
const command = computed(() => (binding.value && remaining.value > 0 ? `绑定账号 ${binding.value.code}` : ''))
let controller: AbortController | null = null
let generation = 0
let timer: ReturnType<typeof setInterval> | null = null
let disposed = false
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 生成新码会撤销旧码；异步结果只能写入仍然打开的本次窗口。 */
async function generate() {
  if (loading.value) return
  controller?.abort()
  controller = new AbortController()
  const current = ++generation
  binding.value = null
  copied.value = false
  error.value = ''
  loading.value = true
  try {
    const result = await createChannelBinding(controller.signal)
    if (!disposed && visible.value && current === generation) {
      now.value = Date.now()
      binding.value = result
    }
  } catch (cause) {
    if (!disposed && visible.value && current === generation)
      error.value = getApiErrorMessage(cause) ?? t('channelAuthorization.bindingFailed')
  } finally {
    if (!disposed && current === generation) loading.value = false
  }
}

/** 仅响应用户复制，不把关联码写入 URL、日志或持久化存储。 */
function copyCommand() {
  if (command.value) copied.value = copy(command.value)
}

/** 关闭即清除窗口凭据并取消请求及倒计时。 */
function clearSession() {
  generation++
  controller?.abort()
  if (timer) clearInterval(timer)
  timer = null
  binding.value = null
  loading.value = false
}

watch(
  () => props.modelValue,
  value => {
    clearSession()
    if (value) {
      timer = setInterval(() => {
        now.value = Date.now()
      }, 1000)
      void generate()
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  disposed = true
  clearSession()
})
</script>

<template>
  <VDialog v-model="visible" max-width="32rem">
    <VCard>
      <VCardItem
        ><VCardTitle>{{ t('channelAuthorization.bindingTitle') }}</VCardTitle
        ><VDialogCloseBtn v-model="visible"
      /></VCardItem>
      <VCardText>
        <p class="mb-4">{{ t('channelAuthorization.bindingHint') }}</p>
        <VAlert v-if="error" type="error" variant="tonal" class="mb-4" role="alert">{{ error }}</VAlert>
        <VProgressLinear v-if="loading" indeterminate color="primary" :aria-label="t('common.loading')" />
        <template v-else-if="binding">
          <VTextarea
            :model-value="command"
            :mobile-layout="false"
            rows="2"
            auto-grow
            readonly
            :label="t('channelAuthorization.bindingCommand')"
            hide-details
          />
          <div class="text-caption mt-2" role="status">
            {{
              remaining > 0
                ? t('channelAuthorization.expiresIn', { seconds: remaining })
                : t('channelAuthorization.expired')
            }}
          </div>
        </template>
      </VCardText>
      <VCardActions class="app-dialog-actions px-4 pb-4"
        ><VBtn variant="text" :disabled="loading" @click="generate">{{ t('channelAuthorization.regenerate') }}</VBtn
        ><VSpacer /><VBtn
          variant="flat"
          color="primary"
          prepend-icon="mdi-content-copy"
          :disabled="!command || loading"
          @click="copyCommand"
          >{{ t(copied ? 'channelAuthorization.copied' : 'channelAuthorization.copyCommand') }}</VBtn
        ></VCardActions
      >
    </VCard>
  </VDialog>
</template>
