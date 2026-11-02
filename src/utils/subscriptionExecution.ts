/**
 * 订阅搜索状态在卡片、批次横幅和详情中的统一展示词。
 *
 * 后端阶段比用户需要区分的多：内部准备、秒级站点间隔、排队原因都归并成用户能据此行动的少数几种；
 * 跳过不展示，只有站点要等较久时才给出继续时间。
 */
export type SubscriptionExecutionLabel =
  'queued' | 'searching' | 'waiting' | 'submitting' | 'submitted' | 'noResult' | 'failed' | 'cancelling' | 'cancelled'

/** 展示所需的执行状态字段，订阅状态与批次状态都满足。 */
export interface SubscriptionExecutionLike {
  /** 后端业务状态 */
  state: string
  /** 后端执行阶段 */
  phase: string
  /** 等待站点时的下次继续时间，只有单个订阅状态会返回 */
  next_run_at?: string
  /** 单个订阅本次已添加的下载数量 */
  submitted_count?: number
  /** 批次成功提交分类计数，submitted 为总数 */
  download_counts?: Record<string, number>
}

/** 站点等待超过该时长才提示继续时间；更短的等待属于正常搜索节奏，显示为搜索中。 */
export const VISIBLE_WAIT_MS = 120_000

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'skipped'])
const STAGE_LABELS: Record<string, SubscriptionExecutionLabel> = {
  queued: 'queued',
  scheduled: 'queued',
  waiting_subscription: 'queued',
  running: 'searching',
  matching: 'searching',
  searching: 'searching',
  waiting_site_budget: 'searching',
  preparing: 'submitting',
  submitting: 'submitting',
  failed: 'failed',
  cancelling: 'cancelling',
  cancelled: 'cancelled',
}

/** 终态以 state 为准，进行中以 phase 为准，避免残留阶段把已结束任务显示成进行中。 */
export function subscriptionExecutionStage(execution: SubscriptionExecutionLike) {
  return TERMINAL_STATES.has(execution.state) ? execution.state : execution.phase || execution.state
}

/** 站点要等待超过 {@link VISIBLE_WAIT_MS} 时返回继续时间戳，否则返回 null。 */
export function subscriptionExecutionResumeAt(execution: SubscriptionExecutionLike, now: number) {
  if (subscriptionExecutionStage(execution) !== 'waiting_site_budget' || !execution.next_run_at) return null
  const resumeAt = Date.parse(execution.next_run_at)
  return Number.isFinite(resumeAt) && resumeAt - now > VISIBLE_WAIT_MS ? resumeAt : null
}

/** 返回用户可见的展示词；跳过的任务没有可行动信息，返回 null 不展示。 */
export function subscriptionExecutionLabel(
  execution: SubscriptionExecutionLike,
  now: number,
): SubscriptionExecutionLabel | null {
  const stage = subscriptionExecutionStage(execution)
  if (stage === 'skipped') return null
  if (stage === 'completed') {
    const submitted = execution.submitted_count ?? execution.download_counts?.submitted ?? 0
    return submitted > 0 ? 'submitted' : 'noResult'
  }
  if (subscriptionExecutionResumeAt(execution, now) !== null) return 'waiting'
  return STAGE_LABELS[stage] || 'searching'
}

/** 继续时间只显示本地时分，保持卡片状态紧凑。 */
export function formatSubscriptionResumeTime(resumeAt: number, locale: string) {
  return new Date(resumeAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false })
}
