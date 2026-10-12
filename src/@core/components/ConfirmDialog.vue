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
        <div class="d-flex align-center justify-start mt-3">
          <VAvatar :color="currentType.color" variant="text" size="x-large">
            <VIcon size="x-large" :icon="icon || currentType.icon" />
          </VAvatar>
          <div class="app-confirm-dialog-text ms-3">
            <div class="app-confirm-dialog-heading">
              <p class="app-confirm-dialog-title font-weight-bold text-xl text-high-emphasis">{{ title }}</p>
              <VDialogCloseBtn inner-class="app-confirm-dialog-close" @click="handleCancel" />
            </div>
            <p class="app-confirm-dialog-content">{{ content }}</p>
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
    </VCard>
  </VDialog>
</template>

<style scoped>
.app-confirm-dialog-text {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* 关闭按钮参与标题行布局，长标题换行时不会进入按钮的点击区域。 */
.app-confirm-dialog-heading {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.app-confirm-dialog-title {
  flex: 1 1 0;
  min-width: 0;
}

.app-confirm-dialog-close {
  position: static;
  flex: 0 0 auto;
}

.app-confirm-dialog-content {
  white-space: pre-line;
}
</style>
