import FetchMediasAction from '@/components/workflow/FetchMediasAction.vue'
import { waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { expect, it, vi } from 'vitest'
import { workflowActionStubs } from './workflowActionTestUtils'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))
vi.mock('@/api', () => ({ default: createDataApiMock({ get: mocks.apiGet }) }))

it('异步榜单返回后立即更新已渲染的来源选项', async () => {
  let resolve!: (value: unknown) => void
  mocks.apiGet.mockImplementation(
    () =>
      new Promise(done => {
        resolve = done
      }),
  )
  const { container } = await renderWithProviders(FetchMediasAction, {
    props: { id: 'medias', data: { source_type: 'ranking', sources: [] } },
    global: { stubs: workflowActionStubs },
  })
  expect(container.textContent).not.toContain('插件榜单')
  resolve({ success: true, data: [{ name: '插件榜单', api_path: 'plugin/example/ranking' }] })
  await waitFor(() => {
    const options = [...container.querySelectorAll<HTMLElement>('[data-select-items]')].flatMap(element =>
      JSON.parse(element.dataset.selectItems || '[]'),
    )
    expect(options).toContainEqual({ title: '插件榜单', value: 'plugin/example/ranking' })
  })
})
