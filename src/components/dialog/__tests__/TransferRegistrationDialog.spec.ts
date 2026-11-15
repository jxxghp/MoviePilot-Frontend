import type { TransferHistory } from '@/api/types'
import TransferRegistrationDialog from '@/components/dialog/TransferRegistrationDialog.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

const audit = {
  actor_id: 7,
  actor_name: '登记管理员',
  registered_at: '2026-10-31T10:20:00+00:00',
  verification: 'destination_only' as const,
  source_state: 'absent' as const,
}

async function renderDialog(overrides: Partial<TransferHistory> = {}, returnFocus?: HTMLElement) {
  return renderWithProviders(TransferRegistrationDialog, {
    props: {
      history: { id: 17, title: '外部电影', origin: 'external', registration: audit, ...overrides },
      returnFocus,
    },
    global: { stubs: { VDialog: { template: '<div><slot /></div>' } } },
  })
}

describe('TransferRegistrationDialog', () => {
  it('shows the recorded actor, full timestamp and verification and exposes a native close control', async () => {
    const { emitted, container } = await renderDialog()
    expect(screen.getByText('登记管理员')).toBeInTheDocument()
    expect(screen.getByText(new Date(audit.registered_at).toLocaleString('zh-CN'))).toBeInTheDocument()
    expect(screen.getByText('仅目标核验')).toBeInTheDocument()
    expect(container.querySelector('[data-native-dialog-close]')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(emitted('close')).toHaveLength(1)
  })

  it.each([undefined, null])('keeps missing audit %s explicit without inventing facts', async registration => {
    await renderDialog({ registration })
    expect(screen.getByText('暂无登记详情')).toBeInTheDocument()
    expect(screen.queryByText('登记管理员')).not.toBeInTheDocument()
    expect(screen.queryByText('仅目标核验')).not.toBeInTheDocument()
  })

  it('does not interpret a legacy row audit as an external origin', async () => {
    await renderDialog({ origin: undefined })
    expect(screen.getByText('暂无登记详情')).toBeInTheDocument()
    expect(screen.queryByText('登记管理员')).not.toBeInTheDocument()
  })

  it('preserves long actor names and unrecognized timestamp and verification facts', async () => {
    const actor = '登记人' + 'A'.repeat(125)
    await renderDialog({
      registration: {
        ...audit,
        actor_name: actor,
        registered_at: 'unrecognized-time',
        verification: 'future-check' as typeof audit.verification,
      },
    })
    expect(screen.getByText(actor)).toBeInTheDocument()
    expect(screen.getByText('unrecognized-time')).toBeInTheDocument()
    expect(screen.getByText('future-check')).toBeInTheDocument()
  })

  it('restores focus to the connected source button when the shared dialog is removed', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    const { unmount } = await renderDialog({}, button)
    screen.getByRole('button', { name: '关闭' }).focus()
    unmount()
    expect(button).toHaveFocus()
    button.remove()
  })
})
