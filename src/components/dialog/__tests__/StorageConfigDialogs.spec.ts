import AlistConfigDialog from '@/components/dialog/AlistConfigDialog.vue'
import RcloneConfigDialog from '@/components/dialog/RcloneConfigDialog.vue'
import { manageStorage } from '@/api/manage'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/manage', () => ({ manageStorage: vi.fn() }))

async function openConfig(storage: 'alist' | 'alistgo' | 'rclone', conf: Record<string, unknown>) {
  return renderWithProviders(storage === 'rclone' ? RcloneConfigDialog : AlistConfigDialog, {
    props: storage === 'rclone' ? { conf } : { conf, type: storage },
    global: {
      stubs: {
        VDialog: { template: '<div><slot /></div>' },
        VDialogCloseBtn: true,
        VAceEditor: { props: ['value'], template: '<textarea :value="value" />' },
        VSelect: {
          props: ['modelValue', 'items'],
          emits: ['update:modelValue'],
          template:
            '<select aria-label="login-type" :value="modelValue" @change="$emit(`update:modelValue`, $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.title }}</option></select>',
        },
      },
    },
  })
}

beforeEach(() => {
  vi.mocked(manageStorage).mockReset().mockResolvedValue({})
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('storage configuration transactions', () => {
  it.each(['alist', 'alistgo', 'rclone'] as const)(
    '%s resets without restoring the old configuration',
    async storage => {
      const { emitted } = await openConfig(storage, {
        url: 'https://storage.invalid',
        token: 'old-token',
        content: 'old',
      })
      await fireEvent.click(screen.getByRole('button', { name: '重置' }))
      await waitFor(() => expect(emitted().done).toHaveLength(1))
      expect(manageStorage).toHaveBeenCalledExactlyOnceWith(storage, 'reset_config')
    },
  )

  it.each(['alist', 'alistgo', 'rclone'] as const)(
    '%s retains the draft after failed save and allows retry',
    async storage => {
      vi.mocked(manageStorage).mockRejectedValueOnce(new Error('offline'))
      const conf = { url: 'https://storage.invalid', content: 'draft' }
      const { emitted } = await openConfig(storage, conf)
      await fireEvent.click(screen.getByRole('button', { name: '完成' }))
      await waitFor(() => expect(console.error).toHaveBeenCalled())
      expect(emitted().done).toBeUndefined()
      expect(conf.content).toBe('draft')
      await fireEvent.click(screen.getByRole('button', { name: '完成' }))
      await waitFor(() => expect(emitted().done).toHaveLength(1))
    },
  )

  it.each(['alist', 'alistgo', 'rclone'] as const)('%s retains the dialog when reset is rejected', async storage => {
    vi.mocked(manageStorage).mockRejectedValueOnce(new Error('reset rejected'))
    const { emitted } = await openConfig(storage, { token: 'original-token', content: 'draft' })
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(emitted().done).toBeUndefined()
    expect(manageStorage).toHaveBeenCalledExactlyOnceWith(storage, 'reset_config')
    expect(screen.getByRole('button', { name: '完成' })).toBeEnabled()
  })

  it.each(['guest', 'username', 'token'])('only submits credentials for %s login', async login => {
    const conf = { url: 'https://storage.invalid', token: 'token', username: 'user', password: 'secret', custom: true }
    await openConfig('alist', conf)
    await fireEvent.update(screen.getByRole('combobox', { name: 'login-type' }), login)
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    const expected: Record<string, unknown> = { url: conf.url, custom: true }
    if (login === 'username') Object.assign(expected, { username: 'user', password: 'secret' })
    if (login === 'token') expected.token = 'token'
    await waitFor(() => expect(manageStorage).toHaveBeenCalledWith('alist', 'save_config', { conf: expected }))
    expect(conf).toMatchObject({ token: 'token', username: 'user', password: 'secret' })
  })

  it.each(['alist', 'rclone'] as const)('%s prevents overlapping reset/save requests', async storage => {
    let resolve!: (value: Record<string, unknown>) => void
    vi.mocked(manageStorage).mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const { emitted } = await openConfig(storage, { content: 'draft' })
    await fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(manageStorage).toHaveBeenCalledTimes(1)
    resolve({})
    await waitFor(() => expect(emitted().done).toHaveLength(1))
  })
})
