import ScanFileAction from '@/components/workflow/ScanFileAction.vue'
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
  return renderWithProviders(ScanFileAction, {
    props: {
      id: 'scan-file',
      data: { storage: '', directory: '' },
    },
    global: { stubs: workflowActionStubs },
  })
}

describe('ScanFileAction', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('maps unwrapped storage names and types to options', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      message: '',
      data: {
        value: [
          { name: '本地存储', type: 'local' },
          { name: '阿里云盘', type: 'alipan' },
        ],
      },
    })

    const { container } = await renderAction()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/public/Storages'))
    expect(getSelectItems(container, '存储')).toEqual([
      { title: '本地存储', value: 'local' },
      { title: '阿里云盘', value: 'alipan' },
    ])
  })
})
