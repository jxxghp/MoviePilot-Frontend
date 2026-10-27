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
  /** 渲染敏感内容，以检查退出后实例是否已释放。 */
  setup: props => () => h('div', { 'data-secret': true }, props.secret),
})

describe('shared dialog save and authentication lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const { dialogs, closeDialog } = useSharedDialog()
    for (const entry of dialogs.value) closeDialog(entry.id)
  })

  it.each(['close', 'update:modelValue'] as const)(
    'forwards synchronous save events after %s before disposing the dialog',
    async closeEvent => {
      const change = vi.fn()
      const done = vi.fn()
      const updatedConfig = { name: 'qb-updated', config: { host: 'http://localhost:8080' } }
      const SaveDialog = defineComponent({
        emits: ['close', 'update:modelValue', 'change', 'done'],
        /** 模拟配置弹窗先关闭、再同步发出修改和完成事件。 */
        setup(_props, { emit }) {
          return () =>
            h('button', {
              onClick: () => {
                emit(closeEvent, false)
                emit('change', updatedConfig, 'qb-original')
                emit('done')
              },
            })
        },
      })
      const host = mount(SharedDialogHost)
      openSharedDialog(SaveDialog, {}, { change, done }, { closeOn: ['close', 'update:modelValue'] })
      await flushPromises()

      await host.get('button').trigger('click')

      expect(change).toHaveBeenCalledExactlyOnceWith(updatedConfig, 'qb-original')
      expect(done).toHaveBeenCalledOnce()
      expect(useSharedDialog().dialogs.value).toHaveLength(0)
      await flushPromises()
      expect(host.find('button').exists()).toBe(false)
      host.unmount()
    },
  )

  it('preserves a new dialog opened by a save callback while closing the original', async () => {
    const SaveDialog = defineComponent({
      emits: ['update:modelValue', 'done'],
      /** 发出关闭后继续通知调用方打开下一步弹窗。 */
      setup(_props, { emit }) {
        return () =>
          h('button', {
            onClick: () => {
              emit('update:modelValue', false)
              emit('done')
            },
          })
      },
    })
    const host = mount(SharedDialogHost)
    openSharedDialog(SaveDialog, {}, { done: () => openSharedDialog(SecretDialog, { secret: 'saved' }) })
    await flushPromises()

    await host.get('button').trigger('click')
    await flushPromises()

    expect(useSharedDialog().dialogs.value).toHaveLength(1)
    expect(host.text()).toBe('saved')
    host.unmount()
  })

  it('rejects delayed save events after a normal close has completed', async () => {
    let lateEvent!: () => void
    const done = vi.fn()
    const Delayed = defineComponent({
      emits: ['close', 'done'],
      /** 暴露迟到回调，验证正常关闭完成后的事件隔离。 */
      setup(_props, { emit }) {
        lateEvent = () => emit('done')
        return () => h('button', { onClick: () => emit('close') })
      },
    })
    const host = mount(SharedDialogHost)
    openSharedDialog(Delayed, {}, { done })
    await flushPromises()

    await host.get('button').trigger('click')
    lateEvent()

    expect(done).not.toHaveBeenCalled()
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
    host.unmount()
  })

  it('invalidates save events immediately when logout follows a scheduled close', async () => {
    const auth = useAuthStore()
    auth.setToken('account-a')
    const done = vi.fn()
    const SaveDialog = defineComponent({
      emits: ['update:modelValue', 'done'],
      /** 在关闭和完成事件之间退出账号，模拟同步失效。 */
      setup(_props, { emit }) {
        return () =>
          h('button', {
            onClick: () => {
              emit('update:modelValue', false)
              auth.clearToken()
              emit('done', 'private-a-token')
            },
          })
      },
    })
    const host = mount(SharedDialogHost)
    openSharedDialog(SaveDialog, {}, { done })
    await flushPromises()

    await host.get('button').trigger('click')

    expect(done).not.toHaveBeenCalled()
    expect(useSharedDialog().dialogs.value).toHaveLength(0)
    host.unmount()
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
      /** 保留旧实例回调，检查身份失效后能否被立即阻止。 */
      setup(_props, { emit }) {
        lateEvent = () => emit('done', 'private-a-token')
        return () => h('div')
      },
    })
    const host = mount(SharedDialogHost)
    openSharedDialog(Delayed, {}, { done: onDone })
    await flushPromises()
    auth.clearToken()
    // 异步续体可能在 Vue 执行已调度的卸载之前发出事件。
    lateEvent()
    expect(onDone).not.toHaveBeenCalled()
    await flushPromises()
    host.unmount()
  })
})
