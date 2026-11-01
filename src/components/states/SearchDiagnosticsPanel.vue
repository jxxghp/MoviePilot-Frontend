<script setup lang="ts">
import type { SearchDiagnostics } from '@/api/types'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ diagnostics: SearchDiagnostics }>()
const { t } = useI18n()
const expanded = ref(false)
const detailsId = useId()
const hasDetails = computed(() => props.diagnostics.searched_sites.length || props.diagnostics.rejection_reasons.length)
const reasonCodes = new Set([
  'filter_params',
  'filter_rules',
  'title_missing',
  'scope_mismatch',
  'identity_mismatch',
  'type_mismatch',
  'caller_filter',
  'duplicate',
])
const warningCodes = new Set([
  'rule_group_not_applicable',
  'rule_group_missing',
  'provider_error',
  'provider_cooldown',
  'provider_outcome_unknown',
])
</script>

<template>
  <section class="search-diagnostics my-3" role="status" :aria-label="t(`resource.diagnostics.${diagnostics.scope}`)">
    <div class="d-flex align-center flex-wrap ga-2 text-body-2">
      <VIcon icon="mdi-filter-check-outline" size="18" class="text-medium-emphasis" />
      <span>{{ t(`resource.diagnostics.${diagnostics.scope}`) }}</span>
      <span class="text-medium-emphasis">{{ t('resource.diagnostics.counts', diagnostics.stage_counts) }}</span>
      <VBtn
        v-if="hasDetails"
        variant="text"
        color="secondary"
        size="x-small"
        class="ms-auto"
        :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        :aria-expanded="expanded"
        :aria-controls="expanded ? detailsId : undefined"
        @click="expanded = !expanded"
      >
        {{ t(`resource.diagnostics.${expanded ? 'hideDetails' : 'details'}`) }}
      </VBtn>
    </div>
    <VExpandTransition>
      <div v-if="expanded" :id="detailsId" class="search-diagnostics__details text-body-2 text-medium-emphasis">
        <div v-if="diagnostics.searched_sites.length">
          <p class="text-caption mb-1">{{ t('resource.diagnostics.sources') }}</p>
          <ul>
            <li v-for="(site, index) in diagnostics.searched_sites" :key="index">
              {{ site.site_name }} —
              {{ t(`resource.diagnostics.${site.attempted ? site.outcome : 'notAttempted'}`) }}
              <span v-if="site.attempted">{{ t('resource.diagnostics.rawCount', { count: site.raw_count }) }}</span>
            </li>
          </ul>
        </div>
        <div v-if="diagnostics.rejection_reasons.length">
          <p class="text-caption mb-1">{{ t('resource.diagnostics.excluded') }}</p>
          <ul>
            <li v-for="(reason, index) in diagnostics.rejection_reasons" :key="index">
              {{ t(`resource.diagnostics.reasons.${reasonCodes.has(reason.code) ? reason.code : 'other'}`) }}:
              {{ reason.count }}
            </li>
          </ul>
        </div>
      </div>
    </VExpandTransition>
    <VAlert
      v-for="(warning, index) in diagnostics.warnings"
      :key="index"
      type="warning"
      variant="tonal"
      density="compact"
      class="mt-2 text-body-2"
    >
      {{
        t(`resource.diagnostics.warnings.${warningCodes.has(warning.code) ? warning.code : 'other'}`, {
          name: warning.rule_group || t('resource.diagnostics.unnamedRule'),
        })
      }}
    </VAlert>
  </section>
</template>

<style scoped>
.search-diagnostics__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 12px 24px;
  padding-block: 12px 4px;
}

.search-diagnostics__details ul {
  margin: 0;
  padding-inline-start: 18px;
  overflow-wrap: anywhere;
}
</style>
