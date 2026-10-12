<script setup lang="ts">
import api from '@/api'
import type { Subscribe, SubscrbieInfo, SubscriptionActivityEvent, SubscriptionActivityPage } from '@/api/types'
import { formatSeasonLabel } from '@/@core/utils/season'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { useGlobalSettingsStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const SubscribeLogDialog = defineAsyncComponent(() => import('./SubscribeLogDialog.vue'))

/** 单订阅业务活动弹窗，活动与运行日志分别使用原有权限接口。 */
const props = withDefaults(defineProps<{ modelValue?: boolean; subscription: Subscribe; history?: boolean }>(), {
  modelValue: true,
  history: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: [] }>()
const { t, locale } = useI18n()
const display = useDisplay()
const settings = useGlobalSettingsStore()
const events = ref<SubscriptionActivityEvent[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const failed = ref(false)
const kind = ref<string | null>(null)
const days = ref<number | null>(7)
const expanded = ref<string | null>(null)
const siteDetails = ref(new Set<string>())
const runtimeLogs = ref(false)
const libraryCount = ref<number | null>(null)
let requestVersion = 0
let disposed = false
let refreshTimer: ReturnType<typeof setInterval> | undefined
const detailLoading = ref(new Set<string>())
const detailFailed = ref(new Set<string>())

const visible = computed({
  get: () => props.modelValue !== false,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})
const poster = computed(() =>
  getDisplayImageUrl(props.subscription.poster || '', settings.globalSettings.GLOBAL_IMAGE_CACHE),
)
const subtitle = computed(() =>
  [
    props.subscription.name,
    props.subscription.year,
    props.subscription.type === '电视剧' ? formatSeasonLabel(props.subscription.season, t('media.specials')) : '',
    props.subscription.total_episode
      ? t('subscriptionActivity.totalEpisodes', { count: props.subscription.total_episode })
      : '',
  ]
    .filter(Boolean)
    .join(' · '),
)
const kinds = computed(() => [
  { title: t('subscriptionActivity.allEvents'), value: null },
  ...['refresh', 'search', 'created', 'updated', 'status', 'completed'].map(value => ({ title: title(value), value })),
])
const periods = computed(() =>
  [7, 30, null].map(value => ({
    title: value ? t('subscriptionActivity.recentDays', { count: value }) : t('subscriptionActivity.allTime'),
    value,
  })),
)
const groups = computed(() => {
  const result: { date: string; label: string; events: SubscriptionActivityEvent[] }[] = []
  for (const event of events.value) {
    const date = new Date(event.started_at).toLocaleDateString('en-CA')
    const group = result.find(item => item.date === date)
    if (group) group.events.push(event)
    else result.push({ date, label: dateLabel(event.started_at), events: [event] })
  }
  return result
})
const progress = computed(() =>
  props.subscription.total_episode && libraryCount.value !== null
    ? Math.min(100, (libraryCount.value / props.subscription.total_episode) * 100)
    : 0,
)

/** 按真实媒体库文件计算入库集数，下载提交进度不会冒充入库事实。 */
async function loadLibraryCount() {
  if (props.history || props.subscription.type !== '电视剧') return
  try {
    const result: SubscrbieInfo = await api.get(`subscribe/files/${props.subscription.id}`, { feedback: 'silent' })
    if (!disposed) libraryCount.value = Object.values(result.episodes).filter(item => item.library?.length).length
  } catch {
    // 媒体库暂不可用时保留未知状态，不填入下载数或虚构入库数。
  }
}

/** 加载稳定游标分页；筛选变化时废弃旧请求，避免交叉覆盖和重复项目。 */
async function loadEvents(more = false, quiet = false) {
  const version = ++requestVersion
  loading.value = true
  failed.value = false
  if (!more && !quiet) {
    events.value = []
    cursor.value = null
    expanded.value = null
  }
  try {
    const page: SubscriptionActivityPage = await api.get(`subscribe/${props.subscription.id}/activity`, {
      params: {
        history: props.history,
        kind: kind.value || undefined,
        days: days.value || undefined,
        before: more ? cursor.value : undefined,
      },
      feedback: 'silent',
    })
    if (version !== requestVersion || disposed) return
    const existing = new Set(events.value.map(item => item.event_id))
    if (quiet) {
      const incoming = new Set(page.items.map(item => item.event_id))
      events.value = [
        ...page.items.map(item =>
          mergeSummary(
            item,
            events.value.find(previous => previous.event_id === item.event_id),
          ),
        ),
        ...events.value.filter(item => !incoming.has(item.event_id)),
      ]
    } else events.value = [...events.value, ...page.items.filter(item => !existing.has(item.event_id))]
    if (!quiet) cursor.value = page.next_cursor
    if (!more && !quiet)
      expanded.value = page.items.find(item => item.kind === 'refresh' && item.status === 'empty')?.event_id || null
    if (quiet && expanded.value) void loadDetails(expanded.value)
  } catch {
    if (version === requestVersion && !disposed) failed.value = true
  } finally {
    if (version === requestVersion && !disposed) loading.value = false
  }
}

/** 用概要事实识别轮次变化，不能让旧详情覆盖新的状态或排队计划。 */
function eventRevision(event: SubscriptionActivityEvent) {
  return JSON.stringify([
    event.status,
    event.source,
    event.started_at,
    event.finished_at,
    event.counts,
    event.details.reason,
    event.details.retry_at,
    event.details.phase,
    event.details.changes,
  ])
}

/** 判断是否已有可读详情，后台更新期间保持内容高度和用户滚动位置。 */
function hasDetails(event: SubscriptionActivityEvent) {
  return event.details_loaded !== false || event.details.resources !== undefined || event.details.rules !== undefined
}

/** 复用未改变的详情；有变化时保留旧内容，等按需请求完成后原位替换。 */
function mergeSummary(
  summary: SubscriptionActivityEvent,
  previous?: SubscriptionActivityEvent,
): SubscriptionActivityEvent {
  if (!previous || summary.details_loaded !== false || !hasDetails(previous)) return summary
  const details = { ...previous.details, ...summary.details }
  for (const field of ['reason', 'retry_at', 'phase', 'changes'] as const) {
    if (!(field in summary.details)) delete details[field]
  }
  return { ...summary, details, details_loaded: eventRevision(summary) === eventRevision(previous) }
}

/** 只在展开时获取完整详情；网络失败可单独重试，概要和展开状态不丢失。 */
async function loadDetails(eventId: string) {
  const event = events.value.find(item => item.event_id === eventId)
  if (!event || event.details_loaded !== false || detailLoading.value.has(eventId)) return
  detailLoading.value = new Set([...detailLoading.value, eventId])
  detailFailed.value.delete(eventId)
  try {
    const detail: SubscriptionActivityEvent = await api.get(`subscribe/${props.subscription.id}/activity/${eventId}`, {
      params: { history: props.history },
      feedback: 'silent',
    })
    if (disposed) return
    const current = events.value.find(item => item.event_id === eventId)
    if (current && eventRevision(current) === eventRevision(event)) {
      events.value = events.value.map(item => (item.event_id === eventId ? detail : item))
    }
  } catch {
    if (!disposed) detailFailed.value = new Set([...detailFailed.value, eventId])
  } finally {
    detailLoading.value = new Set([...detailLoading.value].filter(item => item !== eventId))
  }
}

/** 返回本轮结论，区分排队、处理失败、停止和正常没有相关资源。 */
function resultKey(event: SubscriptionActivityEvent) {
  if (event.details.phase === 'queued' && event.status === 'waiting') return 'queuedResult'
  if (event.status === 'waiting') return 'waitingResult'
  if (event.status === 'running') return 'runningResult'
  if (event.status === 'failed') return 'failedResult'
  if (event.status === 'cancelled') return 'cancelledResult'
  if (event.counts.submitted) return 'submittedResult'
  if (event.counts.qualified) return 'unsubmittedResult'
  return event.counts.related ? 'emptyResult' : 'noRelatedResult'
}

/** 让运行中状态和停止状态具有对应图标，避免打勾暗示已完成。 */
function statusIcon(event: SubscriptionActivityEvent) {
  return ['waiting', 'running'].includes(event.status)
    ? 'mdi-clock-outline'
    : event.status === 'failed'
      ? 'mdi-alert-circle-outline'
      : event.status === 'cancelled'
        ? 'mdi-stop-circle-outline'
        : 'mdi-check-circle-outline'
}

/** 清除筛选并查看全部记录，使用独立方法避免模板格式化改变事件表达式。 */
function clearFilters() {
  kind.value = null
  days.value = null
}

/** 将后端事件种类映射为用户能理解的业务动作。 */
function title(value: string) {
  return t(`subscriptionActivity.kind.${value}`)
}
/** 返回业务事件图标，沿用项目 MDI 图标体系。 */
function icon(value: string) {
  return (
    (
      {
        refresh: 'mdi-rss',
        search: 'mdi-magnify',
        created: 'mdi-plus',
        updated: 'mdi-cog-outline',
        status: 'mdi-pause-circle-outline',
        completed: 'mdi-check-circle-outline',
      } as Record<string, string>
    )[value] || 'mdi-history'
  )
}
/** 格式化活动发生时刻，统一跟随浏览器的本地时区。 */
function time(value: string) {
  return new Date(value).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', hour12: false })
}
/** 按用户本地日期显示日期分组和今天、昨天提示。 */
function dateLabel(value: string) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const suffix =
    date.toDateString() === today.toDateString()
      ? t('subscriptionActivity.today')
      : date.toDateString() === yesterday.toDateString()
        ? t('subscriptionActivity.yesterday')
        : ''
  return `${date.toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })}   ${suffix}`
}
/** 汇总轮次计数；共享 RSS 候选与本订阅相关资源使用不同口径。 */
function summary(event: SubscriptionActivityEvent) {
  const c = event.counts
  if (event.status === 'running' && !c.sites && !c.discovered && !c.related)
    return t('subscriptionActivity.runningSummary')
  if (event.details.phase === 'queued' && event.status === 'waiting') return t('subscriptionActivity.queuedSummary')
  if (event.kind === 'refresh')
    return t('subscriptionActivity.refreshSummary', {
      sites: c.sites || 0,
      discovered: c.discovered || 0,
      related: c.related || 0,
      submitted: c.submitted || 0,
    })
  if (event.kind === 'search')
    return t('subscriptionActivity.searchSummary', {
      requested: c.requested_sites || 0,
      sites: c.sites || 0,
      discovered: c.discovered || 0,
      qualified: c.qualified || 0,
      submitted: c.submitted || 0,
    })
  const changes = event.details.changes || []
  if (changes.length)
    return changes
      .map(
        item =>
          `${fieldLabel(item.field)}：${valueLabel(item.before, item.field)} → ${valueLabel(item.after, item.field)}`,
      )
      .join(' · ')
  return t(`subscriptionActivity.summary.${event.kind}`)
}
/** 翻译规则字段，并为未来兼容字段保留可读的名称。 */
function fieldLabel(field: string) {
  const key = `subscriptionActivity.fields.${field}`
  const label = t(key)
  return label === key ? field : label
}
/** 将冻结的规则值转换为紧凑文本。 */
function valueLabel(value: unknown, field?: string): string {
  if (field === 'state' && ['N', 'R', 'S', 'P'].includes(String(value)))
    return t(
      (
        {
          N: 'subscribe.notStarted',
          R: 'subscribe.subscribing',
          S: 'subscribe.cardStatePaused',
          P: 'subscribe.cardStatePending',
        } as Record<string, string>
      )[String(value)],
    )
  if (value === null || value === undefined || value === '') return t('subscriptionActivity.unset')
  if (Array.isArray(value)) return value.join(', ') || t('subscriptionActivity.unset')
  return String(value)
}
/** 返回本轮过滤条件，不随当前订阅设置变化而改变历史解释。 */
function rules(event: SubscriptionActivityEvent) {
  return Object.entries(event.details.rules || {}).filter(
    ([, value]) => value !== null && value !== '' && value !== 0 && (!Array.isArray(value) || value.length),
  )
}
/** 用业务状态决定提示色；空结果不会被渲染成错误。 */
function tone(status: string) {
  return ['waiting', 'running'].includes(status)
    ? 'warning'
    : status === 'failed'
      ? 'error'
      : status === 'completed'
        ? 'success'
        : 'neutral'
}
/** 切换某轮站点详情，保留独立的展开状态。 */
function toggleSites(eventId: string) {
  const next = new Set(siteDetails.value)
  if (next.has(eventId)) next.delete(eventId)
  else next.add(eventId)
  siteDetails.value = next
}
/** 返回轮次关键阶段与计数，搜索和刷新共用详情结构。 */
function stages(event: SubscriptionActivityEvent) {
  const c = event.counts
  return [
    {
      key: 'sites',
      icon: 'mdi-database-outline',
      label: t(`subscriptionActivity.${event.kind === 'refresh' ? 'refreshSites' : 'searchSites'}`),
      value: c.sites || 0,
    },
    {
      key: 'discovered',
      icon: 'mdi-file-document-outline',
      label: t(`subscriptionActivity.${event.kind === 'refresh' ? 'sharedCandidates' : 'discovered'}`),
      value: c.discovered || 0,
    },
    { key: 'related', icon: 'mdi-target', label: t('subscriptionActivity.related'), value: c.related || 0 },
    {
      key: 'qualified',
      icon: 'mdi-check-circle-outline',
      label: t('subscriptionActivity.qualified'),
      value: c.qualified || 0,
    },
  ]
}

watch([kind, days], () => loadEvents())
watch(expanded, eventId => {
  if (eventId) void loadDetails(eventId)
})
onMounted(() => {
  void loadEvents()
  void loadLibraryCount()
  refreshTimer = setInterval(() => {
    if (
      visible.value &&
      !loading.value &&
      (!props.history || events.value.some(event => ['waiting', 'running'].includes(event.status)))
    )
      void loadEvents(false, true)
  }, 15_000)
})
onBeforeUnmount(() => {
  disposed = true
  ++requestVersion
  clearInterval(refreshTimer)
})
</script>

<template>
  <VDialog
    v-model="visible"
    class="subscription-activity-dialog"
    max-width="86rem"
    :fullscreen="!display.mdAndUp.value"
    scrollable
  >
    <VCard class="subscription-activity">
      <header class="activity-header">
        <VImg v-if="poster" :src="poster" class="activity-poster" width="108" height="140" cover />
        <div v-else class="activity-poster activity-poster--empty">
          <VIcon icon="mdi-movie-open-outline" size="40" />
        </div>
        <div class="activity-heading">
          <h2>{{ t('subscriptionActivity.title') }}</h2>
          <p class="activity-subtitle">{{ subtitle }}</p>
          <p class="activity-progress-label" v-if="libraryCount !== null">
            {{ t('subscriptionActivity.libraryProgress', { count: libraryCount, total: subscription.total_episode }) }}
          </p>
          <p v-else class="activity-progress-label activity-muted">
            {{ t(history ? 'subscriptionActivity.completedHistory' : 'subscriptionActivity.libraryUnknown') }}
          </p>
          <VProgressLinear
            v-if="subscription.type === '电视剧' && !history"
            :model-value="progress"
            height="8"
            color="primary"
            rounded
            class="activity-progress"
          />
        </div>
        <div class="activity-controls">
          <div class="activity-top-actions">
            <VBtn
              variant="text"
              prepend-icon="mdi-text-box-search-outline"
              :disabled="history"
              @click="runtimeLogs = true"
              >{{ t('subscriptionActivity.runtimeLogs') }}</VBtn
            >
            <span class="activity-action-divider" />
            <VBtn icon="mdi-close" variant="text" :aria-label="t('common.close')" @click="visible = false" />
          </div>
          <div class="activity-filters">
            <VSelect
              v-model="kind"
              :items="kinds"
              :aria-label="t('subscriptionActivity.eventFilter')"
              variant="outlined"
              density="comfortable"
              hide-details
            />
            <VSelect
              v-model="days"
              :items="periods"
              :aria-label="t('subscriptionActivity.dateFilter')"
              prepend-inner-icon="mdi-calendar-blank-outline"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </div>
        </div>
      </header>
      <div class="activity-scroll" :aria-busy="loading">
        <div v-if="loading && !events.length" class="activity-empty" role="status">
          <VProgressCircular indeterminate color="primary" /><span>{{ t('common.loading') }}</span>
        </div>
        <div v-else-if="failed && !events.length" class="activity-empty" role="alert">
          <VIcon icon="mdi-cloud-alert-outline" size="36" /><strong>{{ t('subscriptionActivity.loadFailed') }}</strong>
          <VBtn variant="tonal" @click="loadEvents()">{{ t('common.retry') }}</VBtn>
        </div>
        <div v-else-if="!events.length" class="activity-empty">
          <VIcon icon="mdi-history" size="40" /><strong>{{ t('subscriptionActivity.empty') }}</strong>
          <VBtn v-if="days || kind" variant="text" @click="clearFilters">{{ t('subscriptionActivity.allTime') }}</VBtn>
        </div>
        <section v-for="group in groups" :key="group.date" class="activity-day">
          <h3 class="activity-date">{{ group.label }}</h3>
          <article
            v-for="event in group.events"
            :key="event.event_id"
            class="activity-event"
            :class="{
              'activity-event--open': expanded === event.event_id,
              'activity-event--compact': !['search', 'refresh'].includes(event.kind),
            }"
          >
            <button
              class="activity-row"
              :aria-expanded="expanded === event.event_id"
              :aria-controls="`activity-detail-${event.event_id}`"
              @click="expanded = expanded === event.event_id ? null : event.event_id"
            >
              <span class="activity-icon"><VIcon :icon="icon(event.kind)" size="30" /></span>
              <time :datetime="event.started_at">{{ time(event.started_at) }}</time>
              <span class="activity-action"
                ><strong>{{ title(event.kind) }}</strong
                ><small v-if="['search', 'refresh'].includes(event.kind)">{{
                  t(
                    `subscriptionActivity.source.${event.source === 'manual' || event.source === 'user' || event.source === 'targeted' ? 'user' : 'automatic'}`,
                  )
                }}</small></span
              >
              <span
                v-if="['search', 'refresh'].includes(event.kind)"
                class="activity-status"
                :class="`activity-status--${tone(event.status)}`"
              >
                <VIcon :icon="statusIcon(event)" size="18" />{{
                  t(
                    `subscriptionActivity.status.${event.details.phase === 'queued' && event.status === 'waiting' ? 'queued' : event.status}`,
                  )
                }}
              </span>
              <span class="activity-summary"
                ><span>{{ summary(event) }}</span
                ><small v-if="event.counts.failed_sites">{{
                  t('subscriptionActivity.failedSites', { count: event.counts.failed_sites })
                }}</small
                ><small v-if="event.details.retry_at">{{
                  t(
                    event.details.phase === 'queued'
                      ? 'subscriptionActivity.scheduledAt'
                      : 'subscriptionActivity.retryAt',
                    { time: time(event.details.retry_at) },
                  )
                }}</small></span
              >
              <span
                class="activity-details-label"
                v-if="expanded !== event.event_id && ['search', 'refresh'].includes(event.kind)"
                >{{ t('subscriptionActivity.viewDetails') }}</span
              >
              <VIcon
                :icon="expanded === event.event_id ? 'mdi-chevron-up' : 'mdi-chevron-right'"
                class="activity-chevron"
              />
            </button>
            <div v-if="expanded === event.event_id" :id="`activity-detail-${event.event_id}`" class="activity-detail">
              <div v-if="detailLoading.has(event.event_id) && !hasDetails(event)" class="activity-empty" role="status">
                <VProgressCircular indeterminate size="28" color="primary" /><span>{{ t('common.loading') }}</span>
              </div>
              <div
                v-else-if="detailFailed.has(event.event_id) && !hasDetails(event)"
                class="activity-empty"
                role="alert"
              >
                <span>{{ t('subscriptionActivity.detailFailed') }}</span
                ><VBtn variant="tonal" @click="loadDetails(event.event_id)">{{ t('common.retry') }}</VBtn>
              </div>
              <template v-else-if="['search', 'refresh'].includes(event.kind)">
                <p v-if="detailFailed.has(event.event_id)" role="alert" class="activity-muted">
                  {{ t('subscriptionActivity.detailFailed') }}
                  <VBtn size="small" variant="text" @click="loadDetails(event.event_id)">{{ t('common.retry') }}</VBtn>
                </p>
                <h3>
                  <VProgressCircular
                    v-if="detailLoading.has(event.event_id)"
                    size="18"
                    width="2"
                    indeterminate
                    color="primary"
                    :aria-label="t('common.loading')"
                  />
                  {{
                    t(
                      event.counts.submitted
                        ? 'subscriptionActivity.roundResult'
                        : 'subscriptionActivity.whyNoDownload',
                    )
                  }}
                </h3>
                <p class="activity-result">
                  <strong>{{
                    t(`subscriptionActivity.${resultKey(event)}`, {
                      count: event.counts.submitted || event.counts.related || 0,
                    })
                  }}</strong>
                </p>
                <p class="activity-explanation">
                  {{
                    event.details.reason ||
                    t(
                      event.counts.submitted
                        ? 'subscriptionActivity.submittedHint'
                        : 'subscriptionActivity.waitingHint',
                    )
                  }}
                </p>
                <div class="activity-stages">
                  <template v-for="(stage, index) in stages(event)" :key="stage.key">
                    <div class="activity-stage">
                      <VIcon
                        :icon="stage.icon"
                        size="31"
                        :class="{ 'activity-stage-success': stage.key === 'qualified' }"
                      />
                      <div>
                        <span>{{ stage.label }}</span
                        ><strong
                          >{{ stage.value }} <small>{{ t('subscriptionActivity.items') }}</small></strong
                        >
                      </div>
                    </div>
                    <VIcon v-if="index < 3" icon="mdi-chevron-right" class="activity-stage-arrow" />
                  </template>
                </div>
                <h4>{{ t('subscriptionActivity.resources', { count: event.counts.related || 0 }) }}</h4>
                <div class="activity-table-scroll">
                  <table class="activity-table">
                    <thead>
                      <tr>
                        <th>{{ t('subscriptionActivity.resourceName') }}</th>
                        <th>{{ t('subscriptionActivity.resourceSite') }}</th>
                        <th>{{ t('subscriptionActivity.decision') }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(resource, index) in event.details.resources || []" :key="index">
                        <td>{{ resource.title }}</td>
                        <td>{{ resource.site || t('subscriptionActivity.unknownSite') }}</td>
                        <td>
                          <VIcon
                            :icon="
                              resource.decision === 'submitted'
                                ? 'mdi-check-circle-outline'
                                : resource.decision === 'qualified'
                                  ? 'mdi-check'
                                  : 'mdi-information-outline'
                            "
                            size="19"
                            :class="resource.decision === 'submitted' ? 'activity-success' : 'activity-muted'"
                          />
                          {{ resource.reason || t(`subscriptionActivity.decisionLabel.${resource.decision}`) }}
                        </td>
                      </tr>
                      <tr v-if="!event.details.resources?.length">
                        <td colspan="3" class="activity-muted">{{ t('subscriptionActivity.noRelatedResources') }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p v-if="event.details.resources_omitted" class="activity-muted">
                  {{ t('subscriptionActivity.omitted', { count: event.details.resources_omitted }) }}
                </p>
                <div class="activity-disclosures">
                  <button
                    v-if="event.details.sites?.length"
                    class="activity-site-toggle"
                    :aria-expanded="siteDetails.has(event.event_id)"
                    @click="toggleSites(event.event_id)"
                  >
                    <VIcon icon="mdi-format-list-bulleted" size="22" /><span>{{
                      t('subscriptionActivity.siteDetails', { count: event.details.sites.length })
                    }}</span
                    ><VIcon :icon="siteDetails.has(event.event_id) ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
                  </button>
                  <details v-if="rules(event).length" class="activity-rules">
                    <summary>
                      {{
                        t(
                          event.details.phase === 'queued'
                            ? 'subscriptionActivity.queuedRules'
                            : 'subscriptionActivity.frozenRules',
                        )
                      }}
                    </summary>
                    <dl>
                      <template v-for="[field, value] in rules(event)" :key="field"
                        ><dt>{{ fieldLabel(field) }}</dt>
                        <dd>{{ valueLabel(value, field) }}</dd></template
                      >
                    </dl>
                  </details>
                </div>
                <ul v-if="siteDetails.has(event.event_id)" class="activity-site-list">
                  <li v-for="site in event.details.sites" :key="site.id">
                    <span>{{ site.name }}</span
                    ><span>{{ t('subscriptionActivity.siteCandidates', { count: site.candidates }) }}</span
                    ><span>{{ t(`subscriptionActivity.siteStatus.${site.status}`) }}</span>
                  </li>
                </ul>
                <p v-if="event.kind === 'refresh'" class="activity-footnote">
                  {{
                    t('subscriptionActivity.sharedHint', {
                      shared: event.counts.discovered || 0,
                      related: event.counts.related || 0,
                    })
                  }}
                </p>
              </template>
              <template v-else
                ><h3>{{ title(event.kind) }}</h3>
                <p>{{ summary(event) }}</p></template
              >
              <details v-if="event.details.attempts && event.details.attempts.length > 1" class="activity-rules">
                <summary>{{ t('subscriptionActivity.attempts', { count: event.details.attempts.length }) }}</summary>
                <ol class="activity-attempts">
                  <li v-for="(attempt, index) in event.details.attempts" :key="index">
                    <strong
                      >{{ time(attempt.started_at) }} · {{ t(`subscriptionActivity.status.${attempt.status}`) }}</strong
                    >
                    <p>
                      {{
                        t('subscriptionActivity.attemptSummary', {
                          related: attempt.counts.related || 0,
                          submitted: attempt.counts.submitted || 0,
                        })
                      }}
                    </p>
                    <dl>
                      <template
                        v-for="[field, value] in Object.entries(attempt.rules).filter(
                          ([, value]) =>
                            value !== null && value !== '' && value !== 0 && (!Array.isArray(value) || value.length),
                        )"
                        :key="field"
                        ><dt>{{ fieldLabel(field) }}</dt>
                        <dd>{{ valueLabel(value, field) }}</dd></template
                      >
                    </dl>
                  </li>
                </ol>
              </details>
              <details v-if="!['search', 'refresh'].includes(event.kind) && rules(event).length" class="activity-rules">
                <summary>
                  {{
                    t(
                      event.details.phase === 'queued'
                        ? 'subscriptionActivity.queuedRules'
                        : 'subscriptionActivity.frozenRules',
                    )
                  }}
                </summary>
                <dl>
                  <template v-for="[field, value] in rules(event)" :key="field"
                    ><dt>{{ fieldLabel(field) }}</dt>
                    <dd>{{ valueLabel(value, field) }}</dd></template
                  >
                </dl>
              </details>
            </div>
          </article>
        </section>
        <div v-if="cursor" class="activity-load-more">
          <VBtn variant="tonal" :loading="loading" @click="loadEvents(true)">{{
            t(failed ? 'common.retry' : 'subscriptionActivity.loadMore')
          }}</VBtn>
        </div>
        <p v-if="failed && events.length" class="activity-muted text-center" role="alert">
          {{ t('subscriptionActivity.loadFailed') }}
        </p>
      </div>
      <SubscribeLogDialog v-if="runtimeLogs" :subscription="subscription" @close="runtimeLogs = false" />
    </VCard>
  </VDialog>
</template>

<style scoped>
.subscription-activity-dialog :deep(.v-overlay__content) {
  margin: 15px;
  max-block-size: calc(100% - 30px);
  inline-size: calc(100% - 30px);
}
.activity-disclosures {
  display: flex;
  align-items: start;
  gap: 24px;
  margin-block-start: 12px;
  border: 1px solid var(--activity-border);
  border-radius: 8px;
  padding: 7px 16px;
}
.activity-disclosures .activity-site-toggle {
  flex: 1;
  border: 0;
  margin: 0;
  padding: 0;
}
.activity-disclosures .activity-rules {
  margin: 0;
  padding-block: 1px;
}
.activity-attempts {
  padding-inline-start: 22px;
}
.activity-attempts li {
  margin-block-start: 12px;
}

.subscription-activity {
  --activity-border: rgba(var(--v-theme-on-surface), 0.13);
  background:
    linear-gradient(115deg, rgba(var(--v-theme-info), 0.1), rgba(var(--v-theme-primary), 0.07)),
    rgb(var(--v-theme-surface));
  border: 1px solid var(--activity-border);
  border-radius: 16px !important;
  max-block-size: calc(100dvh - 30px);
  color: rgb(var(--v-theme-on-surface));
}
.activity-header {
  display: flex;
  gap: 30px;
  padding: 14px 28px;
  border-block-end: 1px solid var(--activity-border);
  background: linear-gradient(115deg, rgba(var(--v-theme-primary), 0.045), transparent);
  flex: 0 0 auto;
}
.activity-poster {
  flex: 0 0 108px;
  border: 1px solid rgba(var(--v-theme-info), 0.5);
  border-radius: 5px;
}
.activity-poster--empty {
  display: grid;
  place-items: center;
  background: rgba(var(--v-theme-info), 0.1);
}
.activity-heading {
  flex: 1;
  min-inline-size: 0;
  padding-block-start: 7px;
}
.activity-heading h2 {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 4px;
}
.activity-subtitle {
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin: 0 0 9px;
  font-size: 18px;
}
.activity-progress-label {
  font-size: 18px;
  margin: 0 0 6px;
}
.activity-progress {
  max-inline-size: 375px;
}
.activity-controls {
  inline-size: 370px;
  flex: 0 0 370px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-block: 3px 14px;
}
.activity-top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.activity-top-actions :deep(.v-btn) {
  font-size: 17px;
}
.activity-action-divider {
  border-inline-end: 1px solid var(--activity-border);
  block-size: 30px;
}
.activity-filters {
  display: flex;
  gap: 18px;
}
.activity-filters > * {
  min-inline-size: 0;
  flex: 1;
}
.activity-filters :deep(.v-field) {
  font-size: 16px;
  border-radius: 8px;
}
.activity-scroll {
  overflow-y: auto;
  padding: 12px 20px 0;
  min-block-size: 210px;
}
.activity-day {
  margin-block-end: 15px;
}
.activity-date {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.45;
  color: rgba(var(--v-theme-on-surface), 0.72);
  margin: 0 10px 6px;
}
.activity-event {
  background: linear-gradient(100deg, rgba(var(--v-theme-info), 0.075), rgba(var(--v-theme-primary), 0.035));
  border: 1px solid var(--activity-border);
  border-radius: 10px;
  margin-block-end: 10px;
  overflow: hidden;
}
.activity-event--open {
  border-color: rgba(var(--v-theme-primary), 0.65);
  box-shadow: inset 3px 0 rgb(var(--v-theme-primary));
}
.activity-row {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 22px;
  inline-size: 100%;
  min-block-size: 76px;
  color: inherit;
  text-align: start;
  cursor: pointer;
}
.activity-row:focus-visible,
.activity-site-toggle:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -3px;
}
.activity-icon {
  display: grid;
  place-items: center;
  flex: 0 0 49px;
  block-size: 49px;
  border-radius: 50%;
  background: rgba(var(--v-theme-primary), 0.34);
  color: #ded0ff;
}
.activity-row time {
  flex: 0 0 60px;
  font-size: 16px;
  font-weight: 600;
}
.activity-action {
  flex: 0 0 125px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.activity-action strong {
  font-size: 19px;
  font-weight: 700;
}
.activity-action small {
  font-size: 14px;
  color: rgba(var(--v-theme-on-surface), 0.67);
}
.activity-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(var(--v-theme-info), 0.35);
  border-radius: 22px;
  color: rgba(var(--v-theme-on-surface), 0.78);
  padding: 5px 15px;
  font-size: 15px;
  background: rgba(var(--v-theme-info), 0.09);
}
.activity-status--warning {
  color: rgb(var(--v-theme-warning));
  border-color: rgba(var(--v-theme-warning), 0.2);
  background: rgba(var(--v-theme-warning), 0.16);
}
.activity-status--error {
  color: rgb(var(--v-theme-error));
  border-color: rgba(var(--v-theme-error), 0.25);
  background: rgba(var(--v-theme-error), 0.1);
}
.activity-status--success {
  color: rgb(var(--v-theme-success));
  border-color: rgba(var(--v-theme-success), 0.25);
  background: rgba(var(--v-theme-success), 0.09);
}
.activity-summary {
  flex: 1;
  min-inline-size: 0;
  font-size: 16px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.activity-summary small {
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 13px;
}
.activity-details-label {
  flex: 0 0 auto;
  font-size: 15px;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.activity-chevron {
  color: rgba(var(--v-theme-on-surface), 0.6);
  flex-shrink: 0;
}
.activity-event--open .activity-chevron {
  color: rgb(var(--v-theme-primary));
}
.activity-detail {
  margin: 0 22px 10px;
  padding: 14px 24px 8px;
  border: 1px solid var(--activity-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-background), 0.18);
}
.activity-detail h3 {
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
  line-height: 1.5;
}
.activity-detail h4 {
  font-size: 18px;
  font-weight: 700;
  margin: 9px 0 5px;
}
.activity-result {
  font-size: 19px;
  margin: 0 0 3px;
}
.activity-explanation {
  font-size: 16px;
  color: rgba(var(--v-theme-on-surface), 0.75);
  margin: 0 0 9px;
}
.activity-stages {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-background), 0.35);
  padding: 12px 16px;
}
.activity-stage {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1;
  min-inline-size: 0;
}
.activity-stage > :first-child {
  box-sizing: content-box;
  padding: 14px;
  background: rgba(var(--v-theme-info), 0.12);
  border-radius: 10px;
  color: rgb(var(--v-theme-info));
}
.activity-stage > .activity-stage-success {
  color: rgb(var(--v-theme-success));
}
.activity-stage div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 15px;
}
.activity-stage strong {
  font-size: 27px;
  line-height: 1.1;
}
.activity-stage small {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 14px;
  font-weight: 400;
}
.activity-stage-arrow {
  color: rgb(var(--v-theme-info));
}
.activity-table-scroll {
  overflow-x: auto;
  border: 1px solid var(--activity-border);
  border-radius: 8px;
}
.activity-table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: 16px;
}
.activity-table th {
  text-align: start;
  font-weight: 400;
  color: rgba(var(--v-theme-on-surface), 0.7);
  background: rgba(var(--v-theme-info), 0.075);
}
.activity-table td,
.activity-table th {
  padding: 6px 18px;
  border-block-end: 1px solid var(--activity-border);
}
.activity-table td + td,
.activity-table th + th {
  border-inline-start: 1px solid var(--activity-border);
}
.activity-table td:first-child {
  inline-size: 43%;
  overflow-wrap: anywhere;
}
.activity-table td:nth-child(2) {
  inline-size: 17%;
}
.activity-table tr:last-child td {
  border-block-end: none;
}
.activity-site-toggle {
  margin-block-start: 12px;
  padding: 7px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  inline-size: 100%;
  border: 1px solid var(--activity-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-info), 0.06);
  text-align: start;
  color: inherit;
  cursor: pointer;
}
.activity-site-toggle span {
  flex: 1;
  font-size: 15px;
}
.activity-site-list {
  list-style: none;
  margin: 0;
  padding: 8px 20px;
}
.activity-site-list li {
  display: flex;
  gap: 16px;
  padding: 6px 0;
  border-block-end: 1px solid var(--activity-border);
  font-size: 14px;
}
.activity-site-list li span:first-child {
  flex: 1;
}
.activity-footnote {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 14px;
  margin: 12px 0 0;
}
.activity-rules {
  margin-block-start: 9px;
  font-size: 14px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}
