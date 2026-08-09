<script setup lang="ts">
import draggable from 'vuedraggable'
import type { DiscoverSource } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    enabled: Record<string, boolean>
    modelValue?: boolean
    tabs: DiscoverSource[]
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: { enabled: Record<string, boolean>; tabs: DiscoverSource[] }): void
  (event: 'update:modelValue', value: boolean): void
}>()

const localTabs = ref<DiscoverSource[]>([])
const localEnabled = ref<Record<string, boolean>>({})

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

watch(
  [() => props.tabs, () => props.enabled],
  () => {
    resetLocalSettings()
  },
  { deep: true, immediate: true },
)

// 重置弹窗内部设置副本，避免拖拽与开关操作直接修改父级状态。
function resetLocalSettings() {
  localTabs.value = props.tabs.map(item => ({ ...item }))
  localEnabled.value = Object.fromEntries(
    props.tabs.map(item => [item.mediaid_prefix, props.enabled[item.mediaid_prefix] !== false]),
  )
}

// 切换单个发现标签的显示状态。
function toggleTab(tab: DiscoverSource) {
  localEnabled.value[tab.mediaid_prefix] = !localEnabled.value[tab.mediaid_prefix]
}

// 批量设置全部发现标签的显示状态。
function setAllTabs(enabled: boolean) {
  localTabs.value.forEach(tab => {
    localEnabled.value[tab.mediaid_prefix] = enabled
  })
}

// 保存当前拖拽顺序与显示状态。
function submitSettings() {
  emit('save', {
    enabled: { ...localEnabled.value },
    tabs: localTabs.value,
  })
}
</script>

<template>
  <VDialog
    v-if="visible"
    v-model="visible"
    width="35rem"
    class="settings-dialog"
    scrollable
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="settings-card">
      <VCardItem class="settings-card-header">
        <VCardTitle>
          <VIcon icon="mdi-tune" size="small" class="me-2" />
          {{ t('discover.customizeTabs') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <p class="settings-hint">{{ t('discover.configureTabsHint') }}</p>
        <draggable
          v-model="localTabs"
          handle=".cursor-move"
          item-key="mediaid_prefix"
          tag="div"
          :animation="180"
          :component-data="{ 'class': 'settings-grid' }"
        >
          <template #item="{ element }">
            <div class="setting-item" :class="{ 'enabled': localEnabled[element.mediaid_prefix] }">
              <button
                type="button"
                class="setting-toggle"
                :aria-pressed="Boolean(localEnabled[element.mediaid_prefix])"
                @click="toggleTab(element)"
              >
                <VIcon
                  :icon="localEnabled[element.mediaid_prefix] ? 'mdi-check-circle' : 'mdi-circle-outline'"
                  :color="localEnabled[element.mediaid_prefix] ? 'primary' : undefined"
                  size="small"
                />
                <span class="setting-label">{{ element.name }}</span>
              </button>
              <VIcon icon="mdi-drag-vertical" class="drag-icon cursor-move" aria-hidden="true" />
            </div>
          </template>
        </draggable>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="success" variant="tonal" @click="setAllTabs(true)">
          {{ t('discover.selectAll') }}
        </VBtn>
        <VBtn color="warning" variant="tonal" @click="setAllTabs(false)">
          {{ t('discover.selectNone') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" class="px-5" @click="submitSettings">
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
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.setting-item {
  display: flex;
  align-items: stretch;
  min-block-size: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    transform 0.2s ease;
}

.setting-item.enabled {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.setting-item:hover {
  border-color: rgba(var(--v-theme-primary), 0.32);
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.setting-item:active {
  transform: scale(0.99);
}

.setting-toggle {
  appearance: none;
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
  padding-block: 10px;
  padding-inline: 12px 6px;
  text-align: start;
}

.setting-toggle:focus-visible {
  border-radius: 7px;
  outline: 3px solid rgba(var(--v-theme-primary), 0.28);
  outline-offset: 2px;
}

.setting-label {
  flex: 1;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.9rem;
  font-weight: 550;
  line-height: 1.35;
  transition: color 0.2s ease;
}

.setting-item.enabled .setting-label {
  color: rgb(var(--v-theme-on-surface));
}

.drag-icon {
  align-self: center;
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.52);
  cursor: grab;
  margin-inline-end: 10px;
  transition: color 0.2s ease;
}

.drag-icon:active {
  cursor: grabbing;
}

.setting-item:hover .drag-icon {
  color: rgb(var(--v-theme-primary));
}

@media (width <= 760px) {
  .settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
