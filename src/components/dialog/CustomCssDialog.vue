<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = withDefaults(
  defineProps<{
    css?: string
    editorTheme?: string
    modelValue?: boolean
  }>(),
  {
    css: '',
    editorTheme: 'monokai',
    modelValue: true,
  },
)

// 定义触发的自定义事件
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', css: string): void
  (e: 'update:modelValue', value: boolean): void
}>()

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 正在编辑的 CSS 内容
const editableCSS = ref(props.css)

watch(
  () => props.css,
  value => {
    editableCSS.value = value
  },
)

/** 提交当前 CSS 内容给调用方保存。 */
function submitCustomCSS() {
  emit('save', editableCSS.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-palette" class="me-2" />
          {{ t('theme.custom') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VAceEditor v-model:value="editableCSS" lang="css" :theme="props.editorTheme" class="w-full min-h-[30rem]" />
      <VDivider />
      <VCardText class="text-center">
        <VBtn @click="submitCustomCSS" class="w-1/2">
          <template #prepend>
            <VIcon icon="mdi-content-save" />
          </template>
          {{ t('common.save') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
