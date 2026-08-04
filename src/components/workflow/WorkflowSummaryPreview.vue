<script setup lang="ts">
import { actionStepDict } from '@/api/constants'
import { useI18n } from 'vue-i18n'

interface WorkflowSummaryAction {
  data?: {
    label?: string
  }
  id?: number | string
  name?: string
  type?: string
}

interface WorkflowSummaryFlow {
  source?: number | string
  target?: number | string
}

const props = withDefaults(
  defineProps<{
    actions?: WorkflowSummaryAction[]
    flows?: WorkflowSummaryFlow[]
  }>(),
  {
    actions: () => [],
    flows: () => [],
  },
)

const { t } = useI18n()
const maxVisibleActions = 4

const actionIconMap: Record<string, string> = {
  AddDownloadAction: 'mdi-download',
  AddSubscribeAction: 'mdi-star-plus',
  FetchDownloadsAction: 'mdi-progress-download',
  FetchMediasAction: 'mdi-movie-search',
  FetchRssAction: 'mdi-rss',
  FetchTorrentsAction: 'mdi-search-web',
  FilterMediasAction: 'mdi-filter-check',
  FilterTorrentsAction: 'mdi-filter-multiple',
  InvokePluginAction: 'mdi-run',
  NoteAction: 'mdi-note-text',
  ScanFileAction: 'mdi-folder-search',
  ScrapeFileAction: 'mdi-file-find',
  SendEventAction: 'mdi-send-check',
  SendMessageAction: 'mdi-message-arrow-right',
  TransferFileAction: 'mdi-file-move',
}

const normalizedActions = computed(() => props.actions.filter(action => action && typeof action === 'object'))
const normalizedFlows = computed(() => props.flows.filter(flow => flow && typeof flow === 'object'))

function getActionKey(action: WorkflowSummaryAction, index: number) {
  return action.id == null ? `action-${index}` : String(action.id)
}

// Shared workflows are normally DAGs. Stable topological sorting keeps the summary useful
// even when stored node coordinates or array order no longer reflect the execution path.
const orderedActions = computed(() => {
  const actions = normalizedActions.value
  const actionRecords = actions.map((action, index) => ({ action, key: getActionKey(action, index) }))
  const actionById = new Map(actionRecords.map(({ action, key }) => [key, action]))
  const actionIndex = new Map(actionRecords.map(({ key }, index) => [key, index]))
  const indegree = new Map(actionRecords.map(({ key }) => [key, 0]))
  const targetsBySource = new Map<string, string[]>()

  normalizedFlows.value.forEach(flow => {
    const source = String(flow.source)
    const target = String(flow.target)
    if (!actionById.has(source) || !actionById.has(target) || source === target) return

    const targets = targetsBySource.get(source) ?? []
    if (targets.includes(target)) return

    targets.push(target)
    targetsBySource.set(source, targets)
    indegree.set(target, (indegree.get(target) ?? 0) + 1)
  })

  const queue = actionRecords.filter(({ key }) => (indegree.get(key) ?? 0) === 0).map(({ key }) => key)
  const result: WorkflowSummaryAction[] = []
  const visited = new Set<string>()

  while (queue.length) {
    queue.sort((left, right) => (actionIndex.get(left) ?? 0) - (actionIndex.get(right) ?? 0))
    const actionId = queue.shift()!
    if (visited.has(actionId)) continue

    visited.add(actionId)
    result.push(actionById.get(actionId)!)

    const targets = targetsBySource.get(actionId) ?? []
    targets.forEach(targetId => {
      indegree.set(targetId, (indegree.get(targetId) ?? 0) - 1)
      if (indegree.get(targetId) === 0) queue.push(targetId)
    })
  }

  // Preserve malformed or cyclic nodes instead of silently hiding them from the summary.
  actionRecords.forEach(({ action, key }) => {
    if (!visited.has(key)) result.push(action)
  })

  return result
})

const visibleActions = computed(() => orderedActions.value.slice(0, maxVisibleActions))
const hiddenActionCount = computed(() => Math.max(orderedActions.value.length - visibleActions.value.length, 0))
const summaryItemCount = computed(() => visibleActions.value.length + (hiddenActionCount.value ? 1 : 0))

const hasBranches = computed(() => {
  const sourceCounts = new Map<string, number>()
  const targetCounts = new Map<string, number>()

  normalizedFlows.value.forEach(flow => {
    const source = String(flow.source)
    const target = String(flow.target)
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    targetCounts.set(target, (targetCounts.get(target) ?? 0) + 1)
  })

  return [...sourceCounts.values(), ...targetCounts.values()].some(count => count > 1)
})

