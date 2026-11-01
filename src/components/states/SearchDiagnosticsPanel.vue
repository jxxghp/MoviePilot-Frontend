<script setup lang="ts">
import type { SearchDiagnostics } from '@/api/types'
import { useI18n } from 'vue-i18n'

defineProps<{ diagnostics: SearchDiagnostics }>()
const { t } = useI18n()
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
  <section class="my-3" role="status" :aria-label="t(`resource.diagnostics.${diagnostics.scope}`)">
    <VCard variant="tonal">
      <VCardText>
        <h2 class="text-subtitle-1 mb-1">{{ t(`resource.diagnostics.${diagnostics.scope}`) }}</h2>
        <p>{{ t('resource.diagnostics.counts', diagnostics.stage_counts) }}</p>
        <ul v-if="diagnostics.searched_sites.length" class="ps-5 my-2">
          <li v-for="(site, index) in diagnostics.searched_sites" :key="index">
            {{ site.site_name }} —
            {{ t(`resource.diagnostics.${site.attempted ? site.outcome : 'notAttempted'}`) }}
            <span v-if="site.attempted">{{ t('resource.diagnostics.rawCount', { count: site.raw_count }) }}</span>
          </li>
        </ul>
        <ul v-if="diagnostics.rejection_reasons.length" class="ps-5 my-2">
          <li v-for="(reason, index) in diagnostics.rejection_reasons" :key="index">
            {{ t(`resource.diagnostics.reasons.${reasonCodes.has(reason.code) ? reason.code : 'other'}`) }}:
            {{ reason.count }}
          </li>
        </ul>
        <VAlert
          v-for="(warning, index) in diagnostics.warnings"
          :key="index"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          {{
            t(`resource.diagnostics.warnings.${warningCodes.has(warning.code) ? warning.code : 'other'}`, {
              name: warning.rule_group || t('resource.diagnostics.unnamedRule'),
            })
          }}
        </VAlert>
      </VCardText>
    </VCard>
  </section>
</template>
