import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import type { DirectoryRouteSettings } from '@/api/types'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet, post: mocks.apiPost }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/components/cards/DirectoryCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'DirectoryCardStub',
      props: { directory: { type: Object, required: true } },
      emits: ['close', 'update:modelValue'],
      template: `
      <section :aria-label="'directory-' + directory.name">
        <span>{{ directory.name }}</span>
        <button :aria-label="'rename-' + directory.name" @click="directory.name = '目录1'">rename</button>
        <button :aria-label="'remove-' + directory.name" @click="$emit('close')">remove</button>
        <button
          :aria-label="'paths-' + directory.name"
          @click="directory.download_path = '/new-download'; directory.library_path = '/new-library'"
        >paths</button>
      </section>
    `,
    }),
  }
})

vi.mock('@/components/cards/StorageCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'StorageCardStub',
      props: { storage: { type: Object, required: true } },
      emits: ['close', 'done'],
      template: `
      <section :aria-label="'storage-' + storage.name">
        <span>{{ storage.name }}</span>
        <button :aria-label="'remove-' + storage.name" @click="$emit('close')">remove</button>
        <button :aria-label="'reload-' + storage.name" @click="$emit('done')">done</button>
      </section>
    `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue', 'end'],
      setup(props, { emit, slots }) {
        const reverse = () => {
          emit('update:modelValue', [...props.modelValue].reverse())
          emit('end')
        }
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h('button', { 'aria-label': `reverse-${items[0]?.name ?? 'empty'}`, onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: { value: { type: String, default: '' } },
  emits: ['update:value'],
  template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
})

const storagesFixture = [
  { name: '本地存储', type: 'local', config: {} },
  { name: '自定义存储 1', type: 'custom1', config: {} },
]

const directoriesFixture = [
  {
    name: '目录1',
    storage: 'local',
    download_path: '/downloads/a',
    library_path: '/media/a',
    priority: 8,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  },
  {
    name: '目录3',
    storage: 'local',
    download_path: '/downloads/b',
    library_path: '/media/b',
    priority: 2,
    monitor_type: '',
    media_type: '',
    media_category: '',
    transfer_type: '',
  },
]

const categoryConfigFixture = {
  movie: {},
  tv: { 综艺: { genre_ids: '10764' } },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function mockLoadedSettings(options: { mountedDisk?: boolean | null; matchMode?: 'sequential' | 'specificity' } = {}) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'transfer/route/settings') {
      return {
        directories: structuredClone(directoriesFixture),
        match_mode: options.matchMode ?? 'sequential',
      }
    }
    if (endpoint === 'system/setting/public/Storages') return { data: { value: structuredClone(storagesFixture) } }
    if (endpoint === 'media/category') return { 电影: ['华语'] }
    if (endpoint === 'media/category/config') return structuredClone(categoryConfigFixture)
    if (endpoint === 'system/env') {
      return {
        success: true,
        data: {
          MOVIE_RENAME_FORMAT: '{{ title }}',
          TV_RENAME_FORMAT: '{{ name }}',
          MUSIC_RENAME_FORMAT: '{{ artist }}',
          UNRELATED: 'ignored',
        },
      }
    }
    if (endpoint === 'system/setting/MountedLocalDiskDeleteEmptyDirs') {
      return { data: { value: options.mountedDisk ?? null }, success: true }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockImplementation((endpoint: string, payload: unknown) => {
    if (endpoint === 'transfer/route/settings') return payload
    return { success: true }
  })
}

async function renderDirectorySettings() {
  return renderWithProviders(AccountSettingDirectory, {
    global: { stubs: { VAceEditor: AceEditorStub } },
  })
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getRenameEditors() {
  return screen.getAllByRole('textbox').filter(element => element.tagName === 'TEXTAREA')
}

describe('AccountSettingDirectory', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mockLoadedSettings()
  })

  it('loads owned values, keeps the mounted-disk default, and follows active refresh state', async () => {
    const { rerender } = await renderDirectorySettings()

    expect(await screen.findByText('目录1')).toBeInTheDocument()
    expect(screen.getByText('目录3')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '挂载盘删除空目录' })).toBeChecked()
    expect(getCard('目录').getByRole('button', { name: '按顺序匹配' })).toHaveClass('v-btn--active')
    expect(getCard('存储').queryByRole('button', { name: '按顺序匹配' })).not.toBeInTheDocument()
    expect(getRenameEditors().map(input => (input as HTMLTextAreaElement).value)).toEqual([
      '{{ title }}',
      '{{ artist }}',
      '{{ name }}',
    ])

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(computed(() => refreshOptions.active.value).value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('loads and saves the optional specificity mode with the directory draft', async () => {
    mockLoadedSettings({ matchMode: 'specificity' })
    const user = userEvent.setup()
    await renderDirectorySettings()

    expect(await screen.findByRole('button', { name: '精确规则优先' })).toHaveClass('v-btn--active')
    await user.click(screen.getByRole('button', { name: '按顺序匹配' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'transfer/route/settings',
        expect.objectContaining({
          directories: expect.any(Array),
          match_mode: 'sequential',
        }),
      )
    })
  })

  it('opens route preview with normalized copies without mutating the directory draft', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    await user.click(screen.getByRole('button', { name: '路由预览' }))

    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        directories: [
          expect.objectContaining({ name: '目录1', priority: 0 }),
          expect.objectContaining({ name: '目录3', priority: 1 }),
        ],
      }),
      {},
      { closeOn: ['close', 'update:modelValue'] },
    )
    const previewProps = mocks.openSharedDialog.mock.calls.at(-1)?.[1] as {
      directories: typeof directoriesFixture
    }
    previewProps.directories[0].name = '预览副本'
    expect(screen.getByText('目录1')).toBeInTheDocument()
    expect(screen.queryByText('预览副本')).not.toBeInTheDocument()

    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/route/settings',
      expect.objectContaining({
        directories: [
          expect.objectContaining({ name: '目录1', priority: 0 }),
          expect.objectContaining({ name: '目录3', priority: 1 }),
        ],
      }),
    )
  })

  it('adds a non-conflicting directory name, updates paths, and saves current priority order', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')
    const directoryCard = getCard('目录')
    await user.click(directoryCard.getByRole('button', { name: '添加目录' }))

    expect(screen.getByText('目录4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'paths-目录1' }))
    await user.click(screen.getByRole('button', { name: 'reverse-目录1' }))
    await user.click(directoryCard.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'transfer/route/settings',
        expect.objectContaining({
          directories: [
            expect.objectContaining({ name: '目录4', priority: 0 }),
            expect.objectContaining({ name: '目录3', priority: 1 }),
            expect.objectContaining({
              name: '目录1',
              priority: 2,
              download_path: '/new-download',
              library_path: '/new-library',
            }),
          ],
          match_mode: 'sequential',
        }),
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('目录设置保存成功')
  })

  it('blocks duplicate directory names before the API call', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')
    await user.click(screen.getByRole('button', { name: 'rename-目录3' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalledWith('transfer/route/settings', expect.anything())
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复目录名称！无法保存，请修改！')
  })

  it('removes directories and storages and persists the remaining collections', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')

    await user.click(screen.getByRole('button', { name: 'remove-目录1' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/route/settings',
      expect.objectContaining({
        directories: [expect.objectContaining({ name: '目录3', priority: 0 })],
      }),
    )

    mocks.apiPost.mockClear()
    await user.click(screen.getByRole('button', { name: 'remove-自定义存储 1' }))
    await user.click(getCard('存储').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Storages', [
      expect.objectContaining({ name: '本地存储', type: 'local' }),
    ])
  })

  it('filters existing storage types and creates unique custom storage names', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('自定义存储 1')
    const storageCard = getCard('存储')
    const actionButtons = storageCard.getAllByRole('button')
    await user.click(actionButtons.at(-1)!)

    expect(screen.queryByText('本地', { selector: '.v-list-item-title' })).not.toBeInTheDocument()
    await user.click(await screen.findByText('自定义', { selector: '.v-list-item-title' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/setting/Storages',
        expect.arrayContaining([expect.objectContaining({ name: '自定义 3', type: 'custom3' })]),
      )
    })
  })

  it('converts cleared rename formats to null and requires both organization saves to succeed', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('整理 & 刮削')
    for (const editor of getRenameEditors()) await fireEvent.update(editor, '')
    await user.click(screen.getByRole('checkbox', { name: '挂载盘删除空目录' }))
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/env', {
        SCRAP_SOURCE: 'themoviedb',
        MOVIE_RENAME_FORMAT: null,
        TV_RENAME_FORMAT: null,
        MUSIC_RENAME_FORMAT: null,
      })
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/MountedLocalDiskDeleteEmptyDirs', false)
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('整理选项设置保存成功')

    mocks.apiPost.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false })
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理选项设置保存失败！'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('reports HTTP failures for storage, directory, and organization saves', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('存储').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('存储设置保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('目录设置保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理选项设置保存失败！'))
  })

  it('warns when the directory draft changes while an older snapshot is saving', async () => {
    const save = deferred<DirectoryRouteSettings>()
    mocks.apiPost.mockImplementation((endpoint: string, payload: unknown) => {
      if (endpoint === 'transfer/route/settings') return save.promise
      return payload
    })
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    const saveClick = user.click(getCard('目录').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('transfer/route/settings', expect.anything()))
    await user.click(screen.getByRole('button', { name: 'paths-目录1' }))
    const payload = mocks.apiPost.mock.calls.find(([endpoint]) => endpoint === 'transfer/route/settings')?.[1]
    save.resolve(payload as DirectoryRouteSettings)
    await saveClick

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledWith('保存期间目录已被继续修改，请再次保存最新草稿'))
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('目录设置保存成功')
  })

  it('opens the shared category editor and reloads storage data after a card completes', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('本地存储')
    const directoryCard = getCard('目录')
    await user.click(directoryCard.getByRole('button', { name: '分类策略' }))
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ initialConfig: categoryConfigFixture }),
      expect.objectContaining({ 'draft-change': expect.any(Function), save: expect.any(Function) }),
      expect.anything(),
    )

    const initialStorageLoads = mocks.apiGet.mock.calls.filter(
      ([url]) => url === 'system/setting/public/Storages',
    ).length
    await user.click(screen.getByRole('button', { name: 'reload-本地存储' }))
    await waitFor(() => {
      expect(mocks.apiGet.mock.calls.filter(([url]) => url === 'system/setting/public/Storages')).toHaveLength(
        initialStorageLoads + 1,
      )
    })
  })

  it('keeps category actions disabled until the real configuration is loaded', async () => {
    const categoryLoad = deferred<typeof categoryConfigFixture>()
    const loadedGet = mocks.apiGet.getMockImplementation()!
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'media/category/config') return categoryLoad.promise
      return loadedGet(endpoint)
    })
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    const categoryButton = getCard('目录').getByRole('button', { name: '分类策略' })
    expect(categoryButton).toBeDisabled()
    await user.click(categoryButton)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()

    categoryLoad.resolve(structuredClone(categoryConfigFixture))
    await waitFor(() => expect(categoryButton).toBeEnabled())
    await user.click(categoryButton)

    expect(mocks.openSharedDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ initialConfig: categoryConfigFixture }),
      expect.objectContaining({ 'draft-change': expect.any(Function), save: expect.any(Function) }),
      expect.anything(),
    )
  })

  it('opens route preview with current unsaved directory and category drafts', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    await user.click(screen.getByRole('button', { name: '分类策略' }))
    const categoryEvents = mocks.openSharedDialog.mock.calls.at(-1)?.[2]
    const changedConfig = { movie: {}, tv: { 动漫: { genre_ids: '16' } } }
    categoryEvents['draft-change'](changedConfig)

    await user.click(screen.getByRole('button', { name: '路由预览' }))
    expect(mocks.openSharedDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        categoryConfig: changedConfig,
        directories: [
          expect.objectContaining({ name: '目录1', priority: 0 }),
          expect.objectContaining({ name: '目录3', priority: 1 }),
        ],
        matchMode: 'sequential',
      }),
      expect.anything(),
      expect.anything(),
    )
  })

  it('preserves an unsaved category draft during silent refresh', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    await user.click(screen.getByRole('button', { name: '分类策略' }))
    const categoryEvents = mocks.openSharedDialog.mock.calls.at(-1)?.[2]
    const changedConfig = { movie: {}, tv: { 动漫: { genre_ids: '16' } } }
    categoryEvents['draft-change'](changedConfig)

    const refresh = mocks.useSilentSettingRefresh.mock.calls[0]?.[0] as () => Promise<void>
    await refresh()
    await user.click(screen.getByRole('button', { name: '路由预览' }))

    expect(mocks.openSharedDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ categoryConfig: changedConfig }),
      expect.anything(),
      expect.anything(),
    )
  })
})
