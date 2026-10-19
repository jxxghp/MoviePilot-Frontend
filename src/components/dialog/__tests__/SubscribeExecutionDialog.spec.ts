import SubscribeExecutionDialog from '@/components/dialog/SubscribeExecutionDialog.vue'
import type { SubscriptionExecutionStatus } from '@/api/types'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('@/router', () => ({ default: { push: (...args: unknown[]) => mocks.routerPush(...args) } }))

/** 使用真实 Vuetify 弹窗和权限状态检查可见信息与动作。 */
async function renderDetails(
  execution: Partial<SubscriptionExecutionStatus>,
  permissions = { manage: true, features: { 'manage.site': true } },
) {
  return renderWithProviders(SubscribeExecutionDialog, {
    initialState: { user: { permissions } },
    props: {
      canRetry: true,
      execution: { phase: 'waiting_site_budget', state: 'waiting_site_budget', ...execution },
      name: '测试订阅',
    },
  })
}

describe('SubscribeExecutionDialog', () => {
  it('shows a local resume estimate, then acknowledges the due time without claiming it has resumed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-09T12:00:00+08:00'))
    try {
      const { unmount } = await renderDetails({ next_run_at: '2026-09-09T12:00:02+08:00' })
      expect(screen.getByText(/预计 .* 自动继续（本地时间）/)).toBeVisible()
      expect(screen.queryByRole('button', { name: '重新搜索' })).not.toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(3000)
      expect(screen.getByText('已到预计时间，正在等待自动继续。')).toBeVisible()
      expect(screen.getByText('稍后继续')).toBeInTheDocument()
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('folds failure details while exposing retry and the permitted site manager', async () => {
    const { emitted } = await renderDetails({ phase: 'failed', state: 'failed', error: '站点测试错误' })
    const detail = screen.getByText('站点测试错误')
    expect(detail).not.toBeVisible()
    const disclosure = screen.getByText('查看失败详情').closest('details')
    expect(disclosure).not.toHaveAttribute('open')
    disclosure?.setAttribute('open', '')
    expect(detail).toBeVisible()
    await fireEvent.click(screen.getByRole('button', { name: '重新搜索' }))
    expect(emitted('retry')).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: '检查站点' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/site')
    expect(emitted('close')).toHaveLength(1)
  })

  it.each([
    { manage: false, features: { 'manage.site': true } },
    { manage: true, features: { 'manage.site': false } },
  ])('hides the site manager when its category or feature permission is absent: %j', async permissions => {
    await renderDetails({ phase: 'failed', state: 'failed' }, permissions)
    expect(screen.queryByRole('button', { name: '检查站点' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新搜索' })).toBeInTheDocument()
  })

  it('does not revive an old waiting error or resume estimate once searching continues', async () => {
    await renderDetails({
      error: '此前站点暂时繁忙',
      next_run_at: '2026-09-09T12:00:00+08:00',
      phase: 'searching',
      state: 'searching',
    })
    expect(screen.getByText('搜索中')).toBeInTheDocument()
    expect(screen.queryByText('此前站点暂时繁忙')).not.toBeInTheDocument()
    expect(screen.queryByText(/预计时间/)).not.toBeInTheDocument()
  })
})

it('shows batch download counts and bounded receipts', async () => {
  await renderWithProviders(SubscribeExecutionDialog, {
    props: {
      execution: {
        state: 'completed',
        phase: 'completed',
        download_counts: { initial_submitted: 1, upgrade_submitted: 1, full_upgrade_submitted: 1 },
        downloads: [
          {
            title: 'Demo.S01',
            site: 'Site',
            decision: 'submitted',
            subscription_id: 17,
            task_id: 'task',
            subscription_download: {
              subscription_id: 17,
              submission_type: 'upgrade',
              best_version_full: true,
              initial_episodes: [2],
              upgrade_episodes: [1],
            },
          },
        ],
        downloads_omitted: 1,
      },
    },
  })
  expect(screen.getByText('首次订阅 1 项 · 洗版 1 项（其中全集洗版 1 项）')).toBeVisible()
  expect(screen.getByText('全集洗版')).toBeVisible()
  expect(screen.getByText('Demo.S01')).toBeVisible()
})
