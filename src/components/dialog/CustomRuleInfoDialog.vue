<script lang="ts" setup>
import { innerFilterRules } from '@/api/constants'
import type { CustomRule } from '@/api/types'
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  // 单条规则
  rule: {
    type: Object as PropType<CustomRule>,
    required: true,
  },
  // 所有规则
  rules: {
    type: Array as PropType<CustomRule[]>,
    required: true,
  },
})

// 提示框
const $toast = useToast()
const { t } = useI18n()

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'change', 'done'])

// 规则详情弹窗
const ruleInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 规则详情
const ruleInfo = ref<CustomRule>({
  id: '',
  name: '',
  include: '',
  exclude: '',
  size_range: '',
  seeders: '',
  publish_time: '',
})

/** 初始化规则编辑表单数据。 */
function initializeRuleInfo() {
  ruleInfo.value = cloneDeep(props.rule)
}

/** 保存规则编辑结果并通知父级刷新。 */
function saveRuleInfo() {
  if (!ruleInfo.value.id || !ruleInfo.value.name) {
    if (!ruleInfo.value.id && !ruleInfo.value.name) {
      $toast.error(t('customRule.error.emptyIdName'))
    }
    return
  }
  if (innerFilterRules.find(option => option.value === ruleInfo.value.id)) {
    $toast.error(t('customRule.error.idOccupied'))
    return
  }
  if (innerFilterRules.find(option => option.title === ruleInfo.value.name)) {
    $toast.error(t('customRule.error.nameOccupied'))
    return
  }
  if (ruleInfo.value.id !== props.rule.id && props.rules.find(rule => rule.id === ruleInfo.value.id)) {
    $toast.error(t('customRule.error.idExists', { id: ruleInfo.value.id }))
    return
  }
  if (ruleInfo.value.name !== props.rule.name && props.rules.find(rule => rule.name === ruleInfo.value.name)) {
    $toast.error(t('customRule.error.nameExists', { name: ruleInfo.value.name }))
    return
  }
  ruleInfoDialog.value = false
  emit('change', ruleInfo.value, props.rule.id)
  emit('done')
}

/** 规范化规则 ID 输入，只保留英文和数字。 */
function validateRuleId() {
  ruleInfo.value.id = ruleInfo.value.id.replace(/[^a-zA-Z0-9]/g, '')
}

onMounted(() => {
  initializeRuleInfo()
})
</script>

<template>
  <VDialog
    v-if="ruleInfoDialog"
    v-model="ruleInfoDialog"
    scrollable
    max-width="40rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-filter-outline" class="me-2" />
        </template>
        <VCardTitle>{{ t('customRule.title', { id: props.rule.id }) }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="ruleInfoDialog" />
      <VDivider />
      <VCardText>
        <VForm>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="ruleInfo.id"
                :label="t('customRule.field.ruleId')"
                :placeholder="t('customRule.placeholder.ruleId')"
                :hint="t('customRule.hint.ruleId')"
                persistent-hint
                active
                prepend-inner-icon="mdi-identifier"
                @input="validateRuleId"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="ruleInfo.name"
                :label="t('customRule.field.ruleName')"
                :placeholder="t('customRule.placeholder.ruleName')"
                :hint="t('customRule.hint.ruleName')"
                persistent-hint
                active
                prepend-inner-icon="mdi-label"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="ruleInfo.include"
                :label="t('customRule.field.include')"
                :placeholder="t('customRule.placeholder.include')"
                :hint="t('customRule.hint.include')"
                persistent-hint
                active
                prepend-inner-icon="mdi-plus-circle"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="ruleInfo.exclude"
                :label="t('customRule.field.exclude')"
                :placeholder="t('customRule.placeholder.exclude')"
                :hint="t('customRule.hint.exclude')"
                persistent-hint
                active
                prepend-inner-icon="mdi-minus-circle"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="ruleInfo.size_range"
                :label="t('customRule.field.sizeRange')"
                :placeholder="t('customRule.placeholder.sizeRange')"
                :hint="t('customRule.hint.sizeRange')"
                persistent-hint
                active
                prepend-inner-icon="mdi-harddisk"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="ruleInfo.seeders"
                :label="t('customRule.field.seeders')"
                :placeholder="t('customRule.placeholder.seeders')"
                :hint="t('customRule.hint.seeders')"
                persistent-hint
                active
                prepend-inner-icon="mdi-account-group"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="ruleInfo.publish_time"
                :label="t('customRule.field.publishTime')"
                :placeholder="t('customRule.placeholder.publishTime')"
                :hint="t('customRule.hint.publishTime')"
                persistent-hint
                active
                prepend-inner-icon="mdi-calendar-clock"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="saveRuleInfo" prepend-icon="mdi-content-save" class="px-5">
          {{ t('customRule.action.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
