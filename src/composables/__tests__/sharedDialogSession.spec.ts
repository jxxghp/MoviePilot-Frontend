import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openSharedDialog, useSharedDialog } from '@/composables/useSharedDialog'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'

const SecretDialog = defineComponent({
  props: { secret: String },
  setup: props => () => h('div', { 'data-secret': true }, props.secret),
})

describe('shared dialog authentication lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const { dialogs, closeDialog } = useSharedDialog()
    for (const entry of dialogs.value) closeDialog(entry.id)
  })

  it('destroys sensitive dialogs on logout and does not restore them for the next account', async () => {
    const auth = useAuthStore()
    auth.setToken('account-a')
    const host = mount(SharedDialogHost)
    openSharedDialog(SecretDialog, { secret: 'private-a-token' })
    await flushPromises()
    expect(host.text()).toContain('private-a-token')
    auth.logout()
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
    auth.setToken('account-b')
    await flushPromises()
    expect(host.text()).not.toContain('private-a-token')
    host.unmount()
  })

  it('clears dialogs on direct authenticated identity changes', () => {
    const user = useUserStore()
    user.setUserID(42)
    openSharedDialog(SecretDialog, { secret: 'private-a-token' })
    user.setUserID(7)
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
  })

  it('does not forward delayed callbacks belonging to an invalidated dialog', async () => {
    const auth = useAuthStore()
    auth.setToken('account-a')
    let lateEvent!: () => void
    const onDone = vi.fn()
    const Delayed = defineComponent({
      emits: ['done'],
      setup(_props, { emit }) {
        lateEvent = () => emit('done', 'private-a-token')
        return () => h('div')
      },
    })
    const host = mount(SharedDialogHost)
    openSharedDialog(Delayed, {}, { done: onDone })
    await flushPromises()
    auth.clearToken()
    // Delayed continuations may emit before Vue's scheduled unmount runs.
    lateEvent()
    expect(onDone).not.toHaveBeenCalled()
    await flushPromises()
    host.unmount()
  })
})
