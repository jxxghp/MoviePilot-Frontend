<script setup lang="ts">
/**
 * 设置页统一的可折叠配置区域，负责承载标题、状态和配置内容。
 */
const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon: string
    collapsed?: boolean
    transparent?: boolean
  }>(),
  {
    subtitle: '',
    collapsed: true,
    transparent: false,
  },
)

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

/** 切换配置区域展开状态，并将状态交给使用方保存。 */
function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}
</script>

<template>
  <VCard
    variant="outlined"
    class="collapsible-setting-card"
    :class="{ 'collapsible-setting-card--transparent': props.transparent }"
  >
    <div class="collapsible-setting-card__header">
      <button
        type="button"
        class="collapsible-setting-card__toggle"
        :aria-expanded="!props.collapsed"
        :aria-label="props.title"
        @click="toggleCollapsed"
      >
        <VAvatar color="primary" variant="tonal" size="40">
          <VIcon :icon="props.icon" />
        </VAvatar>
        <div class="collapsible-setting-card__copy">
          <div class="collapsible-setting-card__title text-subtitle-1 font-weight-medium">
            {{ props.title }}
          </div>
          <div class="collapsible-setting-card__subtitle text-body-2 text-medium-emphasis">
            {{ props.subtitle }}
          </div>
          <div v-if="$slots.status" class="collapsible-setting-card__status">
            <slot name="status" />
          </div>
        </div>
        <VIcon
          class="collapsible-setting-card__chevron"
          :icon="props.collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
          color="primary"
          aria-hidden="true"
        />
      </button>
    </div>

    <VExpandTransition>
      <VCardText v-show="!props.collapsed" class="collapsible-setting-card__content pt-2">
        <slot />
      </VCardText>
    </VExpandTransition>
  </VCard>
</template>

<style scoped>
.collapsible-setting-card {
  border-color: rgba(var(--v-theme-primary), 0.15);
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.04) 0%, rgba(var(--v-theme-surface), 0.92) 100%);
}

.collapsible-setting-card--transparent {
  border-color: rgba(var(--v-theme-primary), 0);
  background: rgba(var(--v-theme-surface), 0) !important;
}

.collapsible-setting-card__header {
  padding: 12px 16px;
}

.collapsible-setting-card__toggle {
  display: flex;
  align-items: center;
  inline-size: 100%;
  min-inline-size: 0;
  gap: 12px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.collapsible-setting-card__toggle:focus-visible {
  outline: 2px solid rgba(var(--v-theme-primary), 0.8);
  outline-offset: 3px;
  border-radius: 4px;
}

.collapsible-setting-card__copy {
  min-inline-size: 0;
  flex: 1;
}

.collapsible-setting-card__title,
.collapsible-setting-card__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapsible-setting-card__status,
.collapsible-setting-card__chevron {
  flex-shrink: 0;
}

.collapsible-setting-card__status {
  margin-block-start: 6px;
}

.collapsible-setting-card__chevron {
  margin-inline-start: auto;
}

.collapsible-setting-card__content {
  padding-block-start: 4px;
}

@media (width <= 599px) {
  .collapsible-setting-card__toggle {
    align-items: flex-start;
  }
}
</style>
