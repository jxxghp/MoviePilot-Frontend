<script setup lang="ts">
import type { Plugin } from '@/api/types'
import {
  getPluginRuntimeCapabilities,
  type PluginRuntimeActionCapability,
  type PluginRuntimeCapabilities,
} from '@/api/pluginCapabilities'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])
const { mdAndUp } = useDisplay()
const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
const capabilities = ref<PluginRuntimeCapabilities>({ actions: [], commands: [], services: [] })
const loading = ref(false)
const loadFailed = ref(false)
const actionItems = computed(() =>
  capabilities.value.actions.flatMap(group =>
    group.actions.map(action => ({
      ...action,
      pluginName: group.plugin_name || group.plugin_id,
    })),
  ),
)
const isEmpty = computed(
  () => !capabilities.value.commands.length && !actionItems.value.length && !capabilities.value.services.length,
)

/** 读取当前插件的安全运行能力快照。 */
async function loadCapabilities() {
  if (!props.plugin.id || loading.value) return

  loading.value = true
  loadFailed.value = false
  try {
    capabilities.value = await getPluginRuntimeCapabilities(props.plugin.id)
  } catch (error) {
    console.error(error)
    loadFailed.value = true
    capabilities.value = { actions: [], commands: [], services: [] }
  } finally {
    loading.value = false
  }
}

/** 返回动作的优先展示名称。 */
function actionTitle(action: PluginRuntimeActionCapability) {
  return action.name || action.id
}

watch(() => props.plugin.id, loadCapabilities, { immediate: true })
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="52rem" :fullscreen="!mdAndUp">
    <VCard class="plugin-capabilities-dialog">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle class="d-flex align-center ga-2 pe-8">
          <VIcon icon="mdi-puzzle-check-outline" />
          <span class="plugin-capabilities-dialog__title">
            {{ t('plugin.runtimeCapabilitiesTitle', { name: props.plugin.plugin_name }) }}
          </span>
        </VCardTitle>
      </VCardItem>
      <VDivider />

      <VCardText class="plugin-capabilities-dialog__content pa-0">
        <LoadingBanner v-if="loading" class="my-8" />
        <div v-else-if="loadFailed" class="pa-4 pa-sm-6">
          <VAlert type="error" variant="tonal" :text="t('plugin.runtimeCapabilitiesLoadFailed')">
            <template #append>
              <VBtn variant="text" color="error" @click="loadCapabilities">{{ t('common.retry') }}</VBtn>
            </template>
          </VAlert>
        </div>
        <div v-else-if="isEmpty" class="pa-4 pa-sm-6">
          <VAlert type="info" variant="tonal" :text="t('plugin.noRuntimeCapabilities')" />
        </div>
        <div v-else class="plugin-capabilities-dialog__sections">
          <section v-if="capabilities.commands.length" class="plugin-capability-section">
            <header class="plugin-capability-section__header">
              <VIcon icon="mdi-console-line" size="20" />
              <span>{{ t('plugin.capabilityCommands') }}</span>
              <VChip size="x-small" variant="tonal">{{ capabilities.commands.length }}</VChip>
            </header>
            <VList bg-color="transparent" lines="two">
              <VListItem v-for="command in capabilities.commands" :key="command.cmd">
                <VListItemTitle class="plugin-capability-section__primary">{{ command.cmd }}</VListItemTitle>
                <VListItemSubtitle v-if="command.desc" class="plugin-capability-section__secondary">
                  {{ command.desc }}
                </VListItemSubtitle>
              </VListItem>
            </VList>
          </section>

          <section v-if="actionItems.length" class="plugin-capability-section">
            <header class="plugin-capability-section__header">
              <VIcon icon="mdi-playlist-play" size="20" />
              <span>{{ t('plugin.capabilityActions') }}</span>
              <VChip size="x-small" variant="tonal">{{ actionItems.length }}</VChip>
            </header>
            <VList bg-color="transparent" lines="two">
              <VListItem v-for="action in actionItems" :key="`${action.pluginName || ''}:${action.id}`">
                <VListItemTitle class="plugin-capability-section__primary">{{ actionTitle(action) }}</VListItemTitle>
                <VListItemSubtitle class="plugin-capability-section__secondary">
                  {{ action.id }}<span v-if="action.pluginName"> · {{ action.pluginName }}</span>
                </VListItemSubtitle>
              </VListItem>
            </VList>
          </section>

          <section v-if="capabilities.services.length" class="plugin-capability-section">
            <header class="plugin-capability-section__header">
              <VIcon icon="mdi-calendar-clock-outline" size="20" />
              <span>{{ t('plugin.capabilityServices') }}</span>
              <VChip size="x-small" variant="tonal">{{ capabilities.services.length }}</VChip>
            </header>
            <VList bg-color="transparent" lines="two">
              <VListItem v-for="service in capabilities.services" :key="service.id">
                <VListItemTitle class="plugin-capability-section__primary">
                  {{ service.name || service.id }}
                </VListItemTitle>
                <VListItemSubtitle class="plugin-capability-section__secondary">
                  {{ service.id }}<span v-if="service.trigger"> · {{ service.trigger }}</span>
                </VListItemSubtitle>
              </VListItem>
            </VList>
          </section>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-capabilities-dialog {
  overflow: hidden;
}

.plugin-capabilities-dialog__title,
.plugin-capability-section__primary,
.plugin-capability-section__secondary {
  overflow-wrap: anywhere;
  white-space: normal;
}

.plugin-capabilities-dialog__sections {
  display: grid;
}

.plugin-capability-section + .plugin-capability-section {
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.plugin-capability-section__header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-block-size: 2.75rem;
  padding-inline: 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  background: rgba(var(--v-theme-on-surface), 0.04);
  font-weight: 600;
}

.plugin-capability-section__secondary {
  opacity: var(--v-medium-emphasis-opacity);
}

@media (width <= 600px) {
  .plugin-capabilities-dialog {
    block-size: 100%;
  }

  .plugin-capabilities-dialog__content {
    min-block-size: 0;
  }
}
</style>
