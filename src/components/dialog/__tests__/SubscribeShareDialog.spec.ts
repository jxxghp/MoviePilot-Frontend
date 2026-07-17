import SubscribeShareDialog from '@/components/dialog/SubscribeShareDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribe } from '@tests/support/factories/subscribe'
import { shareSubscribeHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, '关闭')
  },
})

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog(season = 2, name = '分享创建测试剧') {
  const close = vi.fn()
  const sub = createSubscribe({
    id: 5201,
    name,
    season,
    tmdbid: 52010,
    type: '电视剧',
  })
  const result = await renderWithProviders(SubscribeShareDialog, {
    props: {
      modelValue: true,
      onClose: close,
      sub,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
  })

  return { ...result, close, sub }
}

async function fillRequiredFields(comment = '覆盖精确订阅规则', shareUser = '测试分享人') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('说明'), comment)
  await user.type(screen.getByLabelText('分享用户'), shareUser)
  return user
}

describe('SubscribeShareDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['normal season', 2, 'S02', '第 2 季'],
    ['special season zero', 0, 'S00', '第 0 季'],
  ])('renders the readonly default title and subtitle for %s', async (_case, season, seasonLabel, subtitle) => {
    const { sub } = await renderDialog(season)

    expect(screen.getByLabelText('标题')).toHaveValue(`${sub.name} ${seasonLabel}`)
    expect(document.querySelector('.v-card-subtitle')).toHaveTextContent(`${sub.name} ${subtitle}`)
  })

  it.each([
    ['description', '', '测试分享人'],
    ['sharing user', '覆盖精确订阅规则', ''],
  ])('blocks submission when the %s is missing', async (_case, comment, shareUser) => {
    const requested = vi.fn()
    server.use(shareSubscribeHandler({ success: true }, 200, requested))
    await renderDialog()
    const user = userEvent.setup()

    if (comment) await user.type(screen.getByLabelText('说明'), comment)
    if (shareUser) await user.type(screen.getByLabelText('分享用户'), shareUser)

    await user.click(screen.getByRole('button', { name: '确认分享' }))
    await flushPromises()

    expect(requested).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('submits the exact payload once, stays pending, then closes after success', async () => {
    const deferred = createDeferred()
    const payloads: unknown[] = []
    server.use(
      shareSubscribeHandler({ success: true }, 200, async payload => {
        payloads.push(payload)
        await deferred.promise
      }),
    )
    const { close, sub } = await renderDialog()
    const user = await fillRequiredFields('只保留精确字段', '分享者甲')
    const submit = screen.getByRole('button', { name: '确认分享' })

    await user.click(submit)

    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]).toEqual({
      share_comment: '只保留精确字段',
      share_title: `${sub.name} S02`,
      share_user: '分享者甲',
      subscribe_id: sub.id,
    })
    expect(submit).toBeDisabled()
    expect(close).not.toHaveBeenCalled()

    deferred.resolve()

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(`${sub.name} 分享成功！`))
    expect(close).toHaveBeenCalledOnce()
    expect(submit).not.toBeDisabled()
  })

  it('keeps the dialog open and reports a business failure', async () => {
    server.use(shareSubscribeHandler({ message: '远端拒绝', success: false }))
    const { close, sub } = await renderDialog()
    const user = await fillRequiredFields()
    const submit = screen.getByRole('button', { name: '确认分享' })

    await user.click(submit)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(`${sub.name} 分享失败：远端拒绝！`))
    expect(close).not.toHaveBeenCalled()
    expect(submit).not.toBeDisabled()
  })

  it('recovers from an HTTP failure, keeps the dialog open, and reports the failure', async () => {
    server.use(shareSubscribeHandler({ message: '服务异常', success: false }, 500))
    const { close, sub } = await renderDialog(2, 'HTTP失败剧')
    const user = await fillRequiredFields()
    const submit = screen.getByRole('button', { name: '确认分享' })

    await user.click(submit)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining(`${sub.name} 分享失败`)))
    expect(close).not.toHaveBeenCalled()
    expect(submit).not.toBeDisabled()
  })

  it('emits close from the dialog close control', async () => {
    const user = userEvent.setup()
    const { close } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(close).toHaveBeenCalledOnce()
  })
})
