import PluginFolderCard from '@/components/cards/PluginFolderCard.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  isHovering: false,
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const HoverStub = defineComponent({
  name: 'VHover',
  setup(_props, { slots }) {
    return () => h('div', slots.default?.({ isHovering: mocks.isHovering, props: {} }))
  },
})

const MenuStub = defineComponent({
  name: 'VMenu',
  props: { modelValue: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', [
        slots.activator?.({ props: { onClick: () => emit('update:modelValue', !props.modelValue) } }),
        slots.default?.(),
      ])
  },
})

const ButtonStub = defineComponent({
  name: 'IconBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const ListItemStub = defineComponent({
  name: 'VListItem',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, [slots.prepend?.(), slots.default?.()])
  },
})

const passthroughStubs = {
  IconBtn: ButtonStub,
  VCard: defineComponent({
    name: 'VCard',
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h('article', attrs, [slots.image?.(), slots.default?.()])
    },
  }),
  VHover: HoverStub,
  VIcon: true,
  VImg: true,
  VList: defineComponent({
    name: 'VList',
    setup(_props, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  VListItem: ListItemStub,
  VListItemTitle: defineComponent({
    name: 'VListItemTitle',
    setup(_props, { slots }) {
      return () => h('span', slots.default?.())
    },
  }),
  VMenu: MenuStub,
}

const defaultFolderConfig = {
  color: '#2196F3',
  gradient: 'linear-gradient(#111, #222)',
  icon: 'mdi-folder-star',
  plugins: ['PluginA', 'PluginB'],
  showIcon: true,
}

async function renderFolder(sortable = false, folderConfig: Record<string, unknown> = defaultFolderConfig) {
  return renderWithProviders(PluginFolderCard, {
    global: { stubs: passthroughStubs },
    props: {
      folderConfig,
      folderName: '媒体工具',
      pluginCount: 2,
      sortable,
    },
  })
}

function getDialogEvents(index = -1) {
  const call = mocks.openSharedDialog.mock.calls.at(index)
  if (!call) throw new Error('未打开共享弹窗')
  return call[2] as Record<string, (...args: unknown[]) => unknown>
}

describe('PluginFolderCard', () => {
  beforeEach(() => {
    mocks.isHovering = false
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('renders folder identity and opens it only outside sort mode', async () => {
    const normal = await renderFolder()

    expect(screen.getByText('媒体工具')).toBeInTheDocument()
    expect(screen.getByText('2 个插件')).toBeInTheDocument()
    await fireEvent.click(normal.container.querySelector('article') as Element)
    expect(normal.emitted('open')).toEqual([['媒体工具']])

    normal.unmount()
    const sortable = await renderFolder(true)
    await fireEvent.click(sortable.container.querySelector('article') as Element)
    expect(sortable.emitted('open') ?? []).toHaveLength(0)
    expect(screen.queryByText('设置外观')).not.toBeInTheDocument()
  })

  it('uses default appearance and supports a background without an icon', async () => {
    const defaults = await renderFolder(false, {})
    expect(defaults.container.querySelector('v-icon-stub[icon="mdi-folder"]')).toBeInTheDocument()
    expect(defaults.container.querySelector('.plugin-folder-card__bg')).toBeInTheDocument()

    defaults.unmount()
    const image = await renderFolder(false, { background: 'https://example.com/folder.jpg', showIcon: false })
    expect(image.container.querySelector('v-img-stub[src="https://example.com/folder.jpg"]')).toBeInTheDocument()
    expect(image.container.querySelector('.plugin-folder-card__icon-container')).not.toBeInTheDocument()
  })

  it('applies hover state and accepts the menu model update', async () => {
    mocks.isHovering = true
    const { container } = await renderFolder()

    expect(container.querySelector('.plugin-folder-card--hover')).toBeInTheDocument()
    await fireEvent.click(container.querySelector('button') as Element)
    expect(screen.getByText('设置外观')).toBeInTheDocument()
  })

  it('delegates appearance persistence without announcing success before the owner responds', async () => {
    const { emitted } = await renderFolder()

    await fireEvent.click(screen.getByText('设置外观'))
    const config = { color: '#ff0000', icon: 'mdi-folder-heart', showIcon: false }
    getDialogEvents().save(config)

    expect(emitted('update-config')).toEqual([['媒体工具', config]])
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('validates rename input and emits a valid rename through the shared dialog', async () => {
    const { emitted } = await renderFolder()
    await fireEvent.click(screen.getByText('重命名'))
    await fireEvent.click(screen.getByText('重命名'))
    const events = getDialogEvents()

    await events.rename('   ')
    expect(mocks.toastError).toHaveBeenCalledWith('文件夹名称不能为空')

    await events.rename('影音工具')
    expect(emitted('rename')).toEqual([['媒体工具', '影音工具']])
  })

  it('closes rename without emitting when the name is unchanged', async () => {
    const close = vi.fn()
    mocks.openSharedDialog.mockReturnValueOnce({ close, id: 1, updateProps: vi.fn() })
    const { emitted } = await renderFolder()

    await fireEvent.click(screen.getByText('重命名'))
    await getDialogEvents().rename('媒体工具')

    expect(close).toHaveBeenCalledOnce()
    expect(emitted('rename') ?? []).toHaveLength(0)
  })

  it('emits deletion only after confirmation', async () => {
    const cancelled = await renderFolder()
    mocks.confirm.mockResolvedValueOnce(false)
    await fireEvent.click(screen.getByText('删除文件夹'))
    expect(cancelled.emitted('delete') ?? []).toHaveLength(0)

    cancelled.unmount()
    const confirmed = await renderFolder()
    mocks.confirm.mockResolvedValueOnce(true)
    await fireEvent.click(screen.getByText('删除文件夹'))
    expect(confirmed.emitted('delete')).toEqual([['媒体工具']])
  })
})
