import SubscribeShareStatisticsDialog from '@/components/dialog/SubscribeShareStatisticsDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribeShareStatistics } from '@tests/support/factories/subscribe'
import { subscribeShareStatisticsHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, '关闭')
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  setup() {
    return () => h('div', { role: 'status' }, '加载中')
  },
})

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog() {
  const close = vi.fn()
  const result = await renderWithProviders(SubscribeShareStatisticsDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
      stubs: {
        LoadingBanner: LoadingBannerStub,
      },
    },
    props: {
      modelValue: true,
      onClose: close,
    },
  })
  return { ...result, close }
}

describe('SubscribeShareStatisticsDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows loading until statistics arrive', async () => {
    const deferred = createDeferred()
    const requested = vi.fn(() => deferred.promise)
    server.use(
      subscribeShareStatisticsHandler(
        [createSubscribeShareStatistics({ share_user: '延迟统计用户' })],
        200,
        requested,
      ),
    )

    renderDialog()

    expect(await screen.findByRole('status')).toHaveTextContent('加载中')
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())

    deferred.resolve()
    expect((await screen.findAllByText('延迟统计用户')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sorts by reuse count and preserves source order for ties', async () => {
    server.use(
      subscribeShareStatisticsHandler([
        createSubscribeShareStatistics({ share_user: '并列第一甲', total_reuse_count: 50 }),
        createSubscribeShareStatistics({ share_user: '并列第一乙', total_reuse_count: 50 }),
        createSubscribeShareStatistics({ share_user: '第三名', total_reuse_count: 30 }),
        createSubscribeShareStatistics({ share_user: '并列末位甲', total_reuse_count: 10 }),
        createSubscribeShareStatistics({ share_user: '并列末位乙', total_reuse_count: 10 }),
      ]),
    )

    await renderDialog()

    expect(await screen.findByText('#4')).toBeInTheDocument()
    const firstPlace = document.body.querySelector('.first-place')?.parentElement
    expect(firstPlace).toHaveTextContent('并列第一甲')
    expect(firstPlace).not.toHaveTextContent('并列第一乙')
    const renderedText = document.body.textContent || ''
    expect(renderedText.indexOf('并列末位甲')).toBeLessThan(renderedText.indexOf('并列末位乙'))
    expect(screen.getByText('#5')).toBeInTheDocument()
  })

  it.each([1, 2, 3, 4])('renders a complete ranking with %i participant(s)', async count => {
    const statistics = Array.from({ length: count }, (_, index) =>
      createSubscribeShareStatistics({
        share_user: `人数场景用户 ${count}-${index + 1}`,
        total_reuse_count: count - index,
      }),
    )
    server.use(subscribeShareStatisticsHandler(statistics))

    await renderDialog()

    for (const item of statistics) {
      expect((await screen.findAllByText(item.share_user!)).length).toBeGreaterThan(0)
    }
    expect(screen.queryByText('暂无分享统计数据')).not.toBeInTheDocument()
    if (count === 4) expect(screen.getByText('#4')).toBeInTheDocument()
  })

  it('renders missing aggregate fields across the podium and remaining rankings', async () => {
    const statistics = Array.from({ length: 4 }, () =>
      createSubscribeShareStatistics({
        share_count: undefined,
        share_user: undefined,
        total_reuse_count: undefined,
      }),
    )
    server.use(subscribeShareStatisticsHandler(statistics))

    await renderDialog()

    expect((await screen.findAllByText('未知')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('#4')).toBeInTheDocument()
  })

  it('treats an empty statistics list as valid empty data', async () => {
    server.use(subscribeShareStatisticsHandler([]))

    await renderDialog()

    expect(await screen.findByText('暂无分享统计数据')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an HTTP error separately and retries the same request on demand', async () => {
    const failedRequest = vi.fn()
    server.use(subscribeShareStatisticsHandler([], 500, failedRequest))
    const user = userEvent.setup()
    await renderDialog()

    expect(await screen.findByText('请求失败，请稍后重试')).toBeInTheDocument()
    expect(failedRequest).toHaveBeenCalledOnce()

    server.use(
      subscribeShareStatisticsHandler([
        createSubscribeShareStatistics({ share_user: '重试恢复用户', total_reuse_count: 20 }),
      ]),
    )
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect((await screen.findAllByText('重试恢复用户')).length).toBeGreaterThan(0)
    expect(screen.queryByText('请求失败，请稍后重试')).not.toBeInTheDocument()
  })

  it('emits close from the dialog close control', async () => {
    server.use(subscribeShareStatisticsHandler([]))
    const user = userEvent.setup()
    const { close } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(close).toHaveBeenCalledOnce()
  })
})
