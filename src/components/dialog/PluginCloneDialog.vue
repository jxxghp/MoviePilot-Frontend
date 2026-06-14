<script setup lang="ts">
import type { Plugin } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 多语言
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'clone'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 插件分身表单
const cloneForm = ref({
  suffix: '',
  name: '',
  description: '',
  version: '',
  icon: '',
})

/** 初始化插件分身表单。 */
function initializeCloneForm() {
  cloneForm.value = {
    suffix: '',
    name: t('plugin.cloneDefaultName', { name: props.plugin?.plugin_name }),
    description: t('plugin.cloneDefaultDescription', { description: props.plugin?.plugin_desc }),
    version: props.plugin?.plugin_version || '1.0',
    icon: props.plugin?.plugin_icon || '',
  }
}

/** 提交插件分身表单。 */
function submitClone() {
  emit('clone', { ...cloneForm.value })
}

onMounted(() => {
  initializeCloneForm()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="600" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-content-copy" class="me-2" />
        </template>
        <VCardTitle>{{ t('plugin.cloneTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('plugin.cloneSubtitle', { name: props.plugin?.plugin_name }) }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="cloneForm.suffix"
                :label="t('plugin.suffix') + ' *'"
                :placeholder="t('plugin.suffixPlaceholder')"
                :hint="t('plugin.suffixHint')"
                persistent-hint
                :rules="[
                  v => !!v || t('plugin.suffixRequired'),
                  v => /^[a-zA-Z0-9]+$/.test(v) || t('plugin.suffixFormatError'),
                  v => v.length <= 20 || t('plugin.suffixLengthError'),
                ]"
                required
                prepend-inner-icon="mdi-tag"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="cloneForm.name"
                :label="t('plugin.cloneName')"
                :placeholder="t('plugin.cloneNamePlaceholder')"
                :hint="t('plugin.cloneNameHint')"
                persistent-hint
                prepend-inner-icon="mdi-rename-box"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.description"
                :label="t('plugin.cloneDescriptionLabel')"
                :placeholder="t('plugin.cloneDescriptionPlaceholder')"
                :hint="t('plugin.cloneDescriptionHint')"
                persistent-hint
                prepend-inner-icon="mdi-text"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="cloneForm.version"
                :label="t('plugin.cloneVersion')"
                :placeholder="t('plugin.cloneVersionPlaceholder')"
                :hint="t('plugin.cloneVersionHint')"
                persistent-hint
                prepend-inner-icon="mdi-numeric"
              />
            </VCol>

            <VCol cols="12" md="6">
              <VTextField
                v-model="cloneForm.icon"
                :label="t('plugin.cloneIcon')"
                :placeholder="t('plugin.cloneIconPlaceholder')"
                :hint="t('plugin.cloneIconHint')"
                persistent-hint
                prepend-inner-icon="mdi-image"
              />
            </VCol>

            <VCol cols="12">
              <VAlert type="warning" variant="tonal" density="compact" class="mt-2" icon="mdi-alert-circle-outline">
                <div class="text-body-2">
                  <strong>{{ t('common.notice') }}</strong
                  >：{{ t('plugin.cloneNotice') }}
                </div>
              </VAlert>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="submitClone"
          prepend-icon="mdi-content-copy"
          class="px-5"
          :disabled="!cloneForm.suffix.trim()"
          :loading="props.loading"
        >
          {{ t('plugin.createClone') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
