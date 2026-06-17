<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterKey: string
    filterOptions: Record<string, string[]>
    filterTitle: string
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'clearFilter', key: string): void
  (event: 'close'): void
  (event: 'selectAll', key: string): void
  (event: 'update:filterForm', key: string, values: string[]): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const filterValues = computed(() => props.filterForm[props.filterKey] ?? [])
const options = computed(() => props.filterOptions[props.filterKey] ?? [])

// 给定过滤类型返回不同图标。
function getFilterIcon(key: string) {
  const icons: Record<string, string> = {
    site: 'mdi-server-network',
    season: 'mdi-television-classic',
    freeState: 'mdi-gift-outline',
    resolution: 'mdi-monitor-screenshot',
    videoCode: 'mdi-video-vintage',
    edition: 'mdi-quality-high',
    releaseGroup: 'mdi-account-group-outline',
  }
  return icons[key] || 'mdi-filter-variant'
}

// 将当前筛选值变化回传给过滤条。
function updateFilter(values: string[]) {
  emit('update:filterForm', props.filterKey, values)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="25rem" max-height="85vh" location="center" scrollable>
    <VCard>
      <VCardTitle class="py-3 d-flex align-center">
        <VIcon :icon="getFilterIcon(props.filterKey)" class="me-2"></VIcon>
        <span>{{ props.filterTitle }}</span>
        <VSpacer />
        <VBtn
          v-if="filterValues.length > 0"
          variant="text"
          size="small"
          color="error"
          @click="emit('clearFilter', props.filterKey)"
        >
          {{ t('torrent.clear') }}
        </VBtn>
        <VBtn variant="text" size="small" color="primary" @click="emit('selectAll', props.filterKey)">
          {{ t('torrent.selectAll') }}
        </VBtn>
      </VCardTitle>
      <VDivider />
      <VCardText>
        <VChipGroup
          :model-value="filterValues"
          column
          multiple
          class="filter-options"
          @update:model-value="updateFilter"
        >
          <VChip
            v-for="option in options"
            :key="option"
            :value="option"
            filter
            variant="elevated"
            class="ma-1 filter-chip"
            size="small"
          >
            {{ option }}
          </VChip>
        </VChipGroup>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-check" class="px-5" @click="visible = false">
          {{ t('torrent.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.filter-options {
  display: flex;
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  margin: 4px;
  background-color: rgba(var(--v-theme-primary), 0.1) !important;
  color: rgba(var(--v-theme-on-surface), 0.9) !important;
  font-weight: 500;
  transition: all 0.2s ease;
}

.filter-chip:hover {
  background-color: rgba(var(--v-theme-primary), 0.15) !important;
}

.filter-chip.v-chip--selected {
  background-color: rgba(var(--v-theme-primary), 0.85) !important;
  box-shadow: 0 2px 4px rgba(var(--v-theme-primary), 0.3);
  color: rgb(var(--v-theme-on-primary)) !important;
  font-weight: 600;
}
</style>
