<script setup lang="ts">
import draggable from 'vuedraggable'
import type { DiscoverSource } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    colors?: Record<string, string>
    modelValue?: boolean
    tabs: DiscoverSource[]
  }>(),
  {
    colors: () => ({}),
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
  <VDialog v-if="visible" v-model="visible" max-width="35rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
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
          :component-data="{ 'class': 'settings-grid' }"
        >
          <template #item="{ element }">
            <VCard
              variant="text"
              class="setting-item enabled"
              :style="{ '--item-color': props.colors[element.mediaid_prefix] }"
            >
              <div class="setting-item-inner">
                <span class="setting-label">{{ element.name }}</span>
                <VIcon icon="mdi-drag" class="drag-icon cursor-move" />
              </div>
            </VCard>
          </template>
        </draggable>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn @click="submitOrder">
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

.setting-item {
  position: relative;
  overflow: hidden;
  background-color: rgba(var(--v-theme-primary), 0.08);
  cursor: grab;
  padding-block: 10px;
  padding-inline: 12px;
}

.setting-item::before {
  position: absolute;
  background-color: var(--item-color, #4caf50);
  block-size: 100%;
  content: '';
  inline-size: 4px;
  inset-block-start: 0;
  inset-inline-start: 0;
}

.setting-item-inner {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-label {
  flex: 1;
  color: rgba(var(--v-theme-primary), 0.9);
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.2;
}

.drag-icon {
  opacity: 0.5;
}

@media (width <= 600px) {
  .settings-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
