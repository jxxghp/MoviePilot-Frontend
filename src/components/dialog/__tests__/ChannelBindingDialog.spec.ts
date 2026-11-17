import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import ChannelBindingDialog from '@/components/dialog/ChannelBindingDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { authorizationApiUrls } from '@tests/support/msw/handlers/authorization'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

const copyCommand = vi.hoisted(() => vi.fn(() => true))
vi.mock('copy-to-clipboard', () => ({ default: copyCommand }))

/** 渲染一次性关联码窗口，保留真实 HTTP 边界和关闭按钮。 */
async function renderDialog(modelValue = true) {
  return renderWithProviders(ChannelBindingDialog, {
    props: { modelValue },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('ChannelBindingDialog', () => {
  it('只在打开窗口时生成关联码，过期后禁止复制并移除指令', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    const created = vi.fn()
    server.use(
      http.post(authorizationApiUrls.binding, () => {
        created()
        return apiJson({ code: 'synthetic-one-use-code', expires_at: Date.now() / 1000 + 2 })
      }),
    )
    const { rerender } = await renderDialog(false)
    expect(created).not.toHaveBeenCalled()
    await rerender({ modelValue: true })
    expect(await screen.findByLabelText('私聊发送的指令')).toHaveValue('绑定账号 synthetic-one-use-code')
    await fireEvent.click(screen.getByRole('button', { name: '复制指令' }))
    expect(copyCommand).toHaveBeenCalledWith('绑定账号 synthetic-one-use-code')
    await vi.advanceTimersByTimeAsync(3000)
    expect(screen.getByRole('status')).toHaveTextContent('关联码已过期')
    expect(screen.getByLabelText('私聊发送的指令')).toHaveValue('')
    expect(screen.getByRole('button', { name: '已复制' })).toBeDisabled()
  })

  it('失败后允许主动重试，关闭后清空已显示的一次性码', async () => {
    server.use(http.post(authorizationApiUrls.binding, () => apiFailureJson('暂时无法生成关联码')))
    const { rerender } = await renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法生成关联码')
    server.use(
      http.post(authorizationApiUrls.binding, () =>
        apiJson({ code: 'synthetic-retry-code', expires_at: Date.now() / 1000 + 300 }),
      ),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重新生成' }))
    expect(await screen.findByLabelText('私聊发送的指令')).toHaveValue('绑定账号 synthetic-retry-code')
    await rerender({ modelValue: false })
    expect(screen.queryByDisplayValue('绑定账号 synthetic-retry-code')).not.toBeInTheDocument()
  })

  it('关闭期间迟到的响应不能重新写入关联凭据', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const started = vi.fn()
    server.use(
      http.post(authorizationApiUrls.binding, async () => {
        started()
        await gate
        return apiJson({ code: 'synthetic-late-code', expires_at: Date.now() / 1000 + 300 })
      }),
    )
    const { rerender } = await renderDialog()
    await waitFor(() => expect(started).toHaveBeenCalledOnce())
    await rerender({ modelValue: false })
    release()
    await Promise.resolve()
    expect(screen.queryByDisplayValue('绑定账号 synthetic-late-code')).not.toBeInTheDocument()
  })
})
