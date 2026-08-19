import type { ScheduleInfo, ScheduleProgress } from '@/api/types'
import {
  getScheduleName,
  getScheduleNextRunText,
  getScheduleProvider,
  getScheduleStatusText,
  isScheduleRunning,
  isScheduleWaiting,
  useScheduleProgress,
} from '@/composables/useScheduleProgress'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  useDataRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: mocks.useDataRefresh,
  }),
}))

function createSchedule(overrides: Partial<ScheduleInfo> = {}): ScheduleInfo {
  return {
    id: 'schedule-1',
    name: '原始名称',
    provider: '原始提供者',
    status: '空闲',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.apiGet.mockReset()
  mocks.useDataRefresh.mockReset()
})

describe('schedule display helpers', () => {
  it.each([
    ['列表状态', { status: '正在运行' }],
    ['列表进度开关', { progress_enable: true }],
    ['进度详情开关', { progress_detail: { enable: true } }],
    ['进度详情状态', { progress_detail: { status: 'running' } }],
  ] satisfies Array<[string, Partial<ScheduleInfo>]>)('recognizes the running signal from %s', (_label, overrides) => {
    expect(isScheduleRunning(createSchedule(overrides))).toBe(true)
  })

  it('recognizes waiting only when no running signal is active', () => {
    expect(isScheduleWaiting(createSchedule({ status: '等待' }))).toBe(true)
    expect(isScheduleWaiting(createSchedule({ progress_enable: true, status: '等待' }))).toBe(false)
    expect(isScheduleWaiting(createSchedule({ status: '空闲' }))).toBe(false)
  })

  it('prefers localized display fields and falls back to their raw values', () => {
    const localized = createSchedule({
      name_i18n: '本地化名称',
      next_run: 'raw next run',
      next_run_i18n: '本地化下次运行',
      provider_i18n: '本地化提供者',
      status_i18n: '本地化状态',
    })
    const raw = createSchedule({ next_run: 'raw next run' })

    expect([
      getScheduleName(localized),
      getScheduleProvider(localized),
      getScheduleStatusText(localized),
      getScheduleNextRunText(localized),
    ]).toEqual(['本地化名称', '本地化提供者', '本地化状态', '本地化下次运行'])
    expect([
      getScheduleName(raw),
      getScheduleProvider(raw),
      getScheduleStatusText(raw),
      getScheduleNextRunText(raw),
    ]).toEqual(['原始名称', '原始提供者', '空闲', 'raw next run'])
  })
})

describe('schedule progress refresh', () => {
  it('registers the requested refresh identity, callback, interval, and immediate mode', () => {
    const progress = useScheduleProgress(ref([]), 'dashboard-schedule-progress')

    expect(mocks.useDataRefresh).toHaveBeenCalledOnce()
    expect(mocks.useDataRefresh).toHaveBeenCalledWith(
      'dashboard-schedule-progress',
      progress.refreshRunningProgress,
      1000,
      true,
    )
  })

  it('requests only running schedules and keeps fulfilled results when a sibling request fails', async () => {
    const runningByStatus = createSchedule({ id: 'status-running', progress: 5, status: '正在运行' })
    const runningByDetail = createSchedule({
      id: 'detail-running',
      progress: 15,
      progress_detail: { status: 'running' },
    })
    const waiting = createSchedule({ id: 'waiting', status: '等待' })
    const idle = createSchedule({ id: 'idle' })
    const schedules = ref([runningByStatus, runningByDetail, waiting, idle])
    const progress = useScheduleProgress(schedules, 'focused-refresh')

    mocks.apiGet.mockImplementation((path: string) => {
      if (path.includes('status-running')) return Promise.resolve({ text: '已完成一半', value: 50 })
      return Promise.reject(new Error('detail progress unavailable'))
    })

    await expect(progress.refreshRunningProgress()).resolves.toBeUndefined()

    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/schedule/status-running/progress', { feedback: 'silent' })
    expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/schedule/detail-running/progress', { feedback: 'silent' })
    expect(progress.getScheduleProgressValue(runningByStatus)).toBe(50)
    expect(progress.getScheduleProgressText(runningByStatus)).toBe('已完成一半')
    expect(progress.getScheduleProgressValue(runningByDetail)).toBe(15)
  })

  it('discards a late response when its schedule stops while the request is pending', async () => {
    const request = deferred<ScheduleProgress>()
    const running = createSchedule({ id: 'late-result', progress: 7, progress_text: '列表进度', status: '正在运行' })
    const schedules = ref([running])
    const progress = useScheduleProgress(schedules, 'late-result-refresh')
    mocks.apiGet.mockReturnValueOnce(request.promise)

    const refresh = progress.refreshRunningProgress()
    schedules.value = [createSchedule({ id: 'late-result', progress: 7, progress_text: '列表进度' })]
    request.resolve({ text: '迟到结果', value: 88 })
    await refresh

    expect(progress.getScheduleProgressValue(schedules.value[0])).toBe(7)
    expect(progress.getScheduleProgressText(schedules.value[0])).toBe('列表进度')
  })

  it('removes cached progress for schedules that have stopped', async () => {
    const first = createSchedule({ id: 'first', progress: 1, progress_text: '第一项列表进度', status: '正在运行' })
    const stopped = createSchedule({ id: 'stopped', progress: 2, progress_text: '停止后列表进度', status: '正在运行' })
    const schedules = ref([first, stopped])
    const progress = useScheduleProgress(schedules, 'cache-cleanup-refresh')
    mocks.apiGet.mockResolvedValueOnce({ text: '第一项远端进度', value: 30 }).mockResolvedValueOnce({
      text: '即将过期的远端进度',
      value: 60,
    })

    await progress.refreshRunningProgress()
    expect(progress.getScheduleProgressText(stopped)).toBe('即将过期的远端进度')

    const stoppedNow = createSchedule({ id: 'stopped', progress: 2, progress_text: '停止后列表进度' })
    schedules.value = [first, stoppedNow]
    mocks.apiGet.mockResolvedValueOnce({ text: '第一项更新进度', value: 40 })
    await progress.refreshRunningProgress()

    expect(progress.getScheduleProgressValue(stoppedNow)).toBe(2)
    expect(progress.getScheduleProgressText(stoppedNow)).toBe('停止后列表进度')
  })
})

