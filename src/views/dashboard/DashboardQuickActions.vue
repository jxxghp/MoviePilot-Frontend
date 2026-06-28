<script setup lang="ts">
import { useShortcutTools } from '@/composables/useShortcutTools'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { visibleShortcuts, openShortcutDialog } = useShortcutTools()
const actionColors = ['primary', 'success', 'warning', 'info', 'secondary', 'error', 'teal', 'primary']
</script>

<template>
  <VCard class="dashboard-quick-card dashboard-grid-fill">
    <VCardItem class="dashboard-quick-heading">
      <VCardTitle>{{ t('dashboard.quickActions.title') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-quick-actions">
      <button
        v-for="(action, index) in visibleShortcuts"
        :key="action.dialog"
        type="button"
        class="dashboard-quick-action dashboard-grid-no-drag"
        @click="openShortcutDialog(action)"
      >
        <VAvatar :color="actionColors[index]" variant="tonal" rounded="lg" size="38">
          <VIcon :icon="action.icon" size="23" />
        </VAvatar>
        <span>{{ action.title }}</span>
      </button>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-quick-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.dashboard-quick-heading {
  padding-block: 0.8rem 0.2rem;
}

.dashboard-quick-actions {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.25rem;
  padding-block: 0.35rem 0.8rem;
}

.dashboard-quick-action {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.25rem 0.1rem;
  transition: background-color 0.18s ease, transform 0.18s ease;
}

.dashboard-quick-action:hover,
.dashboard-quick-action:focus-visible {
  background: rgba(var(--v-theme-primary), 0.06);
  outline: none;
  transform: translateY(-1px);
}

.dashboard-quick-action span {
  overflow: hidden;
  inline-size: 100%;
  font-size: 0.68rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 740px) {
  .dashboard-quick-actions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
