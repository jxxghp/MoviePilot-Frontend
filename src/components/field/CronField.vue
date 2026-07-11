<script setup lang="ts">
import CronInput from '@/components/input/CronInput.vue'

const attrs = useAttrs()

const props = defineProps({
  modelValue: {
    type: String,
    default: '* * * * *',
  },
  /** 是否允许直接清空 CRON。 */
  clearable: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const innerValue = ref(props.modelValue)

watch(
  () => props.modelValue,
  value => {
    innerValue.value = value
  },
)

const propsWithoutModelValue = computed(() => {
  const { modelValue, ...rest } = props
  return { ...rest, ...attrs }
})

function updateModelValue(value: string) {
  innerValue.value = value
  emit('update:modelValue', value)
}
</script>

<template>
  <CronInput v-model="innerValue" @update:modelValue="updateModelValue">
    <template #activator="{ menuprops }">
      <VTextField
        :modelValue="innerValue"
        @update:modelValue="updateModelValue"
        v-bind="{ ...menuprops, ...propsWithoutModelValue }"
      />
    </template>
  </CronInput>
</template>
