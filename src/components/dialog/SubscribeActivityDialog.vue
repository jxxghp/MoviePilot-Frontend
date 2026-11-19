<script setup lang="ts">
import api from '@/api'
import { subscriptionDownloadKey } from '@/utils/subscriptionDownload'
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

/** 返回事件图标对应的语义色调，保证浅色与深色主题下清晰可辨。 */
function kindTone(value: string) {
  if (value === 'completed') return 'success'
  if (value === 'status') return 'warning'
  if (value === 'search') return 'info'
  if (value === 'refresh') return 'primary'
  return 'neutral'
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
  const dateText = date.toLocaleDateString(locale.value, { year: 'numeric', month: 'long', day: 'numeric' })
  return suffix ? `${dateText} · ${suffix}` : dateText
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
    content-class="subscription-activity-content"
    max-width="76rem"
    :height="display.mdAndUp.value ? 'min(88dvh, 56rem)' : undefined"
    :fullscreen="!display.mdAndUp.value"
    scrollable
  >
    <VCard class="subscription-activity">
      <header class="activity-header">
        <VImg v-if="poster" :src="poster" class="activity-poster" cover />
        <div v-else class="activity-poster activity-poster--empty">
          <VIcon icon="mdi-movie-open-outline" size="28" />
        </div>

        <div class="activity-heading">
          <div class="activity-eyebrow">
            <VIcon icon="mdi-history" size="15" />
            <span data-native-dialog-title>{{ t('subscriptionActivity.title') }}</span>
          </div>
          <h2 class="activity-title">{{ subscription.name }}</h2>
          <p v-if="subtitle" class="activity-subtitle">{{ subtitle }}</p>
          <div class="activity-progress-wrap">
            <p v-if="libraryCount !== null" class="activity-progress-label num">
              {{
                t('subscriptionActivity.libraryProgress', { count: libraryCount, total: subscription.total_episode })
              }}
            </p>
            <p v-else class="activity-progress-label activity-muted">
              {{ t(history ? 'subscriptionActivity.completedHistory' : 'subscriptionActivity.libraryUnknown') }}
            </p>
            <VProgressLinear
              v-if="subscription.type === '电视剧' && !history"
              :model-value="progress"
              height="5"
              color="primary"
              rounded
              class="activity-progress"
            />
          </div>
        </div>

        <div class="activity-controls">
          <div class="activity-top-actions">
            <VBtn
              variant="tonal"
              size="small"
              prepend-icon="mdi-text-box-search-outline"
              :disabled="history"
              @click="runtimeLogs = true"
            >
              {{ t('subscriptionActivity.runtimeLogs') }}
            </VBtn>
            <VBtn
              data-native-dialog-close
              class="activity-close-btn"
              icon="mdi-close"
              variant="text"
              size="small"
              :aria-label="t('common.close')"
              @click="visible = false"
            />
          </div>
          <div class="activity-filters">
            <VSelect
              v-model="kind"
              :items="kinds"
              :aria-label="t('subscriptionActivity.eventFilter')"
              prepend-inner-icon="mdi-filter-variant"
              variant="outlined"
              density="compact"
              hide-details
            />
            <VSelect
              v-model="days"
              :items="periods"
              :aria-label="t('subscriptionActivity.dateFilter')"
              prepend-inner-icon="mdi-calendar-blank-outline"
              variant="outlined"
              density="compact"
              hide-details
            />
          </div>
        </div>
      </header>

      <div class="activity-scroll" :aria-busy="loading">
        <div v-if="loading && !events.length" class="activity-empty" role="status">
          <VProgressCircular indeterminate size="32" width="3" color="primary" />
          <span>{{ t('common.loading') }}</span>
        </div>
        <div v-else-if="failed && !events.length" class="activity-empty" role="alert">
          <VIcon icon="mdi-cloud-alert-outline" size="36" />
          <strong>{{ t('subscriptionActivity.loadFailed') }}</strong>
          <VBtn variant="tonal" color="primary" size="small" @click="loadEvents()">{{ t('common.retry') }}</VBtn>
        </div>
        <div v-else-if="!events.length" class="activity-empty">
          <VIcon icon="mdi-history" size="36" />
          <strong>{{ t('subscriptionActivity.empty') }}</strong>
          <VBtn v-if="days || kind" variant="tonal" size="small" @click="clearFilters">
            {{ t('subscriptionActivity.allTime') }}
          </VBtn>
        </div>

        <section v-for="group in groups" :key="group.date" class="activity-day">
          <h3 class="activity-date num">{{ group.label }}</h3>
          <div class="activity-day-list">
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
                type="button"
                class="activity-row"
                :aria-expanded="expanded === event.event_id"
                :aria-controls="`activity-detail-${event.event_id}`"
                @click="expanded = expanded === event.event_id ? null : event.event_id"
              >
                <span class="activity-icon" :class="`activity-icon--${kindTone(event.kind)}`">
                  <VIcon :icon="icon(event.kind)" size="18" />
                </span>
                <time class="num" :datetime="event.started_at">{{ time(event.started_at) }}</time>
                <span class="activity-action">
                  <strong>{{ title(event.kind) }}</strong>
                  <small v-if="['search', 'refresh'].includes(event.kind)">
                    {{
                      t(
                        `subscriptionActivity.source.${event.source === 'manual' || event.source === 'user' || event.source === 'targeted' ? 'user' : 'automatic'}`,
                      )
                    }}
                  </small>
                </span>
                <span
                  v-if="['search', 'refresh'].includes(event.kind)"
                  class="activity-status"
                  :class="`activity-status--${tone(event.status)}`"
                >
                  <VIcon :icon="statusIcon(event)" size="14" />
                  <span>
                    {{
                      t(
                        `subscriptionActivity.status.${event.details.phase === 'queued' && event.status === 'waiting' ? 'queued' : event.status}`,
                      )
                    }}
                  </span>
                </span>
                <span class="activity-summary num">
                  <span>{{ summary(event) }}</span>
                  <small v-if="event.counts.failed_sites">
                    {{ t('subscriptionActivity.failedSites', { count: event.counts.failed_sites }) }}
                  </small>
                  <small v-if="event.details.retry_at">
                    {{
                      t(
                        event.details.phase === 'queued'
                          ? 'subscriptionActivity.scheduledAt'
                          : 'subscriptionActivity.retryAt',
                        { time: time(event.details.retry_at) },
                      )
                    }}
                  </small>
                </span>
                <span
                  v-if="expanded !== event.event_id && ['search', 'refresh'].includes(event.kind)"
                  class="activity-details-label"
                >
                  {{ t('subscriptionActivity.viewDetails') }}
                </span>
                <VIcon
                  :icon="expanded === event.event_id ? 'mdi-chevron-up' : 'mdi-chevron-right'"
                  size="18"
                  class="activity-chevron"
                />
              </button>

              <div v-if="expanded === event.event_id" :id="`activity-detail-${event.event_id}`" class="activity-detail">
                <div
                  v-if="detailLoading.has(event.event_id) && !hasDetails(event)"
                  class="activity-empty activity-empty--inline"
                  role="status"
                >
                  <VProgressCircular indeterminate size="24" width="2.5" color="primary" />
                  <span>{{ t('common.loading') }}</span>
                </div>
                <div
                  v-else-if="detailFailed.has(event.event_id) && !hasDetails(event)"
                  class="activity-empty activity-empty--inline"
                  role="alert"
                >
                  <span>{{ t('subscriptionActivity.detailFailed') }}</span>
                  <VBtn variant="tonal" size="small" @click="loadDetails(event.event_id)">{{ t('common.retry') }}</VBtn>
                </div>
                <template v-else-if="['search', 'refresh'].includes(event.kind)">
                  <p v-if="detailFailed.has(event.event_id)" role="alert" class="activity-muted mb-2">
                    {{ t('subscriptionActivity.detailFailed') }}
                    <VBtn size="small" variant="text" @click="loadDetails(event.event_id)">{{
                      t('common.retry')
                    }}</VBtn>
                  </p>
                  <div class="activity-detail-summary">
                    <h3>
                      <VProgressCircular
                        v-if="detailLoading.has(event.event_id)"
                        size="15"
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
                    <p class="activity-result num">
                      <strong>
                        {{
                          t(`subscriptionActivity.${resultKey(event)}`, {
                            count: event.counts.submitted || event.counts.related || 0,
                          })
                        }}
                      </strong>
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
                  </div>

                  <div class="activity-stages">
                    <div v-for="stage in stages(event)" :key="stage.key" class="activity-stage">
                      <span
                        class="activity-stage-icon"
                        :class="{ 'activity-stage-icon--success': stage.key === 'qualified' }"
                      >
                        <VIcon :icon="stage.icon" size="18" />
                      </span>
                      <div class="activity-stage-body">
                        <span>{{ stage.label }}</span>
                        <strong class="num">
                          {{ stage.value }} <small>{{ t('subscriptionActivity.items') }}</small>
                        </strong>
                      </div>
                    </div>
                  </div>

                  <p v-if="event.counts.initial_submitted !== undefined" class="activity-explanation num mt-3">
                    {{
                      t('subscriptionActivity.downloadSummary', {
                        initial: event.counts.initial_submitted || 0,
                        upgrade: event.counts.upgrade_submitted || 0,
                        full: event.counts.full_upgrade_submitted || 0,
                      })
                    }}
                  </p>

                  <h4 class="num">{{ t('subscriptionActivity.resources', { count: event.counts.related || 0 }) }}</h4>
                  <div class="activity-table-scroll">
                    <table class="activity-table">
                      <thead>
                        <tr>
                          <th>{{ t('subscriptionActivity.resourceName') }}</th>
                          <th>{{ t('subscriptionActivity.resourceSite') }}</th>
                          <th>{{ t('subscriptionActivity.decision') }}</th>
                          <th>{{ t('subscriptionActivity.submissionType') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(resource, index) in event.details.resources || []" :key="index">
                          <td class="activity-table-title">{{ resource.title }}</td>
                          <td class="activity-table-site">
                            {{ resource.site || t('subscriptionActivity.unknownSite') }}
                          </td>
                          <td>
                            <span class="activity-decision-cell">
                              <VIcon
                                :icon="
                                  resource.decision === 'submitted'
                                    ? 'mdi-check-circle-outline'
                                    : resource.decision === 'qualified'
                                      ? 'mdi-check'
                                      : 'mdi-information-outline'
                                "
                                size="16"
                                :class="resource.decision === 'submitted' ? 'activity-success' : 'activity-muted'"
                              />
                              <span>
                                {{ resource.reason || t(`subscriptionActivity.decisionLabel.${resource.decision}`) }}
                              </span>
                            </span>
                          </td>
                          <td>
                            <span v-if="resource.decision === 'submitted'" class="activity-type-pill">
                              {{
                                t(
                                  `subscriptionActivity.downloadType.${subscriptionDownloadKey(resource.subscription_download)}`,
                                )
                              }}
                            </span>
                            <span v-else class="activity-muted">—</span>
                          </td>
                        </tr>
                        <tr v-if="!event.details.resources?.length">
                          <td colspan="4" class="activity-muted">{{ t('subscriptionActivity.noRelatedResources') }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p v-if="event.details.resources_omitted" class="activity-muted num mt-2 mb-0">
                    {{ t('subscriptionActivity.omitted', { count: event.details.resources_omitted }) }}
                  </p>

                  <div v-if="event.details.sites?.length || rules(event).length" class="activity-disclosures">
                    <button
                      v-if="event.details.sites?.length"
                      type="button"
                      class="activity-site-toggle num"
                      :aria-expanded="siteDetails.has(event.event_id)"
                      @click="toggleSites(event.event_id)"
                    >
                      <VIcon icon="mdi-format-list-bulleted" size="17" />
                      <span>{{ t('subscriptionActivity.siteDetails', { count: event.details.sites.length }) }}</span>
                      <VIcon
                        size="18"
                        :icon="siteDetails.has(event.event_id) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                      />
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
                        <template v-for="[field, value] in rules(event)" :key="field">
                          <dt>{{ fieldLabel(field) }}</dt>
                          <dd>{{ valueLabel(value, field) }}</dd>
                        </template>
                      </dl>
                    </details>
                  </div>

                  <ul v-if="siteDetails.has(event.event_id)" class="activity-site-list num">
                    <li v-for="site in event.details.sites" :key="site.id">
                      <span class="activity-site-name">{{ site.name }}</span>
                      <span class="activity-muted">
                        {{ t('subscriptionActivity.siteCandidates', { count: site.candidates }) }}
                      </span>
                      <span>{{ t(`subscriptionActivity.siteStatus.${site.status}`) }}</span>
                    </li>
                  </ul>

                  <p v-if="event.kind === 'refresh'" class="activity-footnote num">
                    {{
                      t('subscriptionActivity.sharedHint', {
                        shared: event.counts.discovered || 0,
                        related: event.counts.related || 0,
                      })
                    }}
                  </p>
                </template>

                <template v-else>
                  <h3>{{ title(event.kind) }}</h3>
                  <p class="activity-explanation mb-0">{{ summary(event) }}</p>
                </template>

                <details v-if="event.details.attempts && event.details.attempts.length > 1" class="activity-rules mt-3">
                  <summary class="num">
                    {{ t('subscriptionActivity.attempts', { count: event.details.attempts.length }) }}
                  </summary>
                  <ol class="activity-attempts num">
                    <li v-for="(attempt, index) in event.details.attempts" :key="index">
                      <strong>
                        {{ time(attempt.started_at) }} · {{ t(`subscriptionActivity.status.${attempt.status}`) }}
                      </strong>
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
                        >
                          <dt>{{ fieldLabel(field) }}</dt>
                          <dd>{{ valueLabel(value, field) }}</dd>
                        </template>
                      </dl>
                    </li>
                  </ol>
                </details>

                <details
                  v-if="!['search', 'refresh'].includes(event.kind) && rules(event).length"
                  class="activity-rules mt-3"
                >
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
                    <template v-for="[field, value] in rules(event)" :key="field">
                      <dt>{{ fieldLabel(field) }}</dt>
                      <dd>{{ valueLabel(value, field) }}</dd>
                    </template>
                  </dl>
                </details>
              </div>
            </article>
          </div>
        </section>

        <div v-if="cursor" class="activity-load-more">
          <VBtn variant="tonal" size="small" :loading="loading" @click="loadEvents(true)">
            {{ t(failed ? 'common.retry' : 'subscriptionActivity.loadMore') }}
          </VBtn>
        </div>
        <p v-if="failed && events.length" class="activity-muted text-center mt-2 mb-0" role="alert">
          {{ t('subscriptionActivity.loadFailed') }}
        </p>
      </div>
      <SubscribeLogDialog v-if="runtimeLogs" :subscription="subscription" @close="runtimeLogs = false" />
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
/* stylelint-disable selector-pseudo-class-no-unknown */

.subscription-activity {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  block-size: 100%;
  color: var(--mp-fg);
  min-block-size: 0;
}

.activity-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  border-block-end: 1px solid var(--mp-border);
  gap: 1.25rem;
  padding-block: 1.125rem;
  padding-inline: 1.5rem;
}

.activity-poster {
  overflow: hidden;
  flex: 0 0 4.75rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  aspect-ratio: 2 / 3;
  background: var(--mp-muted);
  block-size: 7.125rem;
  inline-size: 4.75rem;
}

.activity-poster--empty {
  display: grid;
  color: var(--mp-faint);
  place-items: center;
}

.activity-heading {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.25rem;
}

.activity-eyebrow {
  display: inline-flex;
  align-items: center;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.3rem;
  letter-spacing: 0.02em;
}

.activity-title {
  overflow: hidden;
  margin: 0;
  color: var(--mp-fg);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-subtitle {
  overflow: hidden;
  margin: 0;
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-progress-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-block-start: 0.25rem;
  max-inline-size: 20rem;
}

.activity-progress-label {
  margin: 0;
  color: var(--mp-fg);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.35;
}

.activity-controls {
  display: flex;
  flex: 0 0 21rem;
  flex-direction: column;
  align-self: stretch;
  justify-content: space-between;
  gap: 0.75rem;
  inline-size: 21rem;
}

.activity-top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.activity-close-btn {
  color: var(--mp-muted-fg);
}

.activity-filters {
  display: grid;
  gap: 0.625rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.activity-filters :deep(.v-field) {
  border-radius: var(--app-control-radius);
  font-size: 0.8125rem;
}

.activity-filters :deep(.v-field__prepend-inner) {
  color: var(--mp-muted-fg);
}

.activity-scroll {
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1 1 0%;
  min-block-size: 0;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-block: 1rem 1.5rem;
  padding-inline: 1.5rem;
}

.activity-day + .activity-day {
  margin-block-start: 1.25rem;
}

.activity-date {
  margin: 0 0 0.5rem 0.125rem;
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.4;
}

.activity-day-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-event {
  overflow: hidden;
  flex: 0 0 auto;
  border: 1px solid var(--mp-border);
  border-radius: var(--app-control-radius);
  background: var(--mp-list-group-bg);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.activity-event:hover {
  border-color: color-mix(in srgb, rgb(var(--v-theme-primary)) 26%, var(--mp-border));
}

.activity-event--open {
  border-color: var(--mp-primary-border);
}

.activity-row {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 0.875rem;
  inline-size: 100%;
  min-block-size: 3.5rem;
  text-align: start;
  transition: background-color 0.16s ease;
}

.activity-row:hover {
  background: var(--mp-list-row-hover);
}

.activity-row:focus-visible {
  outline: 2px solid var(--mp-ring);
  outline-offset: -2px;
}

.activity-icon {
  display: grid;
  flex: 0 0 2.25rem;
  border: 1px solid var(--mp-border);
  border-radius: 0.625rem;
  background: var(--mp-muted);
  block-size: 2.25rem;
  color: var(--mp-muted-fg);
  inline-size: 2.25rem;
  place-items: center;
}

.activity-icon--primary {
  border-color: var(--mp-primary-border);
  background: var(--mp-primary-soft);
  color: rgb(var(--v-theme-primary));
}

.activity-icon--info {
  border-color: var(--mp-info-border);
  background: var(--mp-info-soft);
  color: rgb(var(--v-theme-info));
}

.activity-icon--success {
  border-color: var(--mp-success-border);
  background: var(--mp-success-soft);
  color: rgb(var(--v-theme-success));
}

.activity-icon--warning {
  border-color: var(--mp-warning-border);
  background: var(--mp-warning-soft);
  color: rgb(var(--v-theme-warning));
}

.activity-row time {
  flex: 0 0 3rem;
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  font-weight: 600;
}

.activity-action {
  display: flex;
  flex: 0 0 6.5rem;
  flex-direction: column;
  gap: 0.125rem;
  min-inline-size: 0;
}

.activity-action strong {
  color: var(--mp-fg);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
}

.activity-action small {
  color: var(--mp-faint);
  font-size: 0.75rem;
  line-height: 1.25;
}

.activity-status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0.1875rem 0.625rem;
  border: 1px solid var(--mp-border);
  border-radius: 9999px;
  background: var(--mp-muted);
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.3125rem;
  line-height: 1.35;
  white-space: nowrap;
}

.activity-status--warning {
  border-color: var(--mp-warning-border);
  background: var(--mp-warning-soft);
  color: rgb(var(--v-theme-warning));
}

.activity-status--error {
  border-color: var(--mp-destructive-border);
  background: var(--mp-destructive-soft);
  color: rgb(var(--v-theme-error));
}

.activity-status--success {
  border-color: var(--mp-success-border);
  background: var(--mp-success-soft);
  color: rgb(var(--v-theme-success));
}

.activity-summary {
  display: flex;
  min-inline-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
  color: var(--mp-fg);
  font-size: 0.8125rem;
  gap: 0.15rem;
  line-height: 1.45;
}

.activity-summary small {
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
}

.activity-details-label {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.activity-chevron {
  flex-shrink: 0;
  color: var(--mp-faint);
}

.activity-event--open .activity-chevron {
  color: rgb(var(--v-theme-primary));
}

.activity-event--compact .activity-row {
  min-block-size: 3rem;
  padding-block: 0.5625rem;
}

.activity-event--compact .activity-icon {
  flex-basis: 2rem;
  block-size: 2rem;
  inline-size: 2rem;
}

.activity-event--compact .activity-action {
  flex-basis: 7.5rem;
}

.activity-event--compact .activity-summary {
  border-inline-start: 1px solid var(--mp-border);
  color: var(--mp-muted-fg);
  padding-inline-start: 0.875rem;
}

.activity-detail {
  padding: 1rem 1.25rem;
  border-block-start: 1px solid var(--mp-border);
  background: var(--mp-muted);
}

.activity-detail-summary {
  margin-block-end: 0.875rem;
}

.activity-detail h3 {
  display: flex;
  align-items: center;
  margin: 0 0 0.25rem;
  color: var(--mp-fg);
  font-size: 0.9375rem;
  font-weight: 600;
  gap: 0.375rem;
  line-height: 1.4;
}

.activity-detail h4 {
  margin: 1rem 0 0.5rem;
  color: var(--mp-fg);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.4;
}

.activity-result {
  margin: 0 0 0.2rem;
  color: var(--mp-fg);
  font-size: 0.875rem;
}

.activity-explanation {
  margin: 0;
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.activity-stages {
  display: grid;
  gap: 0.625rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.activity-stage {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  padding: 0.6875rem 0.875rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  background: var(--mp-card);
  gap: 0.6875rem;
}

.activity-stage-icon {
  display: grid;
  flex: 0 0 2.125rem;
  border: 1px solid var(--mp-info-border);
  border-radius: 0.5rem;
  background: var(--mp-info-soft);
  block-size: 2.125rem;
  color: rgb(var(--v-theme-info));
  inline-size: 2.125rem;
  place-items: center;
}

.activity-stage-icon--success {
  border-color: var(--mp-success-border);
  background: var(--mp-success-soft);
  color: rgb(var(--v-theme-success));
}

.activity-stage-body {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.125rem;
}

.activity-stage-body > span {
  overflow: hidden;
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-stage-body strong {
  color: var(--mp-fg);
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.2;
}

.activity-stage-body small {
  color: var(--mp-faint);
  font-size: 0.75rem;
  font-weight: 400;
}

.activity-table-scroll {
  overflow-x: auto;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 2px);
  background: var(--mp-card);
}

.activity-table {
  border-collapse: collapse;
  font-size: 0.8125rem;
  inline-size: 100%;
}

.activity-table th {
  border-block-end: 1px solid var(--mp-border);
  background: var(--mp-list-group-bg);
  color: var(--mp-muted-fg);
  font-size: 0.75rem;
  font-weight: 600;
  padding-block: 0.5625rem;
  padding-inline: 0.875rem;
  text-align: start;
  white-space: nowrap;
}

.activity-table td {
  border-block-end: 1px solid var(--mp-list-row-divider);
  color: var(--mp-fg);
  line-height: 1.45;
  padding-block: 0.625rem;
  padding-inline: 0.875rem;
  vertical-align: middle;
}

.activity-table tbody tr:last-child td {
  border-block-end: none;
}

.activity-table-title {
  font-weight: 500;
  inline-size: 44%;
  overflow-wrap: anywhere;
}

.activity-table-site {
  color: var(--mp-muted-fg) !important;
  inline-size: 16%;
}

.activity-decision-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.activity-type-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--mp-primary-border);
  border-radius: 9999px;
  background: var(--mp-primary-soft);
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

.activity-disclosures {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.625rem;
  margin-block-start: 0.75rem;
}

.activity-site-toggle {
  display: inline-flex;
  align-items: center;
  padding: 0.4375rem 0.75rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 4px);
  background: var(--mp-card);
  color: var(--mp-fg);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  gap: 0.4375rem;
  text-align: start;
  transition: background-color 0.15s ease;
}

.activity-site-toggle:hover {
  background: var(--mp-list-row-hover);
}

.activity-site-toggle:focus-visible {
  outline: 2px solid var(--mp-ring);
  outline-offset: -2px;
}

.activity-rules {
  padding: 0.4375rem 0.75rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 4px);
  background: var(--mp-card);
  color: var(--mp-muted-fg);
  font-size: 0.8125rem;
}

.activity-rules summary {
  color: var(--mp-fg);
  cursor: pointer;
  font-weight: 500;
  user-select: none;
}

.activity-rules dl {
  display: grid;
  margin: 0.5rem 0 0;
  padding-block-start: 0.5rem;
  border-block-start: 1px solid var(--mp-border-subtle);
  gap: 0.375rem 0.875rem;
  grid-template-columns: minmax(5.5rem, 8.5rem) minmax(0, 1fr);
}

.activity-rules dt {
  color: var(--mp-muted-fg);
}

.activity-rules dd {
  margin: 0;
  color: var(--mp-fg);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.activity-site-list {
  display: grid;
  margin: 0.5rem 0 0;
  padding: 0.375rem 0.875rem;
  border: 1px solid var(--mp-border);
  border-radius: calc(var(--app-control-radius) - 4px);
  background: var(--mp-card);
  list-style: none;
}

.activity-site-list li {
  display: flex;
  align-items: center;
  padding: 0.4375rem 0;
  border-block-end: 1px solid var(--mp-list-row-divider);
  font-size: 0.8125rem;
  gap: 1rem;
}

.activity-site-name {
  flex: 1 1 auto;
  color: var(--mp-fg);
  font-weight: 500;
}

.activity-attempts {
  margin: 0.5rem 0 0;
  padding-inline-start: 1.25rem;
}

.activity-attempts li + li {
  margin-block-start: 0.625rem;
}

.activity-site-list li:last-child {
  border-block-end: none;
}

.activity-attempts p {
  margin: 0.2rem 0;
}

.activity-footnote {
  margin: 0.75rem 0 0;
  color: var(--mp-faint);
  font-size: 0.75rem;
}

.activity-muted {
  color: var(--mp-muted-fg);
}

.activity-success {
  color: rgb(var(--v-theme-success));
}

.activity-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--mp-muted-fg);
  font-size: 0.875rem;
  gap: 0.75rem;
  min-block-size: 16rem;
  text-align: center;
}

.activity-empty strong {
  color: var(--mp-fg);
  font-size: 0.9375rem;
  font-weight: 600;
}

.activity-empty--inline {
  min-block-size: 6rem;
}

.activity-load-more {
  padding-block: 1rem 0.25rem;
  text-align: center;
}

@media (width <= 1200px) {
  .activity-details-label {
    display: none;
  }

  .activity-controls {
    flex-basis: 18.5rem;
    inline-size: 18.5rem;
  }

  .activity-stages {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (width < 960px) {
  :global(.v-dialog.v-dialog--fullscreen > .v-overlay__content.subscription-activity-content) {
    overflow: hidden;
  }

  .subscription-activity {
    block-size: 100%;
    max-block-size: 100%;
    min-block-size: 0;
  }

  .activity-header {
    position: relative;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 0.875rem calc(1rem + env(safe-area-inset-right, 0px)) 0.875rem calc(1rem + env(safe-area-inset-left, 0px));
  }

  .activity-poster {
    flex-basis: 3.75rem;
    block-size: 5.625rem;
    inline-size: 3.75rem;
  }

  .activity-heading {
    padding-inline-end: 2.25rem;
  }

  .activity-title {
    font-size: 1.0625rem;
  }

  .activity-subtitle,
  .activity-progress-label {
    font-size: 0.75rem;
  }

  .activity-controls {
    flex-basis: 100%;
    gap: 0.5rem;
    inline-size: 100%;
  }

  .activity-top-actions {
    justify-content: flex-start;
  }

  .activity-close-btn {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-end: calc(0.5rem + env(safe-area-inset-right, 0px));
  }

  .activity-filters {
    gap: 0.5rem;
  }

  .activity-scroll {
    padding: 0.875rem calc(1rem + env(safe-area-inset-right, 0px)) 1.25rem calc(1rem + env(safe-area-inset-left, 0px));
  }

  .activity-row {
    flex-wrap: wrap;
    padding: 0.75rem;
    gap: 0.625rem;
  }

  .activity-icon {
    flex-basis: 2rem;
    block-size: 2rem;
    inline-size: 2rem;
  }

  .activity-row time {
    flex-basis: auto;
    font-size: 0.75rem;
  }

  .activity-action {
    flex: 1 1 auto;
  }

  .activity-status {
    padding: 0.125rem 0.5rem;
    font-size: 0.6875rem;
  }

  .activity-summary {
    order: 5;
    flex: 0 0 calc(100% - 1.75rem);
    font-size: 0.78rem;
    padding-inline-start: 0;
  }

  .activity-event--compact .activity-summary {
    border-inline-start: none;
    padding-inline-start: 0;
  }

  .activity-chevron {
    order: 6;
    margin-inline-start: auto;
  }

  .activity-detail {
    padding: 0.875rem;
  }

  .activity-stages {
    gap: 0.5rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .activity-stage {
    padding: 0.5625rem 0.6875rem;
    gap: 0.5rem;
  }

  .activity-stage-body strong {
    font-size: 1rem;
  }

  .activity-table thead {
    position: absolute;
    overflow: hidden;
    block-size: 1px;
    clip-path: inset(50%);
    inline-size: 1px;
  }

  .activity-table tr {
    display: grid;
    padding: 0.625rem 0.75rem;
    border-block-end: 1px solid var(--mp-list-row-divider);
    gap: 0.25rem;
    grid-template-columns: 1fr;
  }

  .activity-table tbody tr:last-child {
    border-block-end: none;
  }

  .activity-table td {
    padding: 0 !important;
    border: 0 !important;
    inline-size: auto !important;
  }

  .activity-disclosures {
    flex-direction: column;
    align-items: stretch;
  }

  .activity-site-toggle,
  .activity-rules {
    inline-size: 100%;
  }
}
</style>
