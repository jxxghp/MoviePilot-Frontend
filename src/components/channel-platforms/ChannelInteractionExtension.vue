<script setup lang="ts">
/** 复用 Vite 组件发现；共享设置页只消费后端给出的扩展键。 */
const props = defineProps<{ extension: string; disabled?: boolean }>()
const model = defineModel<Record<string, unknown>>({ required: true })
const forms = import.meta.glob('./forms/*.vue')
const form = computed(() => {
  const loader = forms[`./forms/${props.extension}.vue`]
  return loader ? defineAsyncComponent(loader as () => Promise<{ default: Component }>) : undefined
})
</script>

<template>
  <component v-if="form" :is="form" v-model="model" :disabled="disabled" />
</template>
