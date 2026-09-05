<script setup lang="ts">
import { getPluginDataSummary, type PluginDataSummary, type PluginDataValueType } from '@/api/pluginData'
import type { Plugin } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])
const { mdAndUp } = useDisplay()
const { n, t } = useI18n()
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
const summary = ref<PluginDataSummary | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
const typeLabels: Record<PluginDataValueType, string> = {
  array: 'plugin.dataTypeArray',
  boolean: 'plugin.dataTypeBoolean',
  null: 'plugin.dataTypeNull',
  number: 'plugin.dataTypeNumber',
  object: 'plugin.dataTypeObject',
  string: 'plugin.dataTypeString',
  unknown: 'plugin.dataTypeUnknown',
}

/** 读取当前插件不包含原值的数据诊断摘要。 */
async function loadSummary() {
  if (!props.plugin.id || loading.value) return

  loading.value = true
  loadFailed.value = false
  try {
    summary.value = await getPluginDataSummary(props.plugin.id)
  } catch (error) {
    console.error(error)
    loadFailed.value = true
    summary.value = null
  } finally {
    loading.value = false
  }
}

/** 本地化插件数据值类型。 */
function typeLabel(valueType: PluginDataValueType) {
  return t(typeLabels[valueType])
}

/** 格式化字符数量，未知大小返回统一占位。 */
function formatChars(value: number | null) {
  return value === null ? t('common.unknown') : t('plugin.dataCharacters', { count: n(value) })
}

watch(() => props.plugin.id, loadSummary, { immediate: true })
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="48rem" :fullscreen="!mdAndUp">
    <VCard class="plugin-data-summary-dialog">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle class="d-flex align-center ga-2 pe-8">
          <VIcon icon="mdi-database-eye-outline" />
          <span class="plugin-data-summary-dialog__title">
            {{ t('plugin.dataSummaryTitle', { name: props.plugin.plugin_name }) }}
          </span>
        </VCardTitle>
      </VCardItem>
      <VDivider />

      <VCardText class="plugin-data-summary-dialog__content pa-0">
        <LoadingBanner v-if="loading" class="my-8" />
        <div v-else-if="loadFailed" class="pa-4 pa-sm-6">
          <VAlert type="error" variant="tonal" :text="t('plugin.dataSummaryLoadFailed')">
            <template #append>
              <VBtn variant="text" color="error" @click="loadSummary">{{ t('common.retry') }}</VBtn>
            </template>
          </VAlert>
        </div>
        <template v-else-if="summary">
          <div class="plugin-data-summary-dialog__stats">
            <div>
              <span class="plugin-data-summary-dialog__stat-value">{{ n(summary.count) }}</span>
              <span class="plugin-data-summary-dialog__stat-label">{{ t('plugin.dataItems') }}</span>
            </div>
            <div>
              <span class="plugin-data-summary-dialog__stat-value">{{ n(summary.total_chars) }}</span>
              <span class="plugin-data-summary-dialog__stat-label">{{ t('plugin.dataTotalCharacters') }}</span>
            </div>
          </div>
          <VAlert
            v-if="summary.keys_truncated"
            type="info"
            variant="tonal"
            density="compact"
            class="ma-4 mb-0"
            :text="t('plugin.dataSummaryTruncated', { count: summary.keys.length })"
          />
          <div v-if="summary.keys.length" class="plugin-data-summary-dialog__list">
            <VList bg-color="transparent" lines="two">
              <VListItem v-for="item in summary.keys" :key="item.key">
                <template #prepend>
                  <VIcon
                    :icon="item.sensitive ? 'mdi-lock-outline' : 'mdi-code-json'"
                    :color="item.sensitive ? 'warning' : undefined"
                  />
                </template>
                <VListItemTitle class="plugin-data-summary-dialog__key">{{ item.key }}</VListItemTitle>
                <VListItemSubtitle class="plugin-data-summary-dialog__meta">
                  {{ typeLabel(item.value_type) }} · {{ formatChars(item.serialized_chars) }}
                </VListItemSubtitle>
                <template v-if="item.sensitive" #append>
                  <VChip size="x-small" color="warning" variant="tonal">
                    {{ t('plugin.sensitiveDataKey') }}
                  </VChip>
                </template>
              </VListItem>
            </VList>
          </div>
          <div v-else class="pa-4 pa-sm-6">
            <VAlert type="info" variant="tonal" :text="t('plugin.noPersistedData')" />
          </div>
        </template>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-data-summary-dialog {
  overflow: hidden;
}

.plugin-data-summary-dialog__title,
.plugin-data-summary-dialog__key,
.plugin-data-summary-dialog__meta {
  overflow-wrap: anywhere;
  white-space: normal;
}

.plugin-data-summary-dialog__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.plugin-data-summary-dialog__stats > div {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 1rem;
}

.plugin-data-summary-dialog__stats > div + div {
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.plugin-data-summary-dialog__stat-value {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.25rem;
  font-weight: 600;
}

.plugin-data-summary-dialog__stat-label,
.plugin-data-summary-dialog__meta {
  opacity: var(--v-medium-emphasis-opacity);
}

.plugin-data-summary-dialog__list :deep(.v-list-item:not(:last-child)) {
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

@media (width <= 600px) {
  .plugin-data-summary-dialog {
    block-size: 100%;
  }

  .plugin-data-summary-dialog__content {
    min-block-size: 0;
  }

  .plugin-data-summary-dialog__stats > div {
    padding: 0.875rem 1rem;
  }
}
</style>
