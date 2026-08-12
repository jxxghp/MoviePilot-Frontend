import FileNavigator from '@/components/filebrowser/FileNavigator.vue'
import type { DataApiClient } from '@/api'
import type { EndPoints, FileItem } from '@/api/types'
import i18n from '@/plugins/i18n'
import { mount } from '@vue/test-utils'
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

  it('does not render the directory tree on a mobile viewport', () => {
    mocks.isMobile.value = true
    const wrapper = mountNavigator()

    expect(wrapper.find('.file-navigator').exists()).toBe(false)
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
})
