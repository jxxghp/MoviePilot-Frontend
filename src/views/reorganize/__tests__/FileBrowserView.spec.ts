import FileBrowserView from '@/views/reorganize/FileBrowserView.vue'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

const FileBrowserStub = defineComponent({
  name: 'FileBrowser',
  emits: ['pathchanged'],
  props: ['item', 'itemstack', 'storages'],
  template: '<div data-testid="file-browser" />',
})

function mockSettings(
  storages: Array<{ name: string; type: string }> | null,
  directories: Array<{ download_path?: string; storage: string }> | null,
) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Storages') {
      return { data: { value: storages }, success: true }
    }
    if (endpoint === 'system/setting/public/Directories') {
      return { data: { value: directories }, success: true }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

async function mountView() {
  const wrapper = mount(FileBrowserView, {
    global: {
      stubs: {
        FileBrowser: FileBrowserStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('FileBrowserView initialization', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('falls back to the storage root when Directories is null', async () => {
    mockSettings([{ name: '本地', type: 'local' }], null)
    const wrapper = await mountView()

    const browser = wrapper.getComponent(FileBrowserStub)
    expect(browser.props('item')).toMatchObject({
      name: '/',
      path: '/',
      storage: 'local',
      type: 'dir',
    })
    expect(browser.props('itemstack')).toEqual([
      {
        fileid: 'root',
        name: '/',
        path: '/',
        storage: 'local',
        type: 'dir',
      },
    ])
  })

  it('falls back to local root when Storages and Directories are null', async () => {
    mockSettings(null, null)
    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('storages')).toEqual([])
    expect(browser.props('item')).toMatchObject({
      name: '/',
      path: '/',
      storage: 'local',
      type: 'dir',
    })
  })

  it('uses the cached available storage and the common configured path', async () => {
    localStorage.setItem('fileBrowserView.activeStorage', 'rclone')
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '网盘', type: 'rclone' },
      ],
      [
        { download_path: '/media/movies', storage: 'rclone' },
        { download_path: '/media/tv', storage: 'rclone' },
        { download_path: '/downloads', storage: 'local' },
      ],
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'media',
      path: '/media/',
      storage: 'rclone',
    })
    expect(browser.props('itemstack')).toHaveLength(2)
  })

  it('filters unavailable storage entries and selects the most populated available storage', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '115', type: 'u115' },
      ],
      [
        { download_path: '/ignored', storage: 'missing' },
        { download_path: '/one', storage: 'local' },
        { download_path: '/shows/a', storage: 'u115' },
        { download_path: '/shows/b', storage: 'u115' },
        { storage: 'u115' },
      ],
    )

    const browser = (await mountView()).getComponent(FileBrowserStub)

    expect(browser.props('item')).toMatchObject({
      name: 'shows',
      path: '/shows/',
      storage: 'u115',
    })
  })

  it('updates storage persistence and rebuilds the root breadcrumb on navigation', async () => {
    mockSettings(
      [
        { name: '本地', type: 'local' },
        { name: '网盘', type: 'rclone' },
      ],
      [{ download_path: '/downloads/tv', storage: 'local' }],
    )
    const browser = (await mountView()).getComponent(FileBrowserStub)

    browser.vm.$emit('pathchanged', {
      fileid: 'remote-root',
      name: '/',
      path: '/',
      storage: 'rclone',
      type: 'dir',
    })
    await flushPromises()

    expect(localStorage.getItem('fileBrowserView.activeStorage')).toBe('rclone')
    expect(browser.props('item')).toMatchObject({ path: '/', storage: 'rclone' })
    expect(browser.props('itemstack')).toEqual([
      {
        fileid: 'remote-root',
        name: '/',
        path: '/',
        storage: 'rclone',
        type: 'dir',
      },
    ])
  })

  it('truncates the breadcrumb stack when navigating to an existing ancestor', async () => {
    mockSettings([{ name: '本地', type: 'local' }], [{ download_path: '/downloads/tv', storage: 'local' }])
    const browser = (await mountView()).getComponent(FileBrowserStub)

    browser.vm.$emit('pathchanged', {
      name: 'downloads',
      path: '/downloads/',
      storage: 'local',
      type: 'dir',
    })
    await flushPromises()

    expect(browser.props('itemstack').map((item: { path: string }) => item.path)).toEqual(['/', '/downloads/'])
  })
})
