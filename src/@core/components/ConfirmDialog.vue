<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: boolean
  type?: 'info' | 'warn' | 'error'
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  title: '',
  content: '',
  confirmText: '',
  cancelText: '',
  width: '28rem',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

// 对话框类型对应的图标和颜色
const typeConfig = {
  info: {
    icon: 'mdi-information',
    color: 'info',
  },
  warn: {
    icon: 'mdi-alert',
    color: 'warning',
  },
  error: {
    icon: 'mdi-alert-circle',
    color: 'error',
  },
}

// 获取当前类型的配置
const currentType = computed(() => typeConfig[props.type])

// 确认按钮点击
function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

// 取消按钮点击
function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :max-width="width">
    <VCard>
      <VCardItem>
        <div class="d-flex align-center justify-start mt-3">
          <VAvatar :color="currentType.color" variant="text" size="x-large">
            <VIcon size="x-large" :icon="currentType.icon" />
          </VAvatar>
          <div class="mx-3">
            <p class="font-weight-bold text-xl text-high-emphasis">{{ title }}</p>
            <p>{{ content }}</p>
          </div>
        </div>
      </VCardItem>
      <VCardActions class="app-confirm-dialog-actions mx-auto">
        <VBtn variant="tonal" color="secondary" class="px-5" @click="handleCancel">
          {{ cancelText }}
        </VBtn>
        <VBtn variant="elevated" :color="currentType.color" @click="handleConfirm" class="px-5">
          {{ confirmText }}
        </VBtn>
      </VCardActions>
      <VDialogCloseBtn @click="handleCancel" />
    </VCard>
  </VDialog>
</template>
