<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    content?: string
    editorTheme?: string
    modelValue?: boolean
    subtitle?: string
    templateType?: string
  }>(),
  {
    content: '{}',
    editorTheme: 'monokai',
    modelValue: true,
    subtitle: '',
    templateType: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', value: string): void
  (event: 'update:content', value: string): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const editableContent = ref(props.content)
const editorOptions = {
  displayIndentGuides: true,
  fontSize: 14,
  highlightActiveLine: true,
  scrollPastEnd: 0.2,
  showPrintMargin: false,
  tabSize: 2,
}

watch(
  () => props.content,
  value => {
    editableContent.value = value
  },
)

watch(editableContent, value => {
  emit('update:content', value)
})

// 提交通知模板内容，由调用方负责保存到后端。
function submitTemplate() {
  emit('save', editableContent.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="notification-template-editor-dialog">
      <VCardItem class="template-editor-header py-3">
        <template #prepend>
          <VAvatar color="primary" variant="tonal" rounded size="40" class="me-2">
            <VIcon icon="mdi-code-json" size="22" />
          </VAvatar>
        </template>
        <VCardTitle>
          {{ t('setting.notification.templateConfigTitle') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ props.subtitle }}
        </VCardSubtitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <div class="template-editor-body">
        <VAceEditor
          :key="`${props.templateType}-jinja2-json`"
          v-model:value="editableContent"
          lang="jinja2_json"
          :theme="props.editorTheme"
          :options="editorOptions"
          wrap
          class="template-ace-editor"
        />
      </div>
      <VCardActions class="app-dialog-actions template-editor-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-content-save" class="px-5" @click="submitTemplate">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.notification-template-editor-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  max-block-size: calc(100dvh - 2rem);
}

.template-editor-header {
  flex: 0 0 auto;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.template-editor-body {
  flex: 1 1 auto;
  min-block-size: 0;
}

.template-ace-editor {
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  block-size: min(62vh, 34rem);
  inline-size: 100%;
}

.template-editor-actions {
  flex: 0 0 auto;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

@media (width <= 960px) {
  .notification-template-editor-dialog {
    block-size: 100dvh;
    max-block-size: 100dvh;
  }

  .template-editor-body {
    display: flex;
    flex-direction: column;
  }

  .template-ace-editor {
    flex: 1 1 auto;
    block-size: auto;
    min-block-size: 0;
  }

  .template-editor-actions {
    padding-block-end: max(0.875rem, calc(env(safe-area-inset-bottom) + 0.75rem));
  }
}
</style>
