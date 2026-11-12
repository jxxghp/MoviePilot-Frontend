<script setup lang="ts">
import type { SearchDiagnostics } from '@/api/types'
import { ruleConfigurationWarningCodes } from '@/utils/searchDiagnostics'
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ diagnostics: SearchDiagnostics }>()
const { t } = useI18n()
// 搜索诊断属于辅助信息，首次展示仅保留摘要，详细来源由用户主动展开。
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
  ...ruleConfigurationWarningCodes,
  'rule_group_not_applicable',
  'rule_group_missing',
  'provider_error',
  'provider_cooldown',
  'provider_outcome_unknown',
])
</script>

<template>
  <section class="search-diagnostics my-3" role="status" :aria-label="t(`resource.diagnostics.${diagnostics.scope}`)">
    <div class="search-diagnostics__header">
      <VIcon icon="mdi-filter-check-outline" size="16" class="search-diagnostics__icon" />
      <div class="search-diagnostics__summary">
        <span>{{ t(`resource.diagnostics.${diagnostics.scope}`) }}</span>
        <span class="search-diagnostics__counts">{{ t('resource.diagnostics.counts', diagnostics.stage_counts) }}</span>
      </div>
      <VBtn
        v-if="hasDetails"
        variant="text"
        color="secondary"
        size="x-small"
        class="search-diagnostics__toggle"
        :append-icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        :aria-expanded="expanded"
        :aria-controls="expanded ? detailsId : undefined"
        @click="expanded = !expanded"
      >
        {{ t(`resource.diagnostics.${expanded ? 'hideDetails' : 'details'}`) }}
      </VBtn>
    </div>
    <VExpandTransition>
      <div v-if="expanded" :id="detailsId" class="search-diagnostics__details">
        <div v-if="diagnostics.searched_sites.length">
          <p class="search-diagnostics__label">{{ t('resource.diagnostics.sources') }}</p>
          <ul class="search-diagnostics__list">
            <li v-for="(site, index) in diagnostics.searched_sites" :key="index">
              <span class="search-diagnostics__name">{{ site.site_name }}</span>
              <span class="search-diagnostics__separator" aria-hidden="true"> — </span>
              <span class="search-diagnostics__outcome">
                {{ t(`resource.diagnostics.${site.attempted ? site.outcome : 'notAttempted'}`) }}
                <span v-if="site.attempted">{{ t('resource.diagnostics.rawCount', { count: site.raw_count }) }}</span>
              </span>
            </li>
          </ul>
        </div>
        <div v-if="diagnostics.rejection_reasons.length">
          <p class="search-diagnostics__label">{{ t('resource.diagnostics.excluded') }}</p>
          <ul class="search-diagnostics__list">
            <li v-for="(reason, index) in diagnostics.rejection_reasons" :key="index">
              <span class="search-diagnostics__name">
                {{ t(`resource.diagnostics.reasons.${reasonCodes.has(reason.code) ? reason.code : 'other'}`) }}:
              </span>
              <span class="search-diagnostics__outcome">{{ reason.count }}</span>
            </li>
          </ul>
        </div>
      </div>
    </VExpandTransition>
    <div v-if="diagnostics.warnings.length" class="search-diagnostics__notes">
      <p v-for="(warning, index) in diagnostics.warnings" :key="index" class="search-diagnostics__note">
        <VIcon icon="mdi-information-outline" size="15" class="search-diagnostics__icon" />
        <span>
          {{
            t(`resource.diagnostics.warnings.${warningCodes.has(warning.code) ? warning.code : 'other'}`, {
              name: warning.rule_group || t('resource.diagnostics.unnamedRule'),
              ids: warning.rule_ids?.map(id => JSON.stringify(id)).join(', ') || t('resource.diagnostics.unnamedRule'),
            })
          }}
        </span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.search-diagnostics {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 12px;
  line-height: 1.6;
}

.search-diagnostics__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  min-block-size: 42px;
}

.search-diagnostics__icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.search-diagnostics__summary {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 0 10px;
  min-inline-size: 0;
}

.search-diagnostics__counts {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.search-diagnostics__toggle {
  flex-shrink: 0;
  min-block-size: 32px;
  letter-spacing: normal;
}

.search-diagnostics__details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: 16px 24px;
  padding: 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.search-diagnostics__label {
  margin-block-end: 6px;
  font-size: 11px;
}

.search-diagnostics__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.search-diagnostics__list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-block: 5px;
}

.search-diagnostics__list li + li {
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.04);
}

.search-diagnostics__name {
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.search-diagnostics__outcome {
  max-inline-size: 65%;
  text-align: end;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.search-diagnostics__notes {
  padding: 8px 12px;
  border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.search-diagnostics__note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  overflow-wrap: anywhere;
}

.search-diagnostics__note + .search-diagnostics__note {
  margin-block-start: 4px;
}
</style>
