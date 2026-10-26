import FileNavigator from '@/components/filebrowser/FileNavigator.vue'
import type { DataApiClient } from '@/api'
import type { EndPoints, FileItem } from '@/api/types'
import i18n from '@/plugins/i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isMobile: { value: true },
}))

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({ smAndDown: mocks.isMobile }),
  }
})

vi.mock('@/composables/useAvailableHeight', () => ({
  useAvailableHeight: () => ({ availableHeight: { value: 500 } }),
}))

const VirtualScrollStub = defineComponent({
  name: 'VVirtualScroll',
  props: {
    items: {
      type: Array,
      default: () => [],
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        props.items.map(item => slots.default?.({ item })),
      )
  },
})

function mountNavigator(
  request = vi.fn().mockResolvedValue([]),
  overrides: { currentPath?: string; items?: FileItem[] } = {},
) {
  const axios = Object.assign(vi.fn(), { request }) as unknown as DataApiClient
  const endpoint = { method: 'post', url: '/unused' }
  const endpoints: EndPoints = {
    delete: endpoint,
    download: endpoint,
    image: endpoint,
    list: { method: 'post', url: '/storage/list?sort={sort}' },
    mkdir: endpoint,
    rename: endpoint,
  }

  return mount(FileNavigator, {
    props: {
      axios,
      currentPath: '/',
      endpoints,
      items: [],
      storage: 'local',
      ...overrides,
    },
    global: {
      plugins: [i18n],
      stubs: {
        VCard: { template: '<div class="file-navigator"><slot /></div>' },
        VBtn: { template: '<button type="button"><slot /></button>' },
        VIcon: true,
        VProgressCircular: true,
        VVirtualScroll: VirtualScrollStub,
      },
    },
  })
}

