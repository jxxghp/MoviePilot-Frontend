import WorkflowSidebar from '@/components/workflow/WorkflowSidebar.vue'
import i18n from '@/plugins/i18n'
import { fireEvent, waitFor } from '@testing-library/vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  onDragStart: vi.fn(),
  smAndDown: { value: false },
  appMode: { value: false },
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@core/utils/workflow', () => ({
  default: () => ({ onDragStart: mocks.onDragStart }),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: mocks.appMode }),
}))

vi.mock('vuetify', async importOriginal => ({
  ...(await importOriginal<typeof import('vuetify')>()),
  useDisplay: () => ({ smAndDown: mocks.smAndDown }),
}))

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const IconButtonStub = defineComponent({
  name: 'IconBtn',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const IconStub = defineComponent({
  name: 'VIcon',
  inheritAttrs: false,
  props: {
    icon: {
      type: String,
      default: '',
    },
  },
  setup(props, { attrs }) {
    return () => h('span', { ...attrs, 'data-icon': props.icon })
  },
})

const BoxStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

function mountSidebar(): VueWrapper {
  const wrapper = mount(WorkflowSidebar, {
    global: {
      plugins: [i18n],
      stubs: {
        VBtn: ButtonStub,
        VIcon: IconStub,
        VAvatar: BoxStub,
        VCard: BoxStub,
        IconBtn: IconButtonStub,
      },
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

let mountedWrappers: VueWrapper[] = []

describe('WorkflowSidebar', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([
      { name: '扫描目录', type: 'ScanFileAction' },
      { name: 'UnknownActionName', type: 'UnknownAction' },
    ])
    mocks.onDragStart.mockReset()
    mocks.smAndDown.value = false
    mocks.appMode.value = false
  })

  afterEach(() => {
    mountedWrappers.forEach(wrapper => wrapper.unmount())
    mountedWrappers = []
  })

  it('loads actions, maps known icons, and keeps unknown action names visible', async () => {
    const wrapper = mountSidebar()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('workflow/actions'))
    await waitFor(() => expect(wrapper.findAll('.component-item')).toHaveLength(2))

    const items = wrapper.findAll('.component-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('.component-name').text()).toBe('Scan Directory')
    expect(items[0].find('[data-icon]').attributes('data-icon')).toBe('mdi-folder-search')
    expect(items[1].find('.component-name').text()).toBe('UnknownActionName')
    expect(items[1].find('[data-icon]').attributes('data-icon')).toBe('mdi-puzzle-outline')
  })

  it('keeps an API loading failure from rendering stale or malformed actions', async () => {
    const error = new Error('workflow actions unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValueOnce(error)

    const wrapper = mountSidebar()

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(error))
    expect(wrapper.findAll('.component-item')).toHaveLength(0)

    consoleError.mockRestore()
  })

  it('collapses only on desktop and starts drag without treating a click as a drag', async () => {
    const wrapper = mountSidebar()
    await waitFor(() => expect(wrapper.findAll('.component-item')).toHaveLength(2))

    expect(wrapper.find('.workflow-sidebar').classes()).not.toContain('sidebar-collapsed')
    await fireEvent.click(wrapper.find('.collapse-btn').element)
    expect(wrapper.find('.workflow-sidebar').classes()).toContain('sidebar-collapsed')
    expect(wrapper.findAll('.component-info')).toHaveLength(0)

    await fireEvent.click(wrapper.find('.component-item').element)
    expect(mocks.onDragStart).not.toHaveBeenCalled()

    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    await fireEvent.dragStart(wrapper.find('.component-item').element, { dataTransfer })
    expect(mocks.onDragStart).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({ name: '扫描目录' }))
  })

  it('opens the mobile sidebar, emits the selected action, and closes after selection', async () => {
    mocks.smAndDown.value = true
    mocks.appMode.value = true
    const wrapper = mountSidebar()
    await waitFor(() => expect(wrapper.findAll('.component-item')).toHaveLength(2))

    const trigger = wrapper.find('.workflow-sidebar-trigger')
    expect(trigger.exists()).toBe(true)
    expect(trigger.classes()).toContain('bottom-28')
    expect(wrapper.find('.workflow-sidebar').classes()).toContain('sidebar-mobile')
    expect(wrapper.find('.component-item').attributes('draggable')).toBe('false')

    await fireEvent.click(trigger.element)
    expect(wrapper.find('.workflow-sidebar').classes()).toContain('sidebar-mobile-open')
    expect(wrapper.find('.workflow-sidebar-fab [data-icon]').attributes('data-icon')).toBe('mdi-close')

    await fireEvent.click(wrapper.find('.component-item').element)
    expect(wrapper.emitted('component-click')).toEqual([[{ name: '扫描目录', type: 'ScanFileAction' }]])
    expect(wrapper.find('.workflow-sidebar').classes()).not.toContain('sidebar-mobile-open')
    expect(mocks.onDragStart).not.toHaveBeenCalled()

    mocks.smAndDown.value = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.workflow-sidebar').classes()).not.toContain('sidebar-mobile-open')
  })
})