.activity-rules summary {
  cursor: pointer;
}
.activity-rules dl {
  display: grid;
  grid-template-columns: minmax(100px, 150px) 1fr;
  gap: 5px 15px;
  padding-block: 8px;
}
.activity-rules dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.activity-event--compact .activity-row {
  min-block-size: 49px;
  padding-block: 3px;
}
.activity-event--compact .activity-icon {
  flex-basis: 44px;
  block-size: 44px;
}
.activity-event--compact .activity-summary {
  border-inline-start: 1px solid var(--activity-border);
  padding-inline-start: 28px;
}
.activity-event--compact .activity-action {
  flex-basis: 170px;
}
.activity-event--compact {
  margin-block-end: 5px;
}
.activity-muted {
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.activity-success {
  color: rgb(var(--v-theme-success));
}
.activity-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 15px;
  min-block-size: 320px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.activity-empty strong {
  font-size: 20px;
}
.activity-load-more {
  text-align: center;
  padding-block: 12px;
}
@media (max-width: 1200px) {
  .activity-row {
    gap: 14px;
  }
  .activity-action {
    flex-basis: 106px;
  }
  .activity-status {
    padding-inline: 10px;
  }
  .activity-details-label {
    display: none;
  }
  .activity-controls {
    inline-size: 320px;
    flex-basis: 320px;
  }
}
@media (max-width: 959px) {
  .subscription-activity-dialog :deep(.v-overlay__content) {
    margin: 0;
    max-block-size: 100%;
    inline-size: 100%;
  }
  /* 安全区由头部和滚动区分别承担，覆盖全局全屏卡片将顶部空间合并到底部的样式。 */
  .subscription-activity-dialog :deep(.v-overlay__content > .subscription-activity) {
    padding-block-end: 0;
  }
  .activity-disclosures {
    flex-direction: column;
    gap: 10px;
  }
  .activity-disclosures .activity-site-toggle {
    inline-size: 100%;
  }
  .subscription-activity {
    max-block-size: 100dvh;
    border-radius: 0 !important;
  }
  .activity-header {
    gap: 15px;
    padding: calc(18px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) 12px
      calc(16px + env(safe-area-inset-left, 0px));
    flex-wrap: wrap;
    position: relative;
  }
  .activity-poster {
    flex-basis: 65px;
    max-inline-size: 65px;
    max-block-size: 90px;
  }
  .activity-heading {
    padding-block-start: 0;
    padding-inline-end: 30px;
  }
  .activity-heading h2 {
    font-size: 25px;
  }
  .activity-subtitle,
  .activity-progress-label {
    font-size: 14px;
  }
  .activity-controls {
    flex-basis: 100%;
    inline-size: 100%;
    padding: 0;
  }
  .activity-top-actions {
    position: static;
    order: 2;
    margin-block-start: 8px;
  }
  .activity-top-actions .v-btn:last-child {
    position: absolute;
    inset-block-start: calc(6px + env(safe-area-inset-top, 0px));
    inset-inline-end: calc(6px + env(safe-area-inset-right, 0px));
  }
  .activity-top-actions .v-btn:first-child {
    font-size: 14px;
  }
  .activity-action-divider {
    display: none;
  }
  .activity-filters {
    gap: 12px;
  }
  .activity-filters :deep(.v-field) {
    font-size: 14px;
  }
  .activity-scroll {
    padding: 12px calc(10px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px))
      calc(10px + env(safe-area-inset-left, 0px));
  }
  .activity-row {
    padding: 12px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .activity-icon {
    flex-basis: 36px;
    block-size: 36px;
  }
  .activity-icon :deep(.v-icon) {
    font-size: 24px !important;
  }
  .activity-row time {
    flex-basis: 44px;
    font-size: 13px;
  }
  .activity-action {
    flex: 1;
  }
  .activity-action strong {
    font-size: 16px;
  }
  .activity-action small {
    font-size: 12px;
  }
  .activity-status {
    font-size: 12px;
    padding: 4px 8px;
  }
  .activity-summary {
    flex: 0 0 calc(100% - 34px);
    order: 5;
    font-size: 13px;
    padding-inline-start: 0;
  }
  .activity-chevron {
    margin-inline-start: auto;
    order: 6;
  }
  .activity-date {
    font-size: 15px;
  }
  .activity-detail {
    margin: 0 9px 10px;
    padding: 12px;
  }
  .activity-detail h3 {
    font-size: 20px;
  }
  .activity-result {
    font-size: 16px;
  }
  .activity-explanation {
    font-size: 14px;
  }
  .activity-stages {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    padding: 12px;
  }
  .activity-stage {
    gap: 8px;
  }
  .activity-stage > :first-child {
    padding: 8px;
    font-size: 25px !important;
  }
  .activity-stage div {
    font-size: 12px;
  }
  .activity-stage strong {
    font-size: 23px;
  }
  .activity-stage-arrow {
    display: none;
  }
  .activity-table {
    min-inline-size: 0;
    font-size: 13px;
  }
  .activity-table thead {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    clip-path: inset(50%);
    overflow: hidden;
  }
  .activity-table tr {
    display: grid;
    grid-template-columns: 1fr;
    padding: 8px 10px;
    border-block-end: 1px solid var(--activity-border);
  }
  .activity-table td {
    border: 0 !important;
    padding: 2px 0 !important;
    inline-size: auto !important;
  }
  .activity-table td:nth-child(2) {
    color: rgba(var(--v-theme-on-surface), 0.65);
  }
  .activity-table td,
  .activity-table th {
    padding: 7px 10px;
  }
  .activity-event--compact .activity-action {
    flex-basis: 140px;
  }
  .activity-event--compact .activity-summary {
    border: none;
    padding-inline-start: 0;
  }
  .activity-event--compact .activity-icon {
    flex-basis: 36px;
    block-size: 36px;
  }
}
</style>
