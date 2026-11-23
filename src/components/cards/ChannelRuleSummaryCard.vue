<script setup lang="ts">
const props = defineProps<{
  /** 规则名字与由用途决定的图标。 */
  name: string
  icon: string
  enabled: boolean
  disabled?: boolean
  metrics: { label: string; value: string | number }[]
  detail: string
  detailIcon?: string
}>()
const emit = defineEmits<{ toggle: [value: boolean]; edit: []; remove: [] }>()
const { t } = useI18n()
</script>

<template>
  <VCard variant="tonal" class="app-card-shell rule-summary-card">
    <VCardText class="d-flex flex-column ga-3 pa-4">
      <div class="d-flex align-center ga-3">
        <VAvatar color="primary" variant="tonal" size="36"><VIcon :icon="icon" size="20" /></VAvatar>
        <div class="flex-grow-1 rule-summary-name">
          <div class="font-weight-medium text-body-1">{{ name }}</div>
          <span class="text-caption text-medium-emphasis">{{
            t(enabled ? 'channelSettings.ruleEnabled' : 'channelSettings.ruleDisabled')
          }}</span>
        </div>
        <VSwitch
          :model-value="props.enabled"
          :mobile-layout="false"
          class="flex-grow-0"
          color="primary"
          density="compact"
          :disabled="disabled"
          :aria-label="t('channelSettings.enableRule', { name })"
          hide-details
          @update:model-value="value => emit('toggle', !!value)"
        />
      </div>
      <div class="d-flex ga-3 rule-summary-metrics">
        <div v-for="metric in metrics" :key="metric.label" class="flex-grow-1">
          <div class="font-weight-medium text-body-2">{{ metric.value }}</div>
          <div class="text-caption text-medium-emphasis">{{ metric.label }}</div>
        </div>
      </div>
      <div class="text-body-2 text-medium-emphasis rule-summary-detail"><slot /></div>
    </VCardText>
    <VDivider />
    <div class="d-flex align-center ga-2 px-4 py-2">
      <VIcon :icon="detailIcon ?? 'mdi-clock-outline'" size="16" class="text-medium-emphasis" />
      <span class="text-caption text-medium-emphasis flex-grow-1">{{ detail }}</span>
      <VBtn
        icon="mdi-pencil-outline"
        size="small"
        variant="text"
        :aria-label="t('channelSettings.editRule', { name })"
        @click="emit('edit')"
      />
      <VBtn
        icon="mdi-delete-outline"
        size="small"
        variant="text"
        :aria-label="t('channelSettings.removeRule', { name })"
        @click="emit('remove')"
      />
    </div>
  </VCard>
</template>

<style scoped>
.rule-summary-card {
  display: flex;
  flex-direction: column;
}
.rule-summary-name,
.rule-summary-detail {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.rule-summary-card > .v-card__text {
  flex-grow: 1;
}
.rule-summary-metrics {
  flex-wrap: wrap;
}
</style>
