<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'ClassificationHelpDialog' })

/** 帮助弹窗的开关属性。 */
const props = defineProps<{ modelValue: boolean }>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

/** 按实际操作顺序组织配置、检查、发布和回退说明。 */
const sections = computed(() => [
  { icon: 'mdi-file-tree-outline', key: 'categories' },
  { icon: 'mdi-filter-cog-outline', key: 'rules' },
  { icon: 'mdi-play-box-outline', key: 'preview' },
  { icon: 'mdi-chart-box-outline', key: 'impact' },
  { icon: 'mdi-check-decagram-outline', key: 'publish' },
  { icon: 'mdi-history', key: 'history' },
])

/** 关闭帮助弹窗，统一供关闭图标和底部按钮调用。 */
function close(): void {
  visible.value = false
}
</script>

<template>
  <VDialog v-model="visible" class="classification-help-dialog" max-width="52rem" scrollable>
    <VCard variant="flat">
      <VCardItem>
        <template #prepend>
          <VAvatar color="primary" variant="tonal" size="40">
            <VIcon icon="mdi-help-circle-outline" />
          </VAvatar>
        </template>
        <VCardTitle>{{ t('setting.classification.helpTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.classification.helpDescription') }}</VCardSubtitle>
        <template #append>
          <VBtn icon="mdi-close" variant="text" :aria-label="t('common.close')" @click="close" />
        </template>
      </VCardItem>

      <VDivider />

      <VCardText class="classification-help-dialog__content">
        <section
          v-for="section in sections"
          :key="section.key"
          class="classification-help-dialog__section"
          :aria-labelledby="`classification-help-${section.key}-title`"
        >
          <VIcon :icon="section.icon" color="primary" size="22" aria-hidden="true" />
          <div>
            <h3 :id="`classification-help-${section.key}-title`">
              {{ t(`setting.classification.help.sections.${section.key}.title`) }}
            </h3>
            <p>{{ t(`setting.classification.help.sections.${section.key}.body`) }}</p>
          </div>
        </section>
      </VCardText>

      <VDivider />
      <VCardActions class="classification-help-dialog__actions">
        <VSpacer />
        <VBtn color="primary" variant="tonal" prepend-icon="mdi-check" @click="close">
          {{ t('setting.classification.helpClose') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.classification-help-dialog__actions {
  padding: 16px 24px;
}

.classification-help-dialog__content {
  display: grid;
  gap: 0;
  max-block-size: min(70dvh, 42rem);
}

.classification-help-dialog__section {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  padding-block: 14px;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.classification-help-dialog__section:first-child {
  padding-block-start: 0;
}

.classification-help-dialog__section:last-child {
  padding-block-end: 0;
  border-block-end: 0;
}

.classification-help-dialog__section h3,
.classification-help-dialog__section p {
  margin: 0;
}

.classification-help-dialog__section h3 {
  font-size: 0.9375rem;
  line-height: 1.4;
}

.classification-help-dialog__section p {
  margin-block-start: 4px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  line-height: 1.65;
}

:global(html[data-theme='glass'] .classification-help-dialog .v-card) {
  overflow: hidden;
  border: 1px solid var(--glass-border-raised) !important;
  -webkit-backdrop-filter: var(--glass-overlay-backdrop-filter) !important;
  backdrop-filter: var(--glass-overlay-backdrop-filter) !important;
  background-color: var(--glass-overlay-surface) !important;
  background-image: var(--glass-sheen) !important;
  box-shadow: var(--glass-shadow-raised) !important;
}

:global(html[data-theme='glass'] .classification-help-dialog .v-card-actions) {
  border-block-start: 1px solid var(--glass-border);
}

:global(html[data-theme='transparent'] .classification-help-dialog .v-card) {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16) !important;
  -webkit-backdrop-filter: blur(var(--transparent-blur-heavy)) !important;
  backdrop-filter: blur(var(--transparent-blur-heavy)) !important;
  background-color: rgba(var(--v-theme-surface), var(--transparent-opacity-heavy)) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28) !important;
}

:global(html[data-theme='transparent'] .classification-help-dialog .v-card-actions) {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

@media (max-width: 599px) {
  .classification-help-dialog__actions {
    padding-inline: 14px;
  }

  .classification-help-dialog__content {
    padding-inline: 14px;
  }

  .classification-help-dialog__section {
    gap: 8px;
    grid-template-columns: 24px minmax(0, 1fr);
  }
}
</style>
