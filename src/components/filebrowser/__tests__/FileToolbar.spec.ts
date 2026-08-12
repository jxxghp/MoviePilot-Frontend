import FileToolbar from '@/components/filebrowser/FileToolbar.vue'
import type { DataApiClient } from '@/api'
import type { EndPoints, FileItem } from '@/api/types'
import i18n from '@/plugins/i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  openSharedDialog: vi.fn(),
  updateProps: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({ mdAndUp: { value: true } }),
  }
})

const IconBtnStub = defineComponent({
  name: 'IconBtn',
  emits: ['click'],
  setup(_props, { emit, slots }) {
    return () => h('button', { class: 'icon-btn', type: 'button', onClick: () => emit('click') }, slots.default?.())
  },
})

function mountToolbar(
  request: ReturnType<typeof vi.fn>,
  sort = 'name',
  item: FileItem = { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
  itemstack: FileItem[] = [
    { name: '/', path: '/', storage: 'local', type: 'dir' },
    { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
  ],
) {
  const axios = Object.assign(vi.fn(), { request }) as unknown as DataApiClient
  const endpoint = { method: 'post', url: '/unused' }
  const endpoints: EndPoints = {
    delete: endpoint,
    download: endpoint,
    image: endpoint,
    list: endpoint,
    mkdir: {
      method: 'post',
      url: '/storage/mkdir?name={name}',
    },
    rename: endpoint,
  }

  return mount(FileToolbar, {
    props: {
      axios,
      endpoints,
      item,
      itemstack,
      sort,
      storages: [
        { icon: 'mdi-harddisk', title: '本地', value: 'local' },
        { icon: 'mdi-cloud', title: '网盘', value: 'rclone' },
      ],
    },
    global: {
      plugins: [i18n],
      stubs: {
        IconBtn: IconBtnStub,
        VBtn: {
          emits: ['click'],
          template: '<button class="toolbar-button" type="button" @click="$emit(`click`)"><slot /></button>',
        },
        VIcon: true,
        VList: { template: '<div><slot /></div>' },
        VListItem: {
          emits: ['click'],
          props: ['disabled'],
          template: '<button class="storage-item" type="button" @click="$emit(`click`)"><slot /></button>',
        },
        VListItemTitle: true,
        VMenu: { template: '<div><slot name="activator" :props="{}" /><slot /></div>' },
        VToolbar: { template: '<div><slot /></div>' },
        VToolbarItems: { template: '<div><slot /></div>' },
      },
    },
  })
}

function openDialogAndCreate(wrapper: ReturnType<typeof mountToolbar>, name = 'new-folder') {
  ;(wrapper.vm as unknown as { openNewFolderDialog: () => void }).openNewFolderDialog()
  const events = mocks.openSharedDialog.mock.calls[0][2] as {
    create: () => Promise<void>
    'update:name': (value: string) => void
  }
  events['update:name'](name)
  return events.create()
}

describe('FileToolbar mkdir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.close,
      id: 1,
      updateProps: mocks.updateProps,
    })
  })

  it('does not report creation when the API returns a business failure and always finishes loading', async () => {
    const request = vi.fn().mockRejectedValue(new Error('目录已存在'))
    const wrapper = mountToolbar(request)

    await openDialogAndCreate(wrapper)
    await flushPromises()

    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toBeUndefined()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('does not report creation when the request rejects and always finishes loading', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.fn().mockRejectedValue(new Error('network failed'))
    const wrapper = mountToolbar(request)

    await expect(openDialogAndCreate(wrapper)).resolves.toBeUndefined()
    await flushPromises()

    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toBeUndefined()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('submits the current directory and closes only after a successful creation', async () => {
    const request = vi.fn().mockResolvedValue(null)
    const wrapper = mountToolbar(request)

    await openDialogAndCreate(wrapper, 'Season 01')
    await flushPromises()

    expect(request).toHaveBeenCalledWith({
      data: { name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' },
      feedback: 'silent',
      method: 'post',
      url: '/storage/mkdir?name=Season 01',
    })
    expect(wrapper.emitted('loading')).toEqual([[true], [false]])
    expect(wrapper.emitted('foldercreated')).toEqual([[]])
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.updateProps).toHaveBeenCalledWith({ name: 'Season 01' })
  })

  it('closes an open shared dialog when unmounted', () => {
    const wrapper = mountToolbar(vi.fn())
    ;(wrapper.vm as unknown as { openNewFolderDialog: () => void }).openNewFolderDialog()

    wrapper.unmount()

    expect(mocks.close).toHaveBeenCalledOnce()
  })
})

describe('FileToolbar navigation and sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.close,
      id: 1,
      updateProps: mocks.updateProps,
    })
  })

  it('emits the opposite sort mode from the first toolbar action', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.icon-btn')[0].trigger('click')

    expect(wrapper.emitted('sortchanged')).toEqual([['time']])
  })

  it('switches time sorting back to name sorting', async () => {
    const wrapper = mountToolbar(vi.fn(), 'time')

    await wrapper.findAll('.icon-btn')[0].trigger('click')

    expect(wrapper.emitted('sortchanged')).toEqual([['name']])
  })

  it('emits only a changed storage selection', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.storage-item')[0].trigger('click')
    await wrapper.findAll('.storage-item')[1].trigger('click')

    expect(wrapper.emitted('storagechanged')).toEqual([['rclone']])
  })

  it('navigates to the parent breadcrumb from the up action', async () => {
    const wrapper = mountToolbar(vi.fn())

    await wrapper.findAll('.icon-btn')[1].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([[{ name: '/', path: '/', storage: 'local', type: 'dir' }]])
  })

  it('navigates directly through root and path breadcrumb actions', async () => {
    const wrapper = mountToolbar(vi.fn())
    const navigationButtons = wrapper.findAll('.toolbar-button')

    await navigationButtons[1].trigger('click')
    await navigationButtons[2].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([
      [{ name: '/', path: '/', storage: 'local', type: 'dir' }],
      [{ name: 'downloads', path: '/downloads/', storage: 'local', type: 'dir' }],
    ])
  })

  it('omits the parent action at storage root and keeps root navigation stable', async () => {
    const root = { name: '/', path: '/', storage: 'local', type: 'dir' }
    const wrapper = mountToolbar(vi.fn(), 'name', root, [root])

    expect(wrapper.findAll('.icon-btn')).toHaveLength(2)
    await wrapper.findAll('.toolbar-button')[1].trigger('click')

    expect(wrapper.emitted('pathchanged')).toEqual([[root]])
  })
})
