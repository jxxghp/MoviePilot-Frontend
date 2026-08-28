<script setup lang="ts">
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const pluginRuntimeStore = usePluginRuntimeStore()
const router = useRouter()
const { t } = useI18n()

const pluginIds = computed(() => pluginRuntimeStore.summary?.restart_required_plugin_ids || [])
const visible = computed(() => Boolean(pluginRuntimeStore.summary?.restart_required && pluginIds.value.length))
const description = computed(() =>
  pluginIds.value.length === 1
    ? t('plugin.restartRequiredDescription', { plugin: pluginIds.value[0] })
    : t('plugin.restartRequiredMultipleDescription', { count: pluginIds.value.length }),
)

function viewPlugins() {
  const pluginId = pluginIds.value.length === 1 ? pluginIds.value[0] : undefined
  void router.push({ path: '/plugins', query: pluginId ? { id: pluginId } : undefined })
}
</script>

<template>
  <Transition name="plugin-restart-prompt">
    <VAlert
      v-if="visible"
      class="plugin-restart-prompt"
      color="warning"
      icon="mdi-restart-alert"
      variant="tonal"
      role="status"
    >
      <div class="plugin-restart-prompt__content">
        <div class="plugin-restart-prompt__copy">
          <div class="plugin-restart-prompt__title">{{ t('plugin.restartRequiredTitle') }}</div>
          <div class="plugin-restart-prompt__description">{{ description }}</div>
        </div>
        <VBtn size="small" variant="text" color="warning" @click="viewPlugins">
          {{ t('plugin.viewRestartRequiredPlugins') }}
        </VBtn>
      </div>
    </VAlert>
  </Transition>
</template>

<style scoped>
.v-alert.plugin-restart-prompt {
  position: fixed;
  z-index: 2200;
  inset-block-start: calc(
    env(safe-area-inset-top, 0px) + 4rem + var(--plugin-restart-navbar-extra-height, 0rem) + 0.75rem
  );
  inset-inline-end: max(1.25rem, env(safe-area-inset-right));
  inline-size: min(28rem, calc(100vw - 2rem));
  border: 1px solid rgba(var(--v-theme-warning), 32%);
  border-radius: 8px;
  backdrop-filter: blur(16px);
  background: rgba(var(--v-theme-surface), 96%) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 22%);
}

.plugin-restart-prompt :deep(.v-alert__underlay) {
  opacity: 0;
}

.plugin-restart-prompt__content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.plugin-restart-prompt__copy {
  flex: 1 1 auto;
  min-inline-size: 0;
}

.plugin-restart-prompt__title {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.plugin-restart-prompt__description {
  margin-block-start: 0.125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.plugin-restart-prompt-enter-active,
.plugin-restart-prompt-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.plugin-restart-prompt-enter-from,
.plugin-restart-prompt-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

@media (max-width: 600px) {
  .v-alert.plugin-restart-prompt {
    inset-block-start: calc(
      env(safe-area-inset-top, 0px) + 4rem + var(--plugin-restart-navbar-extra-height, 0rem) + 0.5rem
    );
    inset-inline-end: 1rem;
  }

  .plugin-restart-prompt__content {
    gap: 0.5rem;
  }

  .plugin-restart-prompt :deep(.v-btn) {
    flex: 0 0 auto;
  }
}
</style>
