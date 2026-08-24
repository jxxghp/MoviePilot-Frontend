import SendMessageAction from '@/components/workflow/SendMessageAction.vue'
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
  return renderWithProviders(SendMessageAction, {
    props: {
      id: 'send-message',
      data: { client: [], userid: '' },
    },
    initialState,
    global: { stubs: workflowActionStubs },
  })
}

describe('SendMessageAction', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('does not request admin notification channels for regular users', async () => {
    const { container } = await renderAction()

    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(getSelectItems(container, '渠道')).toEqual([])
  })

  it('maps unwrapped admin notification channels to name options', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      message: '',
      data: {
        value: [
          { name: 'Telegram', type: 'telegram', enabled: true },
          { name: '企业微信', type: 'wechat', enabled: false },
        ],
      },
    })

    const { container } = await renderAction({ user: { superUser: true } })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/Notifications'))
    expect(getSelectItems(container, '渠道')).toEqual([
      { title: 'Telegram', value: 'Telegram' },
      { title: '企业微信', value: '企业微信' },
    ])
  })

  it('keeps notification options empty when loading fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValue(new Error('notifications unavailable'))

    const { container } = await renderAction({ user: { superUser: true } })

    await waitFor(() => expect(consoleLog).toHaveBeenCalled())
    expect(getSelectItems(container, '渠道')).toEqual([])
  })
})
