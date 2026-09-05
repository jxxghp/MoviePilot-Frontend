<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import { listFilterRuleGroups } from '@/api/rule'
import type { FilterRuleGroup, RuleTestData } from '@/api/types'
import { useI18n } from 'vue-i18n'

interface PipelineStep {
  icon: string
  title: string
  value: string
  tone?: 'success' | 'warning' | 'primary'
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
const ruleTestResponse = ref<RuleTestData>()

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
const ruleTestData = computed(() => ruleTestResponse.value)
const metaInfo = computed(() => ruleTestData.value?.meta_info)
const mediaInfo = computed(() => ruleTestData.value?.media_info)
const torrentInfo = computed(() => ruleTestData.value?.torrent_info)
const isMatched = computed(() => Boolean(ruleTestData.value?.matched))
const resultIcon = computed(() => (isMatched.value ? 'mdi-filter-check-outline' : 'mdi-filter-remove-outline'))
const resultColor = computed(() => (isMatched.value ? 'success' : 'warning'))
const priorityText = computed(() => {
  const priority = ruleTestData.value?.priority
  return typeof priority === 'number' ? priority.toString() : '-'
})
const hasPriority = computed(() => typeof ruleTestData.value?.priority === 'number')
const resultTitle = computed(() => {
  if (isMatched.value) return t('ruleTest.matched')
  return t('ruleTest.noPriorityRule')
})
const resultSubtitle = computed(() => {
  const parts = [
    mediaInfo.value?.title || metaInfo.value?.name || ruleTestForm.title,
    mediaInfo.value?.year || metaInfo.value?.year,
    metaInfo.value?.season_episode,
  ]
  return parts.filter(Boolean).join(' · ') || t('ruleTest.waitingResult')
})
const ruleCount = computed(() =>
  countRules(ruleTestData.value?.rulegroup?.rule_string || selectedRuleGroup.value?.rule_string),
)
const ruleCountLabel = computed(() => {
  const count = ruleCount.value
  if (!count) return t('ruleTest.steps.group.empty')
  return t('ruleTest.ruleCount', { count })
})
const resourceChips = computed(() => {
  return [
    mediaInfo.value?.type || metaInfo.value?.type,
    mediaInfo.value?.category,
    metaInfo.value?.resource_pix,
    metaInfo.value?.edition,
    metaInfo.value?.resource_team,
  ].filter(Boolean) as string[]
})
const pipelineSteps = computed<PipelineStep[]>(() => [
  {
    icon: 'mdi-filter-settings-outline',
    title: t('ruleTest.steps.group.title'),
    value:
      ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup
        ? `${ruleTestData.value?.rulegroup_name || ruleTestForm.rulegroup} · ${ruleCountLabel.value}`
        : '-',
    tone: 'primary',
  },
  {
    icon: 'mdi-movie-search-outline',
    title: t('ruleTest.steps.media.title'),
    value: mediaInfo.value?.title || metaInfo.value?.name || t('ruleTest.steps.media.none'),
    tone: mediaInfo.value?.title ? 'primary' : 'warning',
  },
  {
    icon: resultIcon.value,
    title: t('ruleTest.steps.filter.title'),
    value: isMatched.value ? torrentInfo.value?.title || ruleTestForm.title : t('ruleTest.steps.filter.pending'),
    tone: isMatched.value ? 'success' : 'warning',
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
    filterRuleGroups.value = await listFilterRuleGroups()
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
    ruleTestResponse.value = await api.get<RuleTestData>('system/ruletest', {
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
      <VForm ref="ruleTestFormRef" validate-on="submit lazy" @submit.prevent="ruleTest">
        <VRow class="shortcut-form">
          <VCol cols="12" class="shortcut-form-col">
            <VTextField
              v-model="ruleTestForm.title"
              :label="t('ruleTest.title')"
              :hint="t('ruleTest.titleHint')"
              persistent-hint
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VSelect
              v-model="ruleTestForm.rulegroup"
              :items="filterRuleGroupItems"
              :label="t('ruleTest.ruleGroup')"
              :hint="t('ruleTest.ruleGroupHint')"
              persistent-hint
              :loading="filterRuleGroupLoading"
              :rules="[requiredValidator]"
              prepend-inner-icon="mdi-filter"
            />
          </VCol>
          <VCol cols="12" class="shortcut-form-col">
            <VTextarea
              v-model="ruleTestForm.subtitle"
              :label="t('ruleTest.subtitle')"
              :hint="t('ruleTest.subtitleHint')"
              persistent-hint
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
        <div class="result-hero" :class="{ 'result-hero--matched': isMatched }">
          <div
            class="priority-badge"
            :class="{ 'priority-badge--matched': isMatched, 'priority-badge--empty': !hasPriority }"
          >
            <span class="text-caption text-medium-emphasis">{{ t('ruleTest.priorityLabel') }}</span>
            <span class="priority-value">{{ priorityText }}</span>
          </div>
          <div class="min-w-0 hero-body">
            <div class="hero-heading">
              <VIcon :icon="resultIcon" :color="resultColor" size="20" />
              <span class="hero-title-text text-subtitle-1 font-weight-medium text-truncate">{{ resultTitle }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{ resultSubtitle }}
            </div>
            <div v-if="resourceChips.length" class="hero-chips mt-3">
              <VChip v-for="chip in resourceChips" :key="chip" size="small" variant="tonal" :color="resultColor">
                {{ chip }}
              </VChip>
            </div>
          </div>
        </div>

        <div class="pipeline">
          <div v-for="(step, idx) in pipelineSteps" :key="step.title" class="pipeline-step">
            <div class="pipeline-marker">
              <VIcon :icon="step.icon" :color="step.tone || 'primary'" size="18" />
              <span v-if="idx < pipelineSteps.length - 1" class="pipeline-connector" />
            </div>
            <div class="pipeline-body">
              <div class="text-caption text-medium-emphasis pipeline-label">
                {{ step.title }}
              </div>
              <div class="text-body-2 font-weight-medium pipeline-value">
                {{ step.value }}
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
  gap: 1rem;
}

.result-hero {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 0.85rem;
  align-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-warning), 0.08);
  padding: 0.75rem;
}

.result-hero--matched {
  background: rgba(var(--v-theme-success), 0.08);
}

.priority-badge {
  display: grid;
  min-block-size: 5rem;
  place-items: center;
  border: var(--app-surface-border);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface-variant), 0.32);
  text-align: center;
}

.priority-badge--matched {
  border-color: rgba(var(--v-theme-success), 0.42);
  background: rgba(var(--v-theme-success), 0.1);
}

.priority-badge--empty {
  opacity: 0.7;
}

.priority-value {
  font-size: 1.65rem;
  font-weight: 600;
  line-height: 1;
}

.hero-body {
  min-inline-size: 0;
}

.hero-heading {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.hero-title-text {
  min-inline-size: 0;
}

.hero-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.pipeline {
  display: flex;
  flex-direction: column;
}

.pipeline-step {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  gap: 0.75rem;
}

.pipeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-block-size: 100%;
}

.pipeline-connector {
  flex: 1;
  inline-size: 2px;
  margin-block-start: 0.3rem;
  background: rgba(var(--v-theme-primary), 0.25);
}

.pipeline-body {
  padding-block-end: 0.9rem;
  min-inline-size: 0;
}

.pipeline-step:last-child .pipeline-body {
  padding-block-end: 0;
}

.pipeline-label {
  letter-spacing: 0.02em;
}

.pipeline-value {
  margin-block-start: 0.2rem;
  overflow-wrap: anywhere;
  word-break: break-word;
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

@media (max-width: 760px) {
  .shortcut-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-heading {
    flex-wrap: wrap;
  }

  .hero-title-text {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }
}

@media (max-width: 420px) {
  .shortcut-panel {
    padding: 0.8rem;
  }

  .result-hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .priority-badge {
    grid-auto-flow: column;
    justify-content: start;
    min-block-size: 0;
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
  }

  .priority-value {
    font-size: 1.35rem;
  }
}
</style>
