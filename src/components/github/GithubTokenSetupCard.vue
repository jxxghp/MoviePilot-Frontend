<script setup lang="ts">
import type { GithubTokenAuthMode, GithubTokenStatus } from '@/composables/useGithubTokenAuth'
import { useI18n } from 'vue-i18n'
import CollapsibleSettingCard from '@/components/system/CollapsibleSettingCard.vue'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    mode: GithubTokenAuthMode
    status: GithubTokenStatus | null
    manualToken: string
    error?: string
    disabled?: boolean
    savingManual?: boolean
  }>(),
  {
    disabled: false,
    savingManual: false,
  },
)

const emit = defineEmits<{
  'update:manualToken': [value: string]
  authorize: []
  disconnect: []
  'save-manual': []
}>()

const collapsed = ref(true)

const manualTokenModel = computed({
  get: () => props.manualToken,
  set: value => emit('update:manualToken', value),
})

/** 提交手动 Token，避免卡片位于初始化表单时触发外层提交。 */
function saveManualToken() {
  emit('save-manual')
}

const connectionStatus = computed(() => {
  if (!props.status) {
    return {
      color: 'secondary',
      icon: 'mdi-progress-clock',
      label: t('githubToken.statusChecking'),
    }
  }

  if (props.status.needs_reauthorization || props.status.valid === false) {
    return {
      color: 'warning',
      icon: 'mdi-alert-circle-outline',
      label: t('githubToken.statusNeedsReauthorization'),
    }
  }

  if (props.status.configured) {
    return {
      color: 'success',
      icon: 'mdi-check-circle-outline',
      label: t('githubToken.statusConnected'),
    }
  }

  return {
    color: 'secondary',
    icon: 'mdi-link-off',
    label: t('githubToken.statusNotConfigured'),
  }
})

const showManualToken = computed(
  () => !props.status?.configured || props.status.valid === false || props.status.needs_reauthorization,
)
</script>

<template>
  <CollapsibleSettingCard
    v-model:collapsed="collapsed"
    :title="props.mode === 'initialization' ? t('githubToken.initializationTitle') : t('githubToken.title')"
    :subtitle="t('githubToken.description')"
    icon="mdi-github"
  >
    <template #status>
      <div class="d-flex align-center ga-2">
        <VChip size="small" :color="connectionStatus.color" variant="tonal" :prepend-icon="connectionStatus.icon">
          {{ connectionStatus.label }}
        </VChip>
        <span v-if="props.status?.configured && props.status.login" class="text-body-2">
          {{ props.status.login }}
        </span>
        <span v-if="props.status?.configured && props.status.masked_token" class="text-body-2 opacity-70">
          {{ props.status.masked_token }}
        </span>
      </div>
    </template>

    <VAlert v-if="props.error" type="error" variant="tonal" density="compact" class="mb-4">
      {{ props.error }}
    </VAlert>
    <VAlert v-if="props.status?.needs_reauthorization" type="warning" variant="tonal" density="compact" class="mb-4">
      {{ t('githubToken.needsReauthorization') }}
    </VAlert>

    <VAlert v-if="!props.status?.configured" type="info" variant="tonal" density="compact" class="mb-4">
      {{ t('githubToken.notConfigured') }}
    </VAlert>

    <div class="d-flex flex-wrap ga-2">
      <VBtn
        type="button"
        color="primary"
        variant="flat"
        prepend-icon="mdi-github"
        :disabled="props.disabled"
        @click="emit('authorize')"
      >
        {{ props.status?.configured ? t('githubToken.reauthorize') : t('githubToken.connect') }}
      </VBtn>
      <VBtn
        v-if="props.status?.configured"
        type="button"
        color="error"
        variant="text"
        prepend-icon="mdi-link-off"
        :disabled="props.disabled"
        @click="emit('disconnect')"
      >
        {{ t('githubToken.disconnect') }}
      </VBtn>
    </div>

    <template v-if="showManualToken">
      <VDivider class="my-5" />

      <div class="text-subtitle-2 mb-2">{{ t('githubToken.manualTitle') }}</div>
      <div class="text-body-2 opacity-70 mb-3">{{ t('githubToken.manualHint') }}</div>
      <div class="d-flex align-start ga-2">
        <VTextField
          v-model="manualTokenModel"
          class="flex-grow-1"
          density="comfortable"
          variant="outlined"
          type="password"
          autocomplete="new-password"
          hide-details
          :label="t('githubToken.manualLabel')"
          :placeholder="t('githubToken.manualPlaceholder')"
          prepend-inner-icon="mdi-key-outline"
          :disabled="props.disabled || props.savingManual"
        />
        <VBtn
          type="button"
          color="secondary"
          variant="tonal"
          class="mt-1"
          :loading="props.savingManual"
          :disabled="props.disabled || !props.manualToken.trim()"
          @click="saveManualToken"
        >
          {{ t('githubToken.saveManual') }}
        </VBtn>
      </div>
    </template>
  </CollapsibleSettingCard>
</template>