describe('schedule progress presentation', () => {
  it('clamps list and refreshed progress values to the 0..100 range', async () => {
    const belowRange = createSchedule({ id: 'below-range', progress: -20 })
    const aboveRange = createSchedule({ id: 'above-range', progress: 140, status: '正在运行' })
    const schedules = ref([belowRange, aboveRange])
    const progress = useScheduleProgress(schedules, 'clamp-refresh')

    expect(progress.getScheduleProgressValue(belowRange)).toBe(0)
    expect(progress.getScheduleProgressValue(aboveRange)).toBe(100)

    mocks.apiGet.mockResolvedValueOnce({ value: -1 })
    await progress.refreshRunningProgress()
    expect(progress.getScheduleProgressValue(aboveRange)).toBe(0)

    mocks.apiGet.mockResolvedValueOnce({ value: 101 })
    await progress.refreshRunningProgress()
    expect(progress.getScheduleProgressValue(aboveRange)).toBe(100)
  })

  it('uses localized progress text first and falls back through remote and schedule text', async () => {
    const localizedRemote = createSchedule({ id: 'localized-remote', status: '正在运行' })
    const rawRemote = createSchedule({ id: 'raw-remote', status: '正在运行' })
    const localizedSchedule = createSchedule({
      id: 'localized-schedule',
      progress_text: '原始列表进度',
      progress_text_i18n: '本地化列表进度',
      status: '正在运行',
    })
    const rawSchedule = createSchedule({ id: 'raw-schedule', progress_text: '原始列表进度', status: '正在运行' })
    const empty = createSchedule({ id: 'empty', status: '正在运行' })
    const schedules = ref([localizedRemote, rawRemote, localizedSchedule, rawSchedule, empty])
    const progress = useScheduleProgress(schedules, 'text-fallback-refresh')
    mocks.apiGet
      .mockResolvedValueOnce({ text: '原始远端进度', text_i18n: '本地化远端进度' })
      .mockResolvedValueOnce({ text: '原始远端进度' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)

    await progress.refreshRunningProgress()

    expect(progress.getScheduleProgressText(localizedRemote)).toBe('本地化远端进度')
    expect(progress.getScheduleProgressText(rawRemote)).toBe('原始远端进度')
    expect(progress.getScheduleProgressText(localizedSchedule)).toBe('本地化列表进度')
    expect(progress.getScheduleProgressText(rawSchedule)).toBe('原始列表进度')
    expect(progress.getScheduleProgressText(empty)).toBe('')
  })
})
