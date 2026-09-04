import AccountSettingDirectory from '@/views/setting/AccountSettingDirectory.vue'
import type { ClassificationCategory } from '@/api/mediaClassification'
import type { TransferDirectoryConf } from '@/api/types'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet, post: mocks.apiPost }),
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/components/cards/DirectoryCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'DirectoryCardStub',
      props: {
        directory: { type: Object, required: true },
        categories: { type: Array, default: () => [] },
      },
      emits: ['close', 'update:modelValue'],
      template: `
      <section :aria-label="'directory-' + directory.name">
        <span>{{ directory.name }}</span>
        <span :data-testid="'category-path-' + directory.name">{{ directory.media_category }}</span>
        <span :data-testid="'category-count-' + directory.name">{{ categories.length }}</span>
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

vi.mock('@/views/setting/AccountSettingClassification.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'AccountSettingClassificationStub',
      props: {
        active: { type: Boolean, default: false },
        showClose: { type: Boolean, default: false },
      },
      emits: ['close'],
      template: `
        <section v-if="active" aria-label="classification-dialog-content">
          <button v-if="showClose" aria-label="关闭自动分类" @click="$emit('close')">close</button>
        </section>
      `,
    }),
  }
})

const DialogStub = defineComponent({
  name: 'VDialogStub',
  props: {
    modelValue: { type: Boolean, default: false },
    fullscreen: { type: Boolean, default: false },
  },
  template:
    '<div v-if="modelValue" data-testid="classification-dialog" :data-fullscreen="String(fullscreen)"><slot /></div>',
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

const directoriesFixture: TransferDirectoryConf[] = [
  {
    name: '目录1',
    storage: 'local',
    download_path: '/downloads/a',
    library_path: '/media/a',
    priority: 8,
    monitor_type: '',
    media_type: '',
    media_category: '',
    media_category_id: null,
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
    media_category_id: null,
    transfer_type: '',
  },
]

const classificationCategories: ClassificationCategory[] = [
  { id: 'movie.animation', media_type: '电影', name: '动画', path: ['电影', '动画'], enabled: true, labels: [] },
  { id: 'movie.disabled', media_type: '电影', name: '停用', path: ['电影', '停用'], enabled: false, labels: [] },
]

const classificationPolicyFixture = {
  schema_version: 2,
  revision: 7,
  mode: 'first_match',
  enrichment_mode: 'primary_only',
  categories: classificationCategories,
  rules: [],
  fallbacks: {},
  field_aliases: {},
}

function mockLoadedSettings(
  options: {
    mountedDisk?: boolean | null
    directories?: TransferDirectoryConf[]
    reloadedDirectories?: TransferDirectoryConf[]
    categories?: ClassificationCategory[]
  } = {},
) {
  let directoryReadCount = 0
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/public/Directories') {
      directoryReadCount += 1
      const value =
        directoryReadCount > 1 && options.reloadedDirectories
          ? options.reloadedDirectories
          : (options.directories ?? directoriesFixture)
      return { data: { value: structuredClone(value) } }
    }
    if (endpoint === 'system/setting/public/Storages') return { data: { value: structuredClone(storagesFixture) } }
    if (endpoint === 'media/classification/policy') {
      return {
        ...structuredClone(classificationPolicyFixture),
        categories: structuredClone(options.categories ?? classificationCategories),
      }
    }
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
  mocks.apiPost.mockResolvedValue({ success: true })
  return () => directoryReadCount
}

async function renderDirectorySettings() {
  return renderWithProviders(AccountSettingDirectory, {
    global: { stubs: { VAceEditor: AceEditorStub, VDialog: DialogStub } },
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
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mockLoadedSettings()
  })

  it('loads owned values, keeps the mounted-disk default, and follows active refresh state', async () => {
    const { rerender } = await renderDirectorySettings()

    expect(await screen.findByText('目录1')).toBeInTheDocument()
    expect(screen.getByText('目录3')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('category-count-目录1')).toHaveTextContent('2'))
    expect(mocks.apiGet).toHaveBeenCalledWith('media/classification/policy')
    expect(screen.getByRole('checkbox', { name: '挂载盘删除空目录' })).toBeChecked()
    expect(screen.getByRole('button', { name: '自动分类策略' })).toBeInTheDocument()
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

  it('从目录页打开全屏自动分类弹窗并支持关闭', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')

    await user.click(screen.getByRole('button', { name: '自动分类策略' }))

    const dialog = screen.getByTestId('classification-dialog')
    expect(dialog).toHaveAttribute('data-fullscreen', 'true')
    expect(screen.getByRole('region', { name: 'classification-dialog-content' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭自动分类' }))
    expect(screen.queryByTestId('classification-dialog')).not.toBeInTheDocument()
  })

  it('adds a non-conflicting directory name, updates paths, and saves current priority order', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录1')
    const directoryCard = getCard('目录')
    const actionButtons = directoryCard.getAllByRole('button')
    await user.click(actionButtons.at(-2)!)

    expect(screen.getByText('目录4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'paths-目录1' }))
    await user.click(screen.getByRole('button', { name: 'reverse-目录1' }))
    await user.click(directoryCard.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Directories', [
        expect.objectContaining({ name: '目录4', priority: 0 }),
        expect.objectContaining({ name: '目录3', priority: 1 }),
        expect.objectContaining({
          name: '目录1',
          priority: 2,
          download_path: '/new-download',
          library_path: '/new-library',
        }),
      ])
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('目录设置保存成功')
  })

  it('blocks duplicate directory names before the API call', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')
    await user.click(screen.getByRole('button', { name: 'rename-目录3' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/setting/Directories', expect.anything())
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复目录名称！无法保存，请修改！')
  })

  it('blocks invalid stable category ids before saving', async () => {
    const user = userEvent.setup()
    mockLoadedSettings({
      directories: [
        {
          ...directoriesFixture[0],
          media_type: '电影',
          media_category_id: 'movie.disabled',
          media_category: '电影/停用',
        },
      ],
    })
    await renderDirectorySettings()
    await screen.findByText('目录1')

    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalledWith('system/setting/Directories', expect.anything())
    expect(mocks.toastError).toHaveBeenCalledWith('目录中存在无效或失效的分类引用，请修复后再保存。')
    expect(screen.getByTestId('directory-save-error')).toHaveTextContent(
      '目录中存在无效或失效的分类引用，请修复后再保存。',
    )
  })

  it('reloads normalized directory snapshots after a successful save', async () => {
    const user = userEvent.setup()
    const initialDirectory: TransferDirectoryConf = {
      ...directoriesFixture[0],
      media_type: '电影',
      media_category_id: 'movie.animation',
      media_category: '旧电影/动画',
    }
    const normalizedDirectory: TransferDirectoryConf = {
      ...initialDirectory,
      media_category: '电影/动画',
    }
    const directoryReads = mockLoadedSettings({
      directories: [initialDirectory],
      reloadedDirectories: [normalizedDirectory],
    })
    await renderDirectorySettings()
    await screen.findByText('目录1')
    expect(screen.getByTestId('category-path-目录1')).toHaveTextContent('旧电影/动画')

    await user.click(getCard('目录').getByRole('button', { name: '保存' }))

    await waitFor(() => expect(directoryReads()).toBe(2))
    expect(screen.getByTestId('category-path-目录1')).toHaveTextContent('电影/动画')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('目录设置保存成功')
  })

  it('removes directories and storages and persists the remaining collections', async () => {
    const user = userEvent.setup()
    await renderDirectorySettings()
    await screen.findByText('目录3')

    await user.click(screen.getByRole('button', { name: 'remove-目录1' }))
    await user.click(getCard('目录').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Directories', [
      expect.objectContaining({ name: '目录3', priority: 0 }),
    ])

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
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('offline'))
    expect(screen.getByTestId('directory-save-error')).toHaveTextContent('offline')

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('整理 & 刮削').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理选项设置保存失败！'))
  })
})
