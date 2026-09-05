import FilterTorrentsAction from '@/components/workflow/FilterTorrentsAction.vue'
import { waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSelectItems, workflowActionStubs } from './workflowActionTestUtils'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

async function renderAction(initialState: Record<string, Record<string, unknown>> = {}) {
  return renderWithProviders(FilterTorrentsAction, {
    props: {
      id: 'filter-torrents',
      data: { rule_groups: [] },
    },
    initialState,
    global: { stubs: workflowActionStubs },
  })
}

describe('FilterTorrentsAction', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('loads filter groups for regular users through the active-user endpoint', async () => {
    mocks.apiGet.mockResolvedValue({ rule_groups: [{ name: '普通用户规则' }] })
    const { container } = await renderAction()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('rule/groups', { params: { include_usage: false } }))
    expect(getSelectItems(container, '过滤规则组')).toEqual([{ title: '普通用户规则', value: '普通用户规则' }])
  })

  it('maps structured filter groups to name options', async () => {
    mocks.apiGet.mockResolvedValue({
      rule_groups: [{ name: '高清规则' }, { name: '字幕规则' }],
    })

    const { container } = await renderAction({ user: { superUser: true } })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('rule/groups', { params: { include_usage: false } }))
    expect(getSelectItems(container, '过滤规则组')).toEqual([
      { title: '高清规则', value: '高清规则' },
      { title: '字幕规则', value: '字幕规则' },
    ])
  })

  it('keeps filter group options empty when loading fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValue(new Error('rule groups unavailable'))

    const { container } = await renderAction({ user: { superUser: true } })

    await waitFor(() => expect(consoleLog).toHaveBeenCalled())
    expect(getSelectItems(container, '过滤规则组')).toEqual([])
  })
})
