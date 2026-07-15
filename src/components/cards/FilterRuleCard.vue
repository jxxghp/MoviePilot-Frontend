<script lang="ts" setup>
import { innerFilterRules } from '@/api/constants'
import { CustomRule } from '@/api/types'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'

// 获取i18n实例
const { t } = useI18n()

// 输入参数
const props = defineProps({
  pri: String,
  rules: Array as PropType<string[]>,
  custom_rules: Array as PropType<CustomRule[]>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed'])

/** 关闭当前优先级规则卡片。 */
function onClose() {
  emit('close')
}

/** 将当前优先级的规则选择结果通知父组件。 */
function filtersChanged(value: string[]) {
  emit('changed', props.pri, value)
}

// 过滤规则下拉框
// 同时包含内置规则与用户自定义规则；使用 computed 而非 onMounted 一次性赋值，
// 是为了在父组件异步加载完 custom_rules 或后续新增/删除规则时，
// 选项与已选 chip 的显示名（title）能跟随刷新，避免回退到原始 ID（如 "zhong"）。
const selectFilterOptions = computed<{ [key: string]: string }[]>(() => {
  const options = cloneDeep(innerFilterRules)
  props.custom_rules?.forEach(rule => {
    options.push({
      title: rule.name,
      value: rule.id,
    })
  })
  return options
})
</script>

<template>
  <VCard variant="tonal" class="app-card-shell">
    <span class="app-card-top-action absolute top-3 right-12">
      <IconBtn @click.stop>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <VDialogCloseBtn @click="onClose" />
    <VCardItem>
      <VCardTitle class="pr-8">{{ t('filterRule.priority') }} {{ props.pri }}</VCardTitle>
      <VRow>
        <VCol>
          <VAutocomplete
            v-model="props.rules"
            variant="underlined"
            :items="selectFilterOptions"
            chips
            :label="t('filterRule.rules')"
            mobile-control-width="80%"
            multiple
            clearable
            @update:modelValue="filtersChanged"
          />
        </VCol>
      </VRow>
    </VCardItem>
  </VCard>
</template>
