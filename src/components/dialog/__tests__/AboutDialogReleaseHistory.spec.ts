import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import AboutDialog from '@/components/dialog/AboutDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, within } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/api', () => ({ default: { get: mocks.apiGet } }))
vi.mock('@/composables/useVersionChecker', () => ({ clearCacheAndReload: vi.fn() }))

const DialogStub = defineComponent({
  /** 展开弹窗内容，使用生产组件验证版本列表与操作。 */
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

/** 返回带固定发布时间的版本记录，便于复现主程序与工具交错发布。 */
function release(tag: string) {
  return { tag_name: tag, published_at: '2026-10-11T00:00:00Z', body: `${tag} release notes` }
}

/** 使用旧后端返回的混合 Release 列表挂载关于弹窗。 */
async function renderReleaseHistory(releases: unknown[]) {
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === 'system/env') return Promise.resolve({ VERSION: 'v3.1.2-1' })
    if (path === 'system/versions') return Promise.resolve(releases)
    if (path === 'dashboard/processes') return Promise.resolve([])
    if (path === 'site/supporting') return Promise.resolve({})
    return Promise.reject(new Error(`Unexpected API path: ${path}`))
  })
  return renderWithProviders(AboutDialog, {
    global: {
      components: { VDialogCloseBtn: DialogCloseBtn },
      stubs: { VDialog: DialogStub },
    },
  })
}

describe('AboutDialog application release history', () => {
  it('hides standalone tools and keeps normal versions, rebuilds and their changelogs', async () => {
    await renderReleaseHistory([
      release('site-adapter-collector-v1.0.3'),
      release('v3.1.4'),
      release('site-adapter-collector-v1.0.2'),
      release('site-adapter-collector-v1.0.1'),
      release('v3.1.3'),
      release('v3.1.2-1'),
      release('v3.1.2'),
      release('v2.15.3'),
      release('other-tool-v4.0.0'),
    ])

    const latestVersion = await screen.findByText('v3.1.4', { selector: 'span.text-lg' })
    expect(screen.getByText('v3.1.3')).toBeInTheDocument()
    expect(screen.getByText('v3.1.2')).toBeInTheDocument()
    expect(screen.getByText('v2.15.3')).toBeInTheDocument()
    expect(screen.queryByText(/site-adapter-collector/)).not.toBeInTheDocument()
    expect(screen.queryByText('other-tool-v4.0.0')).not.toBeInTheDocument()

    const latestCard = latestVersion.closest('div.mb-3') as HTMLElement
    expect(within(latestCard).getByText('最新软件版本')).toBeInTheDocument()
    const currentBadge = screen.getByText('当前版本')
    expect(currentBadge.closest('div.mb-3')).toHaveTextContent('v3.1.2-1')

    await fireEvent.click(within(latestCard).getByRole('button', { name: '查看变更日志' }))
    expect(await screen.findByText('v3.1.4 release notes')).toBeInTheDocument()
  })

  it('shows no history or latest badge when only unrelated or malformed tags exist', async () => {
    const { container } = await renderReleaseHistory([
      release('site-adapter-collector-v1.0.3'),
      release('v3.1.4-beta'),
      release('version3.1.4'),
      { tag_name: null },
      {},
    ])
    await screen.findByText('v3.1.2-1')
    expect(container.querySelector('div.mb-3')).toBeNull()
    expect(screen.queryByText('最新软件版本')).not.toBeInTheDocument()
    expect(screen.queryByText(/site-adapter-collector/)).not.toBeInTheDocument()
  })
})
