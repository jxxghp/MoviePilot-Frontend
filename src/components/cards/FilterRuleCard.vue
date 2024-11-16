<script lang="ts" setup>
import { innerFilterRules } from '@/api/constants'
import { CustomRule } from '@/api/types'
import { cloneDeep } from 'lodash'

// 输入参数
const props = defineProps({
  pri: String,
  rules: Array as PropType<string[]>,
  custom_rules: Array as PropType<CustomRule[]>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed'])

// 按钮点击
function onClose() {
  emit('close')
}

// 选项变化
function filtersChanged(value: string[]) {
  emit('changed', props.pri, value)
}

// 过滤规则下拉框
const selectFilterOptions = ref<{ [key: string]: string }[]>([])

onMounted(() => {
  selectFilterOptions.value = cloneDeep(innerFilterRules)
  if (props.custom_rules) {
    console.log(props.custom_rules)
    props.custom_rules.map(rule => {
      selectFilterOptions.value.push({
        title: rule.name,
        value: rule.id,
      })
    })
  }
})
</script>

<template>
  <VCard variant="tonal">
    <span class="absolute top-3 right-12">
      <IconBtn>
        <VIcon class="cursor-move" icon="mdi-drag" />
      </IconBtn>
    </span>
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VCardTitle>优先级 {{ props.pri }}</VCardTitle>
      <VRow>
        <VCol>
          <VSelect
            v-model="props.rules"
            variant="underlined"
            :items="selectFilterOptions"
            chips
            label=""
            multiple
            clearable
            @update:modelValue="filtersChanged"
          />
        </VCol>
      </VRow>
    </VCardItem>
  </VCard>
</template>
