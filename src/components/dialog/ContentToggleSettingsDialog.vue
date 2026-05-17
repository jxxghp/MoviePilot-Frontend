<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

type UnknownRecord = Record<string, any>

const props = withDefaults(
  defineProps<{
    colors?: Record<string, string>
    enabled: Record<string, boolean>
    elevated?: boolean
    hint: string
    items: UnknownRecord[]
    labelGetter?: (item: UnknownRecord) => string
    modelValue?: boolean
    selectAllText?: string
    selectNoneText?: string
    showBulkActions?: boolean
    switchLabel?: string
    title: string
    valueGetter?: (item: UnknownRecord) => string
  }>(),
  {
    colors: () => ({}),
    elevated: false,
    labelGetter: undefined,
    modelValue: true,
    selectAllText: '',
    selectNoneText: '',
    showBulkActions: false,
    switchLabel: '',
    valueGetter: undefined,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: { elevated: boolean; enabled: Record<string, boolean> }): void
  (event: 'update:elevated', value: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const localEnabled = ref<Record<string, boolean>>({})
const localElevated = ref(props.elevated)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const elevatedValue = computed({
  get: () => localElevated.value,
  set: value => {
    localElevated.value = value
    emit('update:elevated', value)
  },
})

watch(
  () => [props.enabled, props.elevated, props.items],
  () => {
    resetLocalSettings()
  },
  { deep: true, immediate: true },
)

// 重置弹窗内部设置副本，避免直接修改父级 props。
function resetLocalSettings() {
  localEnabled.value = { ...props.enabled }
  localElevated.value = props.elevated
}

// 获取设置项的稳定键值。
function getItemValue(item: UnknownRecord) {
  return props.valueGetter?.(item) ?? String(item.id ?? item.title ?? item.name ?? '')
}

// 获取设置项展示名称。
function getItemLabel(item: UnknownRecord) {
  return props.labelGetter?.(item) ?? String(item.attrs?.title ?? item.name ?? item.title ?? '')
}

// 切换单个设置项的启用状态。
function toggleItem(item: UnknownRecord) {
  const key = getItemValue(item)
  localEnabled.value[key] = !localEnabled.value[key]
}

// 批量设置所有项目启用状态。
function setAllItems(value: boolean) {
  props.items.forEach(item => {
    localEnabled.value[getItemValue(item)] = value
  })
}

// 提交通用内容开关设置。
function submitSettings() {
  emit('save', {
    elevated: localElevated.value,
    enabled: { ...localEnabled.value },
  })
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="35rem" class="settings-dialog" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="settings-card">
      <VCardItem class="settings-card-header">
        <VCardTitle>
          <VIcon icon="mdi-tune" size="small" class="me-2" />
          {{ props.title }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <p class="settings-hint">{{ props.hint }}</p>
        <div class="settings-grid">
          <div
            v-for="item in props.items"
            :key="getItemValue(item)"
            class="setting-item"
            :class="{ 'enabled': localEnabled[getItemValue(item)] }"
            :style="{ '--item-color': props.colors[getItemValue(item)] }"
            @click="toggleItem(item)"
          >
            <div class="setting-item-inner">
              <div class="setting-check">
                <VIcon
                  :icon="localEnabled[getItemValue(item)] ? 'mdi-check-circle' : 'mdi-circle-outline'"
                  :color="localEnabled[getItemValue(item)] ? 'primary' : undefined"
                  size="small"
                />
              </div>
              <span class="setting-label">{{ getItemLabel(item) }}</span>
            </div>
          </div>
        </div>
        <p v-if="props.switchLabel" class="mt-3">
          <VSwitch v-model="elevatedValue" :label="props.switchLabel" />
        </p>
      </VCardText>
      <VCardActions class="pt-3">
        <VBtn v-if="props.showBulkActions" variant="text" @click="setAllItems(true)">
          {{ props.selectAllText }}
        </VBtn>
        <VBtn v-if="props.showBulkActions" variant="text" @click="setAllItems(false)">
          {{ props.selectNoneText }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" class="px-5" @click="submitSettings">
          <template #prepend>
            <VIcon icon="mdi-content-save" />
          </template>
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.settings-card-header {
  padding-block: 16px;
  padding-inline: 20px;
}

.settings-hint {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.9rem;
  margin-block-end: 16px;
}

.settings-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.setting-label {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.8);
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.2;
  transition: color 0.2s ease;
}

.setting-item {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface-variant), 0.3);
  cursor: pointer;
  padding-block: 10px;
  padding-inline: 12px;
  transition: all 0.2s ease;
}

.setting-item::before {
  position: absolute;
  background: linear-gradient(90deg, var(--item-color, rgb(var(--v-theme-primary))) 0%, transparent 100%);
  content: '';
  inline-size: 3px;
  inset-block: 0;
  inset-inline-start: 0;
  opacity: 0.3;
  transition: opacity 0.2s ease;
}

.setting-item.enabled {
  border-color: rgba(var(--v-theme-primary), 0.4);
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.setting-item.enabled::before {
  opacity: 1;
}

.setting-item-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setting-check {
  display: flex;
  flex-shrink: 0;
}
</style>
