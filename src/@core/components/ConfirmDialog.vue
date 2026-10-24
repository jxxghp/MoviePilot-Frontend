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
  <VDialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :max-width="width"
    data-native-confirm-dialog
    :data-native-confirm-kind="type"
  >
    <VCard>
      <VCardItem>
        <div class="d-flex align-center justify-start mt-3">
          <VAvatar :color="currentType.color" variant="text" size="x-large">
            <VIcon size="x-large" :icon="icon || currentType.icon" />
          </VAvatar>
          <div class="app-confirm-dialog-text mx-3">
            <p data-native-confirm-title class="app-confirm-dialog-title font-weight-bold text-xl text-high-emphasis">
              {{ title }}
            </p>
            <p data-native-confirm-message class="app-confirm-dialog-content">{{ content }}</p>
          </div>
        </div>
      </VCardItem>
      <VCardActions class="app-confirm-dialog-actions mx-auto">
        <VBtn data-native-confirm-cancel variant="tonal" color="secondary" class="px-5" @click="handleCancel">
          {{ cancelText }}
        </VBtn>
        <VBtn
          data-native-confirm-accept
          variant="elevated"
          :color="currentType.color"
          @click="handleConfirm"
          class="px-5"
        >
          {{ confirmText }}
        </VBtn>
      </VCardActions>
      <VDialogCloseBtn
        inner-class="app-confirm-dialog-close absolute right-3 top-3 z-10"
        size="small"
        @click="handleCancel"
      />
    </VCard>
  </VDialog>
</template>

<style scoped>
.app-confirm-dialog-text {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* 保留原来的图标与正文布局，只为右上角关闭按钮预留标题空间。 */
.app-confirm-dialog-title {
  padding-inline-end: 24px;
}

.app-confirm-dialog-close {
  width: 28px;
  min-width: 28px;
  height: 28px;
}

.app-confirm-dialog-content {
  white-space: pre-line;
}
</style>
