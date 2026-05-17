<script setup lang="ts">
import type { Component } from 'vue'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = withDefaults(
  defineProps<{
    bodyClass?: string
    cardClass?: string
    icon?: string
    maxWidth?: string
    modelValue?: boolean
    subtitle?: string
    title: string
    view: Component
    viewProps?: Record<string, unknown>
  }>(),
  {
    bodyClass: '',
    cardClass: '',
    icon: 'mdi-cog',
    maxWidth: '35rem',
    modelValue: true,
    viewProps: () => ({}),
  },
)

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" :max-width="props.maxWidth" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard :class="props.cardClass">
      <VCardItem>
        <VCardTitle>
          <VIcon :icon="props.icon" class="me-2" />
          {{ props.title }}
        </VCardTitle>
        <VCardSubtitle v-if="props.subtitle">{{ props.subtitle }}</VCardSubtitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText :class="props.bodyClass">
        <Component :is="props.view" v-bind="props.viewProps" />
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.system-health-dialog-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.system-health-dialog-body {
  /* 弹窗正文本身不滚动，滚动只交给健康检查结果列表。 */
  display: flex;
  flex: 1 1 auto;
  block-size: min(42rem, calc(100dvh - 8rem - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  min-block-size: 0;
  overflow: hidden !important;
}

:global(.v-dialog--fullscreen) .system-health-dialog-body {
  block-size: auto;
}
</style>