function getActionIcon(type?: string) {
  return (type && actionIconMap[type]) || 'mdi-puzzle-outline'
}

function getActionLabel(action: WorkflowSummaryAction) {
  const name = action.name || action.data?.label
  if (name) return actionStepDict[name] || name
  return action.type?.replace(/Action$/, '') || t('workflow.preview.unknownAction')
}
</script>

<template>
  <section
    class="workflow-summary-preview"
    :aria-label="t('workflow.preview.title')"
    :style="{ '--workflow-summary-item-count': Math.max(summaryItemCount, 1) }"
  >
    <header class="workflow-summary-preview__header">
      <span class="workflow-summary-preview__heading">
        <VIcon icon="mdi-source-branch" size="18" />
        {{ t('workflow.preview.title') }}
      </span>
      <span class="workflow-summary-preview__action-count">
        {{ t('workflow.preview.actionCount', { count: orderedActions.length }) }}
      </span>
    </header>

    <div v-if="visibleActions.length" class="workflow-summary-preview__steps" role="list">
      <div
        v-for="(action, index) in visibleActions"
        :key="getActionKey(action, index)"
        class="workflow-summary-preview__step"
        role="listitem"
      >
        <span class="workflow-summary-preview__step-icon">
          <VIcon :icon="getActionIcon(action.type)" size="17" />
        </span>
        <span class="workflow-summary-preview__step-name" :title="getActionLabel(action)">
          {{ getActionLabel(action) }}
        </span>
      </div>

      <div v-if="hiddenActionCount" class="workflow-summary-preview__step" role="listitem">
        <span class="workflow-summary-preview__step-icon workflow-summary-preview__step-icon--more">
          <VIcon icon="mdi-dots-horizontal" size="18" />
        </span>
        <span class="workflow-summary-preview__step-name">
          {{ t('workflow.preview.moreActions', { count: hiddenActionCount }) }}
        </span>
      </div>
    </div>

    <div v-else class="workflow-summary-preview__empty">
      <VIcon icon="mdi-vector-polyline-remove" size="24" />
      <span>{{ t('workflow.task.info.noActions') }}</span>
    </div>

    <footer class="workflow-summary-preview__footer">
      <span>{{ t('workflow.preview.flowCount', { count: normalizedFlows.length }) }}</span>
      <span v-if="hasBranches" class="workflow-summary-preview__branch">
        <VIcon icon="mdi-source-branch" size="14" />
        {{ t('workflow.preview.hasBranches') }}
      </span>
    </footer>
  </section>
</template>

<style lang="scss" scoped>
.workflow-summary-preview {
  --workflow-summary-line: rgba(var(--v-theme-on-surface), 0.16);

  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.875rem;
  min-block-size: 9rem;
  padding: 0.875rem;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.035);
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  inline-size: 13.5rem;
  pointer-events: none;
  user-select: none;
}

.workflow-summary-preview__header,
.workflow-summary-preview__footer,
.workflow-summary-preview__heading,
.workflow-summary-preview__branch {
  display: flex;
  align-items: center;
}

.workflow-summary-preview__header,
.workflow-summary-preview__footer {
  justify-content: space-between;
  gap: 0.5rem;
}

.workflow-summary-preview__heading {
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}

.workflow-summary-preview__action-count,
.workflow-summary-preview__footer {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.6875rem;
  line-height: 1.3;
}

.workflow-summary-preview__action-count {
  white-space: nowrap;
}

.workflow-summary-preview__steps {
  display: grid;
  grid-template-columns: repeat(var(--workflow-summary-item-count), minmax(0, 1fr));
  align-items: start;
  min-block-size: 3.625rem;
}

.workflow-summary-preview__step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  min-inline-size: 0;
  text-align: center;
}

.workflow-summary-preview__step:not(:last-child)::after {
  position: absolute;
  z-index: 0;
  border-block-start: 1px solid var(--workflow-summary-line);
  content: '';
  inline-size: calc(100% - 2rem);
  inset-block-start: 0.9375rem;
  inset-inline-start: calc(50% + 1rem);
}

.workflow-summary-preview__step-icon {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.1);
  block-size: 1.875rem;
  color: rgb(var(--v-theme-primary));
  inline-size: 1.875rem;
}

.workflow-summary-preview__step-icon--more {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.workflow-summary-preview__step-name {
  display: -webkit-box;
  overflow: hidden;
  max-inline-size: 100%;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.625rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.workflow-summary-preview__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.workflow-summary-preview__branch {
  gap: 0.2rem;
}

@media screen and (width <= 600px) {
  .workflow-summary-preview {
    inline-size: 100%;
  }
}
</style>
