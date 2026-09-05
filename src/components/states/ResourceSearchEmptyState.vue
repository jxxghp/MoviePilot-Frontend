<script setup lang="ts">
interface Props {
  title: string
  description: string
  icon?: string
  query?: string
}

withDefaults(defineProps<Props>(), {
  icon: 'mdi-database-search-outline',
  query: '',
})
</script>

<template>
  <section class="resource-search-empty-state" role="status" aria-live="polite" :aria-label="title">
    <div class="resource-search-empty-state__visual" aria-hidden="true">
      <VIcon :icon="icon" size="38" />
    </div>

    <div class="resource-search-empty-state__copy">
      <h2 class="resource-search-empty-state__title">{{ title }}</h2>
      <p class="resource-search-empty-state__description">{{ description }}</p>

      <div v-if="query" class="resource-search-empty-state__query">
        <VIcon icon="mdi-magnify" size="16" aria-hidden="true" />
        <span>{{ query }}</span>
      </div>
    </div>

    <div v-if="$slots.actions" class="resource-search-empty-state__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.resource-search-empty-state {
  display: grid;
  align-content: center;
  justify-items: center;
  border: var(--app-grouped-list-border);
  border-radius: 8px;
  -webkit-backdrop-filter: var(--app-grouped-list-backdrop-filter);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background-color: rgba(var(--v-theme-surface), 0.68);
  background-image: var(--glass-sheen, none);
  box-shadow: var(--app-surface-shadow, none);
  gap: 20px;
  inline-size: min(100%, 720px);
  margin-inline: auto;
  min-block-size: clamp(280px, 38vh, 380px);
  padding: clamp(28px, 5vw, 48px);
  text-align: center;
  animation: resource-empty-state-enter 0.24s ease-out both;
}

.resource-search-empty-state__visual {
  display: grid;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.24);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 76px;
  color: rgb(var(--v-theme-primary));
  inline-size: 76px;
  box-shadow: inset 0 1px 0 rgba(var(--v-theme-on-surface), 0.1);
}

.resource-search-empty-state__copy {
  display: grid;
  justify-items: center;
  gap: 10px;
  max-inline-size: 520px;
}

.resource-search-empty-state__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.4;
  margin: 0;
}

.resource-search-empty-state__description {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.95rem;
  line-height: 1.7;
  margin: 0;
}

.resource-search-empty-state__query {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.8125rem;
  line-height: 1.5;
  margin-block-start: 4px;
  max-inline-size: min(100%, 420px);
  padding-block: 7px;
  padding-inline: 11px;
}

.resource-search-empty-state__query span {
  overflow-wrap: anywhere;
}

.resource-search-empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

@keyframes resource-empty-state-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (width <= 600px) {
  .resource-search-empty-state {
    gap: 18px;
    min-block-size: 280px;
    padding-block: 32px;
    padding-inline: 20px;
  }

  .resource-search-empty-state__visual {
    block-size: 68px;
    inline-size: 68px;
  }

  .resource-search-empty-state__title {
    font-size: 1.125rem;
  }

  .resource-search-empty-state__actions {
    inline-size: 100%;
  }

  .resource-search-empty-state__actions :deep(.v-btn) {
    flex: 1 1 140px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .resource-search-empty-state {
    animation: none;
  }
}
</style>
