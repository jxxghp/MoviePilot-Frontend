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
const editorOptions = {
  displayIndentGuides: true,
  fontSize: 14,
  highlightActiveLine: true,
  scrollPastEnd: 0.2,
  showPrintMargin: false,
  tabSize: 2,
}

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
  <VDialog v-if="visible" v-model="visible" max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="custom-css-dialog">
      <VCardItem class="custom-css-header py-3">
        <template #prepend>
          <VAvatar color="primary" variant="tonal" rounded size="40" class="me-2">
            <VIcon icon="mdi-palette" size="22" />
          </VAvatar>
        </template>
        <VCardTitle>
          {{ t('theme.custom') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <div class="custom-css-editor-body">
        <VAceEditor
          v-model:value="editableCSS"
          lang="css"
          :theme="props.editorTheme"
          :options="editorOptions"
          wrap
          class="custom-css-editor"
        />
      </div>
      <VCardActions class="app-dialog-actions custom-css-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-content-save" class="px-5" @click="submitCustomCSS">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.custom-css-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  max-block-size: calc(100dvh - 2rem);
}

.custom-css-header {
  flex: 0 0 auto;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.custom-css-editor-body {
  flex: 1 1 auto;
  min-block-size: 240px;
}

.custom-css-editor {
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  block-size: min(62vh, 34rem);
  inline-size: 100%;
}

.custom-css-actions {
  flex: 0 0 auto;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

@media (width <= 960px) {
  .custom-css-dialog {
    block-size: 100dvh;
    max-block-size: 100dvh;
  }

  .custom-css-editor-body {
    display: flex;
    flex-direction: column;
  }

  .custom-css-editor {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 0;
  }

  .custom-css-actions {
    padding-block-end: max(0.875rem, calc(env(safe-area-inset-bottom) + 0.75rem));
  }
}
</style>
