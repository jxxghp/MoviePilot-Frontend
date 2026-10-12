<script setup lang="ts">
import { computed } from 'vue'

/** 通用确认对话框的内容和动作配置。 */
interface Props {
  modelValue: boolean
  type?: 'info' | 'warn' | 'error'
  /** 覆盖确认类型的默认图标，用于表达更具体的操作语义。 */
  icon?: string
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

/** 确认操作并关闭当前对话框。 */
function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

/** 将取消和关闭按钮统一结算为否定结果。 */
function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" :max-width="width">
    <VCard>
      <VCardItem>
        <div class="app-confirm-dialog-heading">
          <VAvatar :color="currentType.color" variant="tonal" size="32" class="flex-shrink-0">
            <VIcon size="22" :icon="icon || currentType.icon" />
          </VAvatar>
          <p class="app-confirm-dialog-title font-weight-bold text-high-emphasis">{{ title }}</p>
          <VDialogCloseBtn inner-class="app-confirm-dialog-close" size="small" @click="handleCancel" />
        </div>
        <p class="app-confirm-dialog-content">{{ content }}</p>
      </VCardItem>
      <VCardActions class="app-confirm-dialog-actions justify-end px-4 pb-4">
        <VBtn variant="tonal" color="secondary" class="px-5" @click="handleCancel">
          {{ cancelText }}
        </VBtn>
        <VBtn variant="elevated" :color="currentType.color" @click="handleConfirm" class="px-5">
          {{ confirmText }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
/* 用紧凑的标题栏保留文字宽度，关闭按钮参与布局以避免遮挡长标题。 */
.app-confirm-dialog-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.app-confirm-dialog-title {
  flex: 1 1 0;
  min-width: 0;
  margin-block: 0;
  padding-block: 3px;
  font-size: 18px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.app-confirm-dialog-close {
  position: static;
  flex: 0 0 auto;
  width: 28px;
  min-width: 28px;
  height: 28px;
  margin-inline-start: -6px;
}

.app-confirm-dialog-content {
  margin-top: 16px;
  margin-bottom: 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
</style>
