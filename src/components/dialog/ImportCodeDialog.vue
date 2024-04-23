<script lang="ts" setup>
// 输入参数
const props = defineProps({
  title: String,
})

// 定义事件
const emit = defineEmits(['update:modelValue', 'close'])

// 代码
const codeString = ref('')

// 导入
function handleImport() {
  emit('update:modelValue', codeString.value)
  emit('close')
}
</script>

<template>
  <VDialog
    width="40rem"
    scrollable
    max-height="85vh"
  >
    <VCard
      :title="props.title"
      class="rounded-t"
    >
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2">
        <VTextarea v-model="codeString" />
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn
          variant="tonal"
          @click="handleImport"
        >
          导入
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
