<script lang="ts" setup>
import { CustomRule } from '@/api/types'
import { useToast } from 'vue-toastification'
import filter_svg from '@images/svg/filter.svg'
import { cloneDeep } from 'lodash-es'
import { innerFilterRules } from '@/api/constants'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
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
const emit = defineEmits(['close', 'change', 'done'])

// 规则详情弹窗
const ruleInfoDialog = ref(false)

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

// 打开详情弹窗
function openRuleInfoDialog() {
  // 深复制
  ruleInfo.value = cloneDeep(props.rule)
  ruleInfoDialog.value = true
}

// 保存详情数据
function saveRuleInfo() {
  // 有空值
  if (!ruleInfo.value.id || !ruleInfo.value.name) {
    if (!ruleInfo.value.id && !ruleInfo.value.name) {
      $toast.error(t('customRule.error.emptyIdName'))
    }
    return
  }
  // 检查ID是否在内置的规则中
  if (innerFilterRules.find(option => option.value === ruleInfo.value.id)) {
    $toast.error(t('customRule.error.idOccupied'))
    return
  }
  // 检查规则名称是否在内置的规则中
  if (innerFilterRules.find(option => option.title === ruleInfo.value.name)) {
    $toast.error(t('customRule.error.nameOccupied'))
    return
  }
  // ID已存在
  if (ruleInfo.value.id !== props.rule.id && props.rules.find(rule => rule.id === ruleInfo.value.id)) {
    $toast.error(t('customRule.error.idExists', { id: ruleInfo.value.id }))
    return
  }
  // 规则名称已存在
  if (ruleInfo.value.name !== props.rule.name && props.rules.find(rule => rule.name === ruleInfo.value.name)) {
    $toast.error(t('customRule.error.nameExists', { name: ruleInfo.value.name }))
    return
  }
  // 保存数据
  ruleInfoDialog.value = false
  emit('change', ruleInfo.value, props.rule.id)
  emit('done')
}

// 验证规则ID输入
function validateRuleId() {
  // 只允许英文和数字，不允许空格
  ruleInfo.value.id = ruleInfo.value.id.replace(/[^a-zA-Z0-9]/g, '')
}

// 按钮点击
function onClose() {
  emit('close')
}
</script>

<template>
  <div>
    <VCard variant="tonal" class="app-card-shell" @click="openRuleInfoDialog">
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
      <VDialogCloseBtn @click="onClose" />
      <VCardText class="app-card-summary app-card-summary--double-action app-card-summary--title-subtitle">
        <div class="app-card-summary__content">
          <h5 class="app-card-summary__title text-h6">{{ props.rule.name }}</h5>
          <div class="app-card-summary__subtitle text-body-1">{{ props.rule.id }}</div>
        </div>
        <div class="app-card-summary__media" aria-hidden="true">
          <VImg :src="filter_svg" contain class="app-card-summary__image" />
        </div>
      </VCardText>
    </VCard>
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
        <VCardActions class="pt-3">
          <VBtn @click="saveRuleInfo" prepend-icon="mdi-content-save" class="px-5">{{
            t('customRule.action.confirm')
          }}</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
