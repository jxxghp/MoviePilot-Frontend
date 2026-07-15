<script setup lang="ts">
import PathInput from '@/components/input/PathInput.vue'

const attrs = useAttrs()

const props = defineProps({
  modelValue: {
    type: String,
    default: '/',
  },
  storage: {
    type: String,
    default: 'local',
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

/** 同步路径输入值并向父组件派发更新。 */
function updateModelValue(value: string) {
  innerValue.value = value
  emit('update:modelValue', value)
}
</script>

<template>
  <PathInput v-model="innerValue" :storage="props.storage" @update:modelValue="updateModelValue">
    <template #activator="{ menuprops }">
      <VTextField
        :modelValue="innerValue"
        @update:modelValue="updateModelValue"
        v-bind="{ ...menuprops, ...propsWithoutModelValue }"
      />
    </template>
  </PathInput>
</template>
