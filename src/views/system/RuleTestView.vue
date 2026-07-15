<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { ApiResponse, FilterRuleGroup, RuleTestData } from '@/api/types'
import { useI18n } from 'vue-i18n'

interface SummaryItem {
  icon: string
  label: string
  value: string
}

interface AnalysisStep {
  icon: string
  title: string
  value: string
}

interface FormValidationResult {
  valid: boolean
}

interface RuleTestFormRef {
  validate: () => Promise<FormValidationResult>
}

// 国际化
const { t } = useI18n()

// 规则测试表单引用
const ruleTestFormRef = ref<RuleTestFormRef>()

// 识别结果
const ruleTestResponse = ref<ApiResponse<RuleTestData>>()

// 名称识别表单
const ruleTestForm = reactive({
  title: '',
  subtitle: '',
  rulegroup: '',
})

// 识别按钮状态
const ruleTestLoading = ref(false)

// 识别按钮文本
const ruleTestText = ref(t('ruleTest.test'))

// 是否显示结果
const showResult = ref(false)

// 请求错误提示
const ruleTestError = ref('')

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 规则组加载状态
const filterRuleGroupLoading = ref(false)

// 规则组选项
const filterRuleGroupItems = computed(() => {
  return [
    { title: t('ruleTest.ruleGroupPlaceholder'), value: '' },
    ...filterRuleGroups.value.map(item => ({ title: item.name, value: item.name })),
  ]
})
const selectedRuleGroup = computed(() => filterRuleGroups.value.find(item => item.name === ruleTestForm.rulegroup))
const ruleTestData = computed(() => ruleTestResponse.value?.data)
const metaInfo = computed(() => ruleTestData.value?.meta_info)
const mediaInfo = computed(() => ruleTestData.value?.media_info)
const torrentInfo = computed(() => ruleTestData.value?.torrent_info)
const isMatched = computed(() => Boolean(ruleTestResponse.value?.success && ruleTestData.value?.matched))
const resultIcon = computed(() => (isMatched.value ? 'mdi-filter-check-outline' : 'mdi-filter-remove-outline'))
const resultColor = computed(() => (isMatched.value ? 'success' : 'warning'))
const priorityText = computed(() => {
  const priority = ruleTestData.value?.priority
  return typeof priority === 'number' ? priority.toString() : '-'
})
const resultTitle = computed(() => {
  if (isMatched.value) return t('ruleTest.matched')
  return ruleTestResponse.value?.message || t('ruleTest.noPriorityRule')
})
const resultSubtitle = computed(() => {
  const parts = [
    mediaInfo.value?.title || metaInfo.value?.name || ruleTestForm.title,
    mediaInfo.value?.year || metaInfo.value?.year,
    metaInfo.value?.season_episode,
  ]
  return parts.filter(Boolean).join(' · ') || t('ruleTest.waitingResult')
})
const ruleCount = computed(() => countRules(ruleTestData.value?.rulegroup?.rule_string || selectedRuleGroup.value?.rule_string))
const resourceChips = computed(() => {
  return [
    mediaInfo.value?.type || metaInfo.value?.type,
    mediaInfo.value?.category,
    metaInfo.value?.resource_pix,
    metaInfo.value?.edition,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
const summaryItems = computed<SummaryItem[]>(() => [
  {
    icon: 'mdi-sort-numeric-descending',
    label: t('ruleTest.summary.priority'),
    value: priorityText.value,
  },
  {
    icon: 'mdi-filter-cog-outline',
    label: t('ruleTest.summary.ruleGroup'),
    value: ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup || '-',
  },
  {
    icon: 'mdi-format-list-numbered',
    label: t('ruleTest.summary.ruleCount'),
    value: ruleCount.value ? t('ruleTest.ruleCount', { count: ruleCount.value }) : '-',
  },
  {
    icon: 'mdi-movie-search-outline',
    label: t('ruleTest.summary.media'),
    value: mediaInfo.value?.title || metaInfo.value?.name || '-',
  },
])
const analysisSteps = computed<AnalysisStep[]>(() => [
  {
    icon: 'mdi-filter-settings-outline',
    title: t('ruleTest.steps.group.title'),
    value: ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup || '-',
  },
  {
    icon: 'mdi-movie-search-outline',
    title: t('ruleTest.steps.media.title'),
    value: mediaInfo.value?.title || metaInfo.value?.name || t('ruleTest.steps.media.none'),
  },
  {
    icon: resultIcon.value,
    title: t('ruleTest.steps.filter.title'),
    value:
      ruleTestResponse.value?.message ||
      (isMatched.value ? torrentInfo.value?.title || ruleTestForm.title : t('ruleTest.steps.filter.pending')),
  },
  {
    icon: 'mdi-sort-numeric-descending',
    title: t('ruleTest.steps.priority.title'),
    value: priorityText.value,
  },
])

/** 统计规则组串中的优先级规则数量。 */
function countRules(ruleString = '') {
  return ruleString.split('>').filter(item => item.trim()).length
}

/** 加载用户过滤规则组并填充规则组选择框。 */
async function queryFilterRuleGroups() {
  try {
    filterRuleGroupLoading.value = true
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  } finally {
    filterRuleGroupLoading.value = false
  }
}

/** 调用规则测试接口并刷新解析工作台。 */
async function ruleTest() {
  const validation = await ruleTestFormRef.value?.validate()
  if (!validation?.valid) return

  try {
    ruleTestLoading.value = true
    ruleTestText.value = t('ruleTest.testing')
    ruleTestError.value = ''
    showResult.value = false
    ruleTestResponse.value = await api.get<ApiResponse<RuleTestData>, ApiResponse<RuleTestData>>('system/ruletest', {
      params: {
        title: ruleTestForm.title,
        subtitle: ruleTestForm.subtitle,
        rulegroup_name: ruleTestForm.rulegroup,
      },
    })
    ruleTestText.value = t('ruleTest.testAgain')
    showResult.value = true
  } catch (error) {
    console.error(error)
    ruleTestError.value = error instanceof Error ? error.message : t('ruleTest.requestFailed')
  } finally {
    ruleTestLoading.value = false
  }
}

onMounted(() => {
  queryFilterRuleGroups()
})
</script>

<template>
  <div class="shortcut-workbench">
    <section class="shortcut-panel shortcut-input-panel">
      <div class="panel-heading">
        <div>
          <div class="text-subtitle-1 font-weight-medium">
            {{ t('ruleTest.inputTitle') }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ t('ruleTest.inputSubtitle') }}
          </div>
        </div>
        <VIcon icon="mdi-filter-cog" color="primary" />
      </div>

      <VForm ref="ruleTestFormRef" validate-on="submit lazy" @submit.prevent="ruleTest">
        <VRow class="shortcut-form">
          <VCol cols="12" class="shortcut-form-col">
            <VTextField
              v-model="ruleTestForm.title"
              :label="t('ruleTest.title')"
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VSelect
              v-model="ruleTestForm.rulegroup"
              :items="filterRuleGroupItems"
              :label="t('ruleTest.ruleGroup')"
              :loading="filterRuleGroupLoading"
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-filter"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="ruleTestForm.subtitle"
              :label="t('ruleTest.subtitle')"
              rows="2"
              auto-grow
              prepend-inner-icon="mdi-subtitles"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VBtn block type="submit" :disabled="ruleTestLoading" :loading="ruleTestLoading">
              <template #prepend>
                <VIcon icon="mdi-filter-check-outline" />
              </template>
              {{ ruleTestText }}
            </VBtn>
          </VCol>
        </VRow>
      </VForm>

      <VAlert
        v-if="ruleTestError"
        class="mt-4"
        density="comfortable"
        icon="mdi-alert-circle-outline"
        type="error"
        variant="tonal"
      >
        {{ ruleTestError }}
      </VAlert>
    </section>

    <section class="shortcut-panel shortcut-result-panel">
      <div v-if="showResult" class="result-stack">
        <div class="rule-result-card" :class="{ 'rule-result-card--matched': isMatched }">
          <div class="priority-badge" :class="{ 'priority-badge--matched': isMatched }">
            <span class="text-caption text-medium-emphasis">{{ t('ruleTest.priorityLabel') }}</span>
            <span class="priority-value">{{ priorityText }}</span>
          </div>
          <div class="min-w-0">
            <div class="result-heading">
              <VIcon :icon="resultIcon" :color="resultColor" />
              <span class="result-title-text text-subtitle-1 font-weight-medium text-truncate">{{ resultTitle }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{ resultSubtitle }}
            </div>
            <div class="chip-row mt-3">
              <VChip
                v-for="chip in resourceChips"
                :key="chip"
                color="primary"
                size="small"
                variant="tonal"
              >
                {{ chip }}
              </VChip>
            </div>
          </div>
        </div>

        <div class="summary-grid">
          <div v-for="item in summaryItems" :key="item.label" class="summary-tile">
            <VIcon :icon="item.icon" size="18" class="summary-icon" />
            <div class="min-w-0">
              <div class="text-caption text-medium-emphasis">
                {{ item.label }}
              </div>
              <div class="text-body-2 font-weight-medium text-truncate">
                {{ item.value }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        <VIcon icon="mdi-filter-cog-outline" size="36" />
        <div class="text-body-2 text-medium-emphasis">
          {{ t('ruleTest.waitingResult') }}
        </div>
      </div>
    </section>
  </div>

  <section v-if="showResult" class="shortcut-panel analysis-panel mt-4">
    <div class="panel-heading">
      <div>
        <div class="text-subtitle-1 font-weight-medium">
          {{ t('ruleTest.analysisTitle') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('ruleTest.analysisSubtitle') }}
        </div>
      </div>
    </div>

    <div class="analysis-flow">
      <div v-for="step in analysisSteps" :key="step.title" class="analysis-step">
        <VIcon :icon="step.icon" color="primary" size="20" />
        <div class="min-w-0">
          <div class="text-body-2 font-weight-medium">
            {{ step.title }}
          </div>
          <div class="text-body-2 step-value">
            {{ step.value }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.shortcut-workbench {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 1rem;
  padding-block-start: 0.5rem;
}

.shortcut-panel {
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  backdrop-filter: var(--app-grouped-list-backdrop-filter);
  background: var(--app-grouped-list-background);
  box-shadow: var(--app-surface-shadow);
  padding: 1rem;
}

.panel-heading {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-block-end: 1rem;
}

.shortcut-form {
  margin: 0;
}

.shortcut-form-col {
  padding-inline: 0;
}

.shortcut-form-col:first-child {
  padding-block-start: 0;
}

.shortcut-form-col:last-child {
  padding-block-end: 0;
}

.result-stack {
  display: grid;
  gap: 0.9rem;
}

.rule-result-card {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 0.85rem;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-warning), 0.08);
  padding: 0.75rem;
}

.rule-result-card--matched {
  background: rgba(var(--v-theme-success), 0.08);
}

.priority-badge {
  display: grid;
  min-block-size: 5rem;
  place-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.32);
}

.priority-badge--matched {
  border-color: rgba(var(--v-theme-success), 0.42);
  background: rgba(var(--v-theme-success), 0.1);
}

.priority-value {
  font-size: 1.65rem;
  font-weight: 600;
  line-height: 1;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.result-heading {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.result-title-text {
  min-inline-size: 0;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.summary-tile {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.22);
  padding: 0.65rem;
}

.summary-icon {
  color: rgb(var(--v-theme-primary));
}

.empty-state {
  display: grid;
  min-block-size: 14rem;
  place-items: center;
  align-content: center;
  gap: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
}

.analysis-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
}

.analysis-step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.55rem;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.2);
  padding: 0.7rem;
}

.step-value {
  overflow: hidden;
  margin-block-start: 0.35rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .shortcut-workbench,
  .analysis-flow {
    grid-template-columns: minmax(0, 1fr);
  }

  .summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .result-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    align-items: start;
  }

  .result-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

@media (max-width: 420px) {
  .shortcut-panel {
    padding: 0.8rem;
  }

  .rule-result-card {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
