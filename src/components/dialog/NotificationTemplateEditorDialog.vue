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
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-code-json" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('setting.notification.templateConfigTitle') }}
        </VCardTitle>
        <VCardSubtitle>
          {{ props.subtitle }}
        </VCardSubtitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VCardText class="py-0">
        <VAceEditor
          :key="`${props.templateType}-jinja2-json`"
          v-model:value="editableContent"
          lang="jinja2_json"
          :theme="props.editorTheme"
          class="w-full h-full min-h-[30rem] rounded"
        />
      </VCardText>
      <VCardActions class="pt-3">
        <VBtn color="primary" prepend-icon="mdi-content-save" class="px-5" @click="submitTemplate">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
