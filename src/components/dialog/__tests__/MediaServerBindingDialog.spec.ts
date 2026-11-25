import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import MediaServerBindingDialog from '@/components/dialog/MediaServerBindingDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { http } from 'msw'
import { describe, expect, it } from 'vitest'

const BINDINGS_URL = '*/api/v1/mediaserver/account-bindings'

async function renderDialog(modelValue = true) {
  return renderWithProviders(MediaServerBindingDialog, {
    props: { modelValue },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('MediaServerBindingDialog', () => {
  it('展示媒体服务器同步状态并支持绑定与解绑流程', async () => {
    let bound = false
    server.use(
      http.get(BINDINGS_URL, () =>
        apiJson([
          {
            server: '客厅 Emby',
            server_type: 'emby',
            sync_mode: bound ? 'session' : 'userdata',
            supports_binding: true,
            bound,
            status: bound ? 'bound' : 'unbound',
            remote_username: bound ? 'alice_emby' : null,
            source: bound ? 'manual' : null,
            updated_at: bound ? 1700000000 : null,
          },
          {
            server: 'Navidrome',
            server_type: 'navidrome',
            sync_mode: 'scrobble',
            supports_binding: false,
            bound: false,
            status: 'builtin',
            remote_username: null,
            source: null,
            updated_at: null,
          },
        ]),
      ),
      http.post(BINDINGS_URL, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        expect(body.server).toBe('客厅 Emby')
        expect(body.username).toBe('alice_emby')
        bound = true
        return apiJson({
          server: '客厅 Emby',
          server_type: 'emby',
          sync_mode: 'session',
          supports_binding: true,
          bound: true,
          status: 'bound',
          remote_username: 'alice_emby',
          source: 'manual',
          updated_at: 1700000000,
        })
      }),
      http.delete(`${BINDINGS_URL}/*`, () => {
        bound = false
        return apiJson(null)
      }),
    )

    await renderDialog()

    expect(await screen.findByText('客厅 Emby')).toBeInTheDocument()
    expect(screen.getByText('仅进度同步')).toBeInTheDocument()
    expect(screen.getByText('音乐记录')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '绑定' }))
    await fireEvent.update(screen.getByLabelText('媒体服务器用户名 / 邮箱'), 'alice_emby')
    await fireEvent.update(screen.getByLabelText('密码'), 'my-password')
    await fireEvent.click(screen.getByRole('button', { name: '验证并绑定' }))

    expect(await screen.findByText('实时会话同步')).toBeInTheDocument()
    expect(screen.getByText(/已绑定账号：alice_emby/)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '解绑' }))
    await waitFor(() => expect(screen.getByText('仅进度同步')).toBeInTheDocument())
  })
})
