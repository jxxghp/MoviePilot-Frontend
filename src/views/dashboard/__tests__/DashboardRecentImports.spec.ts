import DashboardRecentImports from '@/views/dashboard/DashboardRecentImports.vue'
import noImage from '@images/no-image.jpeg'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  formatDateDifference: vi.fn((date: string) => `relative:${date}`),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

vi.mock('@core/utils/formatters', async importOriginal => {
  const actual = await importOriginal<typeof import('@core/utils/formatters')>()

  return {
    ...actual,
    formatDateDifference: (...args: [string]) => mocks.formatDateDifference(...args),
  }
})

const ImageStub = defineComponent({
  name: 'VImg',
  inheritAttrs: false,
  props: { alt: String, src: String },
  setup(props) {
    return () => h('img', { alt: props.alt, src: props.src })
  },
})

const KeepAliveHarness = defineComponent({
  components: { DashboardRecentImports },
  setup() {
    const active = ref(true)

    return { active }
  },
  template: `
    <button type="button" @click="active = false">停用最近入库</button>
    <button type="button" @click="active = true">启用最近入库</button>
    <KeepAlive><DashboardRecentImports v-if="active" /></KeepAlive>
  `,
})

function renderRecentImports(component = DashboardRecentImports) {
  return renderWithProviders(component, {
    global: { stubs: { VImg: ImageStub } },
  })
}

describe('dashboard recent imports', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.formatDateDifference.mockClear()
  })

  it('loads five successful records once on an ordinary mount', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [{ id: 1, title: '异步入库记录' }],
      },
    })

    const { container } = await renderRecentImports()

    const renderedItem = await screen.findByText('异步入库记录')
    expect(container.querySelector('[data-layout-size-source]')).toContainElement(renderedItem)
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.apiGet).toHaveBeenCalledWith('history/transfer', {
      params: { page: 1, count: 5, status: true },
    })
  })

  it.each([
    ['empty', []],
    ['null', null],
  ])('shows the empty state when the response list is %s', async (_label, list) => {
    mocks.apiGet.mockResolvedValue({ data: { list } })

    const { container } = await renderRecentImports()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())
    expect(screen.getByText('暂无近期整理记录')).toBeInTheDocument()
    expect(container.querySelector('[data-layout-size-source]')).not.toBeInTheDocument()
  })

  it('uses the image proxy for posters and the local fallback when no poster exists', async () => {
    const remotePoster = 'https://example.com/poster image.jpg?size=large&lang=zh'
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [
          { id: 1, image: remotePoster, title: '远端海报' },
          { id: 2, title: '默认海报' },
        ],
      },
    })

    await renderRecentImports()

    expect(await screen.findByRole('img', { name: '远端海报' })).toHaveAttribute(
      'src',
      `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodeURIComponent(remotePoster)}`,
    )
    expect(screen.getByRole('img', { name: '默认海报' })).toHaveAttribute('src', noImage)
  })

  it('renders the year, relative date and available transfer metadata', async () => {
    const transferDate = '2026-08-19T07:30:00Z'
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [
          {
            id: 1,
            date: transferDate,
            episodes: 'E03',
            seasons: 'S01',
            src_fileitem: { size: 1536 },
            title: '测试剧集',
            type: '电视剧',
            year: '2025',
          },
        ],
      },
    })

    await renderRecentImports()

    expect(await screen.findByText('测试剧集')).toHaveTextContent('测试剧集 (2025)')
    expect(screen.getByText('电视剧 · S01 · E03 · 1.50 KB')).toBeInTheDocument()
    expect(screen.getByText(`relative:${transferDate}`)).toBeInTheDocument()
    expect(mocks.formatDateDifference).toHaveBeenCalledWith(transferDate)
  })

  it('shows normalized audio specs for recent music imports', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [
          {
            id: 2,
            title: '晴天',
            type: '音乐',
            audio_format: 'FLAC',
            bit_depth: 24,
            sample_rate: 96_000,
            bitrate: 2_304_000,
          },
        ],
      },
    })

    await renderRecentImports()

    expect(await screen.findByText(/FLAC · 24-bit · 96 kHz · 2,304 kbps/)).toBeInTheDocument()
  })

  it('keeps the empty state when the request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValue(new Error('remote unavailable'))

    const { container } = await renderRecentImports()

    await waitFor(() => expect(consoleError).toHaveBeenCalledOnce())
    expect(screen.getByText('暂无近期整理记录')).toBeInTheDocument()
    expect(container.querySelector('[data-layout-size-source]')).not.toBeInTheDocument()
  })

  it('loads once initially and refreshes once after KeepAlive reactivation', async () => {
    mocks.apiGet.mockResolvedValue({ data: { list: [] } })

    await renderRecentImports(KeepAliveHarness)

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByRole('button', { name: '停用最近入库' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用最近入库' }))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
  })
})
