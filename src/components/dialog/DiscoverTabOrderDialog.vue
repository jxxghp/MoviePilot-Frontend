<script setup lang="ts">
import draggable from 'vuedraggable'
import type { DiscoverSource } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    tabs: DiscoverSource[]
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', tabs: DiscoverSource[]): void
  (event: 'update:modelValue', value: boolean): void
}>()

const localTabs = ref<DiscoverSource[]>([])

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

watch(
  () => props.tabs,
  () => {
    resetLocalTabs()
  },
  { deep: true, immediate: true },
)

// 重置弹窗内部排序副本。
function resetLocalTabs() {
  localTabs.value = props.tabs.map(item => ({ ...item }))
}

// 保存当前拖拽后的发现标签顺序。
function submitOrder() {
  emit('save', localTabs.value)
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
          <VIcon icon="mdi-order-alphabetical-ascending" size="small" class="me-2" />
          {{ t('discover.setTabOrder') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <p class="settings-hint">{{ t('discover.dragToReorder') }}</p>
        <draggable
          v-model="localTabs"
          handle=".cursor-move"
          item-key="mediaid_prefix"
          tag="div"
          :animation="180"
          :component-data="{ 'class': 'settings-grid' }"
        >
          <template #item="{ element }">
            <VCard variant="text" class="setting-item enabled">
              <div class="setting-item-inner">
                <span class="setting-label">{{ element.name }}</span>
                <VIcon icon="mdi-drag" class="drag-icon cursor-move" />
              </div>
            </VCard>
          </template>
        </draggable>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" class="px-5" @click="submitOrder">
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
  position: relative;
  overflow: hidden;
  min-block-size: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 10px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  cursor: grab;
  padding-block: 10px;
  padding-inline: 12px;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.setting-item::before {
  position: absolute;
  background-color: rgb(var(--v-theme-primary));
  block-size: 100%;
  content: '';
  inline-size: 3px;
  inset-block-start: 0;
  inset-inline-start: 0;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.setting-item.enabled {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.setting-item.enabled::before {
  opacity: 1;
}

.setting-item:hover {
  border-color: rgba(var(--v-theme-primary), 0.32);
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.setting-item:active {
  cursor: grabbing;
  transform: scale(0.99);
}

.setting-item-inner {
  display: flex;
  align-items: center;
  gap: 10px;
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
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.52);
  transition: color 0.2s ease;
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
