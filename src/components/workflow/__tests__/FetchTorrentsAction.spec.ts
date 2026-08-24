import FetchTorrentsAction from '@/components/workflow/FetchTorrentsAction.vue'
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

async function renderAction() {
  return renderWithProviders(FetchTorrentsAction, {
    props: {
      id: 'fetch-torrents',
      data: { search_type: 'media', sites: [] },
    },
    global: { stubs: workflowActionStubs },
  })
}

describe('FetchTorrentsAction', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('keeps active sites and maps their names and ids to options', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      message: '',
      data: [
        { id: 1, name: '启用站点', is_active: true },
        { id: 2, name: '停用站点', is_active: false },
      ],
    })

    const { container } = await renderAction()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('site/rss'))
    expect(getSelectItems(container, '站点')).toEqual([{ title: '启用站点', value: 1 }])
  })

  it('keeps site options empty when loading fails', async () => {
    const error = new Error('site list unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValue(error)

    const { container } = await renderAction()

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(getSelectItems(container, '站点')).toEqual([])
  })
})
