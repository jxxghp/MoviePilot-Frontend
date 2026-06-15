<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const display = useDisplay()

const props = withDefaults(
  defineProps<{
    filterForm: Record<string, string[]>
    filterOptions: Record<string, string[]>
    filterTitles: Record<string, string>
    modelValue?: boolean
  }>(),
  {
    modelValue: true,
  },
)

const emit = defineEmits<{
  (event: 'clearAllFilters'): void
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

const selectedCount = computed(() => {
  return Object.values(props.filterForm).reduce((count, values) => count + values.length, 0)
})

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

// 将筛选值变化回传给过滤条。
function updateFilter(key: string, values: string[]) {
  emit('update:filterForm', key, values)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="50rem" location="center" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn v-model="visible" />
      <VCardTitle class="py-3 d-flex align-center">
        <VIcon icon="mdi-filter-variant" class="me-2"></VIcon>
        <span>{{ t('torrent.allFilters') }}</span>
        <VSpacer />
        <VBtn
          v-if="selectedCount > 0"
          class="me-10"
          variant="text"
          size="small"
          color="error"
          @click="emit('clearAllFilters')"
        >
          {{ t('torrent.clearAll') }}
        </VBtn>
      </VCardTitle>
      <VDivider />
      <VCardText>
        <div class="all-filters-grid">
          <VCard
            v-for="(title, key) in props.filterTitles"
            :key="key"
            v-show="props.filterOptions[key].length > 0"
            variant="tonal"
            class="filter-section"
          >
            <VCardItem class="py-2">
              <template #prepend>
                <VIcon :icon="getFilterIcon(String(key))" class="me-2"></VIcon>
              </template>
              <VCardTitle>{{ title }}</VCardTitle>
              <template #append>
                <VBtn variant="text" size="small" color="primary" @click="emit('selectAll', String(key))">
                  {{ t('torrent.selectAll') }}
                </VBtn>
                <VBtn
                  v-if="props.filterForm[key].length > 0"
                  variant="text"
                  size="small"
                  color="error"
                  @click="emit('clearFilter', String(key))"
                >
                  {{ t('torrent.clear') }}
                </VBtn>
              </template>
            </VCardItem>
            <VCardText>
              <VChipGroup
                :model-value="props.filterForm[key]"
                column
                multiple
                class="filter-options"
                @update:model-value="(val: string[]) => updateFilter(String(key), val)"
              >
                <VChip
                  v-for="option in props.filterOptions[key]"
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
          </VCard>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.all-filters-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

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