describe('FileNavigator directory tree', () => {
  beforeEach(() => {
    mocks.isMobile.value = false
  })

  it('renders the reusable directory tree inside a mobile navigation sheet', () => {
    mocks.isMobile.value = true
    const wrapper = mountNavigator()

    expect(wrapper.find('.file-navigator').exists()).toBe(true)
  })

  it('renders only directories from the current file list', () => {
    const wrapper = mountNavigator(vi.fn(), {
      items: [
        { name: 'movies', path: '/movies', storage: 'local', type: 'dir' },
        { name: 'readme.txt', path: '/readme.txt', storage: 'local', type: 'file' },
      ],
    })

    expect(wrapper.text()).toContain('movies')
    expect(wrapper.text()).not.toContain('readme.txt')
  })

  it('emits root and directory navigation from visible rows', async () => {
    const directory = { name: 'movies', path: '/movies', storage: 'local', type: 'dir' }
    const wrapper = mountNavigator(vi.fn(), { items: [directory] })

    await wrapper.get('.root-item').trigger('click')
    await wrapper.findAll('.folder-content')[1].trigger('click')

    expect(wrapper.emitted('navigate')).toEqual([
      [{ name: '/', path: '/', storage: 'local', type: 'dir' }],
      [directory],
    ])
  })

  it('loads and filters child directories with the configured list endpoint', async () => {
    const request = vi.fn().mockResolvedValue([
      { name: 'Season 01', path: '/shows/Season 01', storage: 'local', type: 'dir' },
      { name: 'poster.jpg', path: '/shows/poster.jpg', storage: 'local', type: 'file' },
    ])
    const wrapper = mountNavigator(request, {
      items: [{ name: 'shows', path: '/shows', storage: 'local', type: 'dir' }],
    })

    await wrapper.get('.folder-toggle').trigger('click')
    await nextTick()

    expect(request).toHaveBeenCalledWith({
      data: { name: 'shows', path: '/shows', storage: 'local', type: 'dir' },
      method: 'post',
      url: '/storage/list?sort=name',
      params: { page: 1, count: 200 },
    })
    expect(wrapper.text()).toContain('Season 01')
    expect(wrapper.text()).not.toContain('poster.jpg')
  })

  it('reuses cached children when a directory is collapsed and expanded again', async () => {
    const request = vi
      .fn()
      .mockResolvedValue([{ name: 'Season 01', path: '/shows/Season 01', storage: 'local', type: 'dir' }])
    const wrapper = mountNavigator(request, {
      items: [{ name: 'shows', path: '/shows', storage: 'local', type: 'dir' }],
    })

    await wrapper.get('.folder-toggle').trigger('click')
    await nextTick()
    await wrapper.get('.folder-toggle').trigger('click')
    await wrapper.get('.folder-toggle').trigger('click')
    await nextTick()

    expect(request).toHaveBeenCalledOnce()
  })

  it('loads uncached ancestors needed by the current path', async () => {
    const requestedPaths: string[] = []
    const request = vi.fn().mockImplementation(({ data }: { data: FileItem }) => {
      requestedPaths.push(data.path)
      return []
    })

    mountNavigator(request, { currentPath: '/shows/Season 01' })
    await nextTick()
    await nextTick()

    expect(requestedPaths).toEqual(['/shows', '/'])
  })

  it('reloads the same subtree after switching storage and ignores old in-flight results', async () => {
    let resolveOld!: (items: FileItem[]) => void
    const request = vi.fn().mockImplementation(({ data }: { data: FileItem }) => {
      if (data.storage === 'local')
        return new Promise<FileItem[]>(resolve => {
          resolveOld = resolve
        })
      return [{ name: 'remote-child', path: '/shows/remote', storage: 'rclone', type: 'dir' }]
    })
    const wrapper = mountNavigator(request, {
      items: [{ name: 'shows', path: '/shows', storage: 'local', type: 'dir' }],
    })
    await wrapper.get('.folder-toggle').trigger('click')
    await wrapper.setProps({
      storage: 'rclone',
      items: [{ name: 'shows', path: '/shows', storage: 'rclone', type: 'dir' }],
    })
    await wrapper.get('.folder-toggle').trigger('click')
    await nextTick()
    resolveOld([{ name: 'old-child', path: '/shows/old', storage: 'local', type: 'dir' }])
    await nextTick()
    await nextTick()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storage: 'rclone', path: '/shows' }) }),
    )
    expect(wrapper.text()).toContain('remote-child')
    expect(wrapper.text()).not.toContain('old-child')
    const row = wrapper.findAll('.folder-content').find(row => row.text().includes('remote-child'))!
    await row.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([
      { name: 'remote-child', path: '/shows/remote', storage: 'rclone', type: 'dir' },
      [
        { name: 'shows', path: '/shows', storage: 'rclone', type: 'dir' },
        { name: 'remote-child', path: '/shows/remote', storage: 'rclone', type: 'dir' },
      ],
    ])
  })

  it('preserves opaque folder and ancestor identities when expanding and navigating a deep tree', async () => {
    const parent: FileItem = {
      name: 'shows',
      path: '/shows/',
      storage: 'local',
      type: 'dir',
      fileid: 'parent-id',
      drive_id: 'drive-id',
    }
    const child: FileItem = {
      name: 'season',
      path: '/shows/season/',
      storage: 'local',
      type: 'dir',
      fileid: 'child-id',
      drive_id: 'drive-id',
    }
    const request = vi.fn().mockResolvedValue([child])
    const wrapper = mountNavigator(request, { items: [parent] })
    await wrapper.get('.folder-toggle').trigger('click')
    await nextTick()
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ data: parent }))
    const row = wrapper.findAll('.folder-content').find(row => row.text().includes('season'))!
    await row.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([child, [parent, child]])
  })

  it('expands Windows ancestors using drive-absolute paths and preserves their identities', async () => {
    const drive: FileItem = { name: 'C:', path: 'C:/', storage: 'local', type: 'dir', fileid: 'drive-id' }
    const shows: FileItem = { name: 'shows', path: 'C:/shows/', storage: 'local', type: 'dir', fileid: 'shows-id' }
    const season: FileItem = {
      name: 'season',
      path: 'C:/shows/season/',
      storage: 'local',
      type: 'dir',
      fileid: 'season-id',
    }
    const request = vi.fn().mockImplementation(({ data }: { data: FileItem }) => {
      if (data.path === '/') return [drive]
      if (data.path === 'C:/') return [shows]
      if (data.path === 'C:/shows/') return [season]
      return []
    })
    const wrapper = mountNavigator(request, { currentPath: 'C:/shows/season/' })
    await flushPromises()
    expect(request.mock.calls.map(([config]) => config.data.path)).toContain('C:/')
    expect(request.mock.calls.map(([config]) => config.data.path).some((path: string) => path.startsWith('/C:'))).toBe(
      false,
    )
    expect(wrapper.text()).toContain('season')
    const row = wrapper.findAll('.folder-content').find(row => row.text().includes('season'))!
    await row.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([season, [drive, shows, season]])
  })

  it('keeps POSIX directories ending in a colon distinct from Windows drive roots', async () => {
    const parent: FileItem = { name: 'shows:', path: '/shows:/', storage: 'local', type: 'dir' }
    const child: FileItem = { name: 'season', path: '/shows:/season/', storage: 'local', type: 'dir' }
    const request = vi.fn().mockImplementation(({ data }: { data: FileItem }) => {
      if (data.path === '/') return [parent]
      if (data.path === '/shows:') return [child]
      return []
    })
    const wrapper = mountNavigator(request, { currentPath: '/shows:/season/' })
    await flushPromises()
    expect(wrapper.text()).toContain('season')
  })

  it('keeps opaque identities through root and child continuation pages', async () => {
    const parent: FileItem = {
      name: 'cloud-shows',
      path: '/cloud-shows/',
      storage: 'local',
      type: 'dir',
      fileid: 'parent-opaque',
      drive_id: 'drive-opaque',
    }
    const rootTail: FileItem = {
      name: 'root-tail',
      path: '/root-tail/',
      storage: 'local',
      type: 'dir',
      fileid: 'root-tail-opaque',
      drive_id: 'drive-opaque',
    }
    const child: FileItem = {
      name: 'first-season',
      path: '/cloud-shows/first-season/',
      storage: 'local',
      type: 'dir',
      fileid: 'first-season-opaque',
      drive_id: 'drive-opaque',
    }
    const childTail: FileItem = {
      name: 'last-season',
      path: '/cloud-shows/last-season/',
      storage: 'local',
      type: 'dir',
      fileid: 'last-season-opaque',
      drive_id: 'drive-opaque',
    }
    const files = (prefix: string) =>
      Array.from({ length: 199 }, (_, index): FileItem => ({
        name: `file-${index}`,
        path: `${prefix}/file-${index}`,
        storage: 'local',
        type: 'file',
      }))
    const request = vi.fn().mockImplementation(({ data, params }: { data: FileItem; params: { page: number } }) => {
      if (data.path === '/') return [rootTail]
      if (data.path === parent.path) return params.page === 1 ? [child, ...files('/cloud-shows')] : [childTail]
      return []
    })
    const wrapper = mountNavigator(request, { items: [parent, ...files('')] })
    const more = () => wrapper.findAll('button').filter(button => button.text() === i18n.global.t('common.loadMore'))
    expect(more()).toHaveLength(1)
    await more()[0].trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ params: { page: 2, count: 200 } }))
    expect(wrapper.text()).toContain('cloud-shows')
    const tailRow = wrapper.findAll('.folder-content').find(row => row.text().includes('root-tail'))!
    await tailRow.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([rootTail])
    await wrapper.get('.folder-toggle').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ data: parent, params: { page: 1, count: 200 } }))
    expect(more()).toHaveLength(1)
    await more()[0].trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ data: parent, params: { page: 2, count: 200 } }))
    expect(wrapper.text()).toContain('first-season')
    expect(wrapper.text()).toContain('last-season')
    expect(more()).toHaveLength(0)
    const childRow = wrapper.findAll('.folder-content').find(row => row.text().includes('last-season'))!
    await childRow.trigger('click')
    expect(wrapper.emitted('navigate')?.at(-1)).toEqual([childTail, [parent, childTail]])
    wrapper.unmount()
  })

  it('does not revive old children or continuation state after local to remote to local reuse', async () => {
    const oldParent: FileItem = {
      name: 'old-parent',
      path: '/shows/',
      storage: 'local',
      type: 'dir',
      fileid: 'old-parent-opaque',
      drive_id: 'old-drive',
    }
    const newParent: FileItem = { ...oldParent, name: 'new-parent', fileid: 'new-parent-opaque', drive_id: 'new-drive' }
    const oldPage = Array.from({ length: 200 }, (_, index): FileItem => ({
      name: `old-child-${index}`,
      path: `/shows/old-${index}`,
      storage: 'local',
      type: 'dir',
    }))
    let resolveOld!: (items: FileItem[]) => void
    const request = vi.fn().mockImplementation(({ data, params }: { data: FileItem; params: { page: number } }) => {
      if (data.fileid === oldParent.fileid && params.page === 1) return oldPage
      if (data.fileid === oldParent.fileid && params.page === 2)
        return new Promise<FileItem[]>(resolve => {
          resolveOld = resolve
        })
      if (data.fileid === newParent.fileid)
        return [{ name: 'new-child', path: '/shows/new-child', storage: 'local', type: 'dir' }]
      return []
    })
    const wrapper = mountNavigator(request, { items: [oldParent] })
    await wrapper.get('.folder-toggle').trigger('click')
    await flushPromises()
    const button = wrapper.findAll('button').find(button => button.text() === i18n.global.t('common.loadMore'))!
    await button.trigger('click')
    await wrapper.setProps({ storage: 'rclone', items: [{ ...oldParent, storage: 'rclone' }] })
    await wrapper.setProps({ storage: 'local', items: [newParent] })
    resolveOld(oldPage)
    await flushPromises()
    expect(wrapper.text()).not.toContain('old-child')
    expect(wrapper.findAll('button').filter(button => button.text() === i18n.global.t('common.loadMore'))).toHaveLength(
      0,
    )
    await wrapper.get('.folder-toggle').trigger('click')
    await flushPromises()
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: newParent, params: { page: 1, count: 200 } }),
    )
    expect(wrapper.text()).toContain('new-child')
    expect(wrapper.text()).not.toContain('old-child')
    expect(wrapper.findAll('button').filter(button => button.text() === i18n.global.t('common.loadMore'))).toHaveLength(
      0,
    )
    wrapper.unmount()
  })
})
