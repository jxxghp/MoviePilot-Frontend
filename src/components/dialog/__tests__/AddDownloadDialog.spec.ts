import type { MediaInfo, TorrentInfo, TransferDirectoryConf } from '@/api/types'
import AddDownloadDialog from '@/components/dialog/AddDownloadDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  doneNProgress: vi.fn(),
  startNProgress: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.doneNProgress,
  startNProgress: mocks.startNProgress,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

type SelectItem = string | { title: string; value: string }

const SelectStub = defineComponent({
  name: 'NativeSelectStub',
  props: {
    items: { type: Array as PropType<SelectItem[]>, default: () => [] },
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const itemLabel = (item: SelectItem) => (typeof item === 'string' ? item : item.title)
    const itemValue = (item: SelectItem) => (typeof item === 'string' ? item : item.value)

    return () =>
      h('label', [
        props.label,
        h(
          'select',
          {
            'aria-label': props.label,
            'value': props.modelValue ?? '',
            'onChange': (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
          },
          [
            h('option', { value: '' }, '默认'),
            ...props.items.map(item => h('option', { key: itemValue(item), value: itemValue(item) }, itemLabel(item))),
          ],
        ),
      ])
  },
})

const TextFieldStub = defineComponent({
  name: 'NativeTextFieldStub',
  props: {
    disabled: { type: Boolean, default: false },
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['click:append-inner', 'update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        props.label,
        h('input', {
          'aria-label': props.label,
          'disabled': props.disabled,
          'value': props.modelValue ?? '',
          'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
        h('button', { onClick: () => emit('click:append-inner'), type: 'button' }, '查询媒体编号'),
      ])
  },
})

const MediaIdSelectorStub = defineComponent({
  name: 'MediaIdSelector',
  emits: ['close', 'update:modelValue'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          onClick: () => {
            emit('update:modelValue', '1295644')
            emit('close')
          },
          type: 'button',
        },
        '选择媒体编号',
      )
  },
})

const DialogStub = defineComponent({
  name: 'VDialog',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { role: 'dialog' }, slots.default?.()) : null)
  },
})

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { onClick: () => emit('click'), type: 'button' }, '关闭')
  },
})

function createDirectory(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    download_path: '/downloads/default',
    name: '下载目录',
    priority: 0,
    storage: 'local',
    transfer_type: 'link',
    ...overrides,
  }
}

function createTorrent(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    category: 'movie',
    downloadvolumefactor: 1,
    enclosure: 'https://tracker.example/download/goal-6d.torrent',
    freedate: '',
    freedate_diff: '',
    grabs: 3,
    hit_and_run: false,
    media_id: 'tt0060001',
    media_source: 'imdb',
    labels: [],
    peers: 2,
    pri_order: 0,
    seeders: 10,
    site_name: '测试站',
    site_order: 0,
    site_proxy: false,
    size: 1024,
    title: '测试种子',
    uploadvolumefactor: 1,
    volume_factor: '1x',
    ...overrides,
  }
}

function createMedia(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return {
    episode_run_time: [],
    origin_country: [],
    media_id: '6001',
    media_source: 'themoviedb',
    title: '测试电影',
    tmdb_id: 6001,
    type: '电影',
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function directoriesHandler(directories: TransferDirectoryConf[]) {
  return http.get(new URL('system/setting/public/Directories', API_BASE_URL).href, () =>
    HttpResponse.json({ data: { value: directories }, success: true }),
  )
}

function downloadersHandler(downloaders: Array<{ name: string; type: string }> = []) {
  return http.get(new URL('download/clients', API_BASE_URL).href, () => HttpResponse.json(downloaders))
}

function downloadHandler(
  endpoint: 'download/' | 'download/add',
  response: JsonBodyType | Promise<JsonBodyType>,
  status = 200,
  onRequest: (body: unknown) => void | Promise<void> = () => {},
) {
  return http.post(new URL(endpoint, API_BASE_URL).href, async ({ request }) => {
    await onRequest(await request.json())
    return HttpResponse.json(await response, { status })
  })
}

async function renderDialog({
  directories = [],
  downloaders = [],
  media,
  recognizeSource = 'themoviedb',
  torrent = createTorrent(),
}: {
  directories?: TransferDirectoryConf[]
  downloaders?: Array<{ name: string; type: string }>
  media?: MediaInfo
  recognizeSource?: string
  torrent?: TorrentInfo
} = {}) {
  const events = {
    close: vi.fn(),
    done: vi.fn(),
    error: vi.fn(),
  }
  server.use(directoriesHandler(directories), downloadersHandler(downloaders))
  const result = await renderWithProviders(AddDownloadDialog, {
    global: {
      stubs: {
        AppCombobox: SelectStub,
        AppSelect: SelectStub,
        AppTextField: TextFieldStub,
        MediaIdSelector: MediaIdSelectorStub,
        VCombobox: SelectStub,
        VDialog: DialogStub,
        VDialogCloseBtn: DialogCloseButtonStub,
        VSelect: SelectStub,
        VTextField: TextFieldStub,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          RECOGNIZE_SOURCE: recognizeSource,
        },
      },
    },
    props: {
      media,
      modelValue: true,
      onClose: events.close,
      onDone: events.done,
      onError: events.error,
      title: media?.title,
      torrent,
    },
  })

  return { ...result, events, torrent }
}

describe('AddDownloadDialog directories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('normalizes local, remote, missing-storage, and duplicate directories while loading downloaders', async () => {
    const missingStorage = createDirectory({
      download_path: '/downloads/legacy',
      name: '兼容目录',
      storage: undefined as unknown as string,
    })
    const nullStorage = createDirectory({ download_path: '/downloads/null-storage', name: '空存储目录' })
    nullStorage.storage = null as unknown as string

    await renderDialog({
      directories: [
        createDirectory({ download_path: '/downloads/local' }),
        createDirectory({ download_path: '/downloads/remote', name: '远程目录', storage: 'rclone' }),
        missingStorage,
        nullStorage,
        createDirectory({ download_path: '/downloads/empty-storage', name: '空字符串存储', storage: '' }),
        createDirectory({ download_path: '/downloads/remote', name: '重复目录', storage: 'rclone' }),
        createDirectory({ download_path: undefined, name: '无下载路径' }),
      ],
      downloaders: [{ name: '下载器 A', type: 'qbittorrent' }],
    })

    expect(await screen.findByRole('option', { name: '/downloads/local' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '/downloads/legacy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '/downloads/null-storage' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: ':/downloads/empty-storage' })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: 'rclone:/downloads/remote' })).toHaveLength(1)
    expect(screen.queryByText('undefined:/downloads/legacy')).not.toBeInTheDocument()
    expect(screen.queryByText('null:/downloads/null-storage')).not.toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '下载器 A' })).toBeInTheDocument()
    expect(screen.getByLabelText('保存目录（自动）')).toHaveValue('')
    expect(screen.getByLabelText('下载器（默认）')).toHaveValue('')
  })
})

describe('AddDownloadDialog submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.confirm.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('emits close from the dialog close button', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(events.close).toHaveBeenCalledOnce()
  })

  it('submits a directly entered media ID through v-model', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'bangumi',
      torrent: createTorrent({ media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.type(screen.getByLabelText('Bangumi编号'), '24680')
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: '24680',
      media_source: 'bangumi',
    })
  })

  it('submits download/add with advanced media ID once and clears pending state on success', async () => {
    const deferred = createDeferred<JsonBodyType>()
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', deferred.promise, 200, submitted))
    const torrent = createTorrent({ media_id: undefined, media_source: undefined })
    const user = userEvent.setup()
    const { events } = await renderDialog({
      directories: [createDirectory({ download_path: '/downloads/remote', storage: 'rclone' })],
      downloaders: [{ name: '下载器 A', type: 'qbittorrent' }],
      recognizeSource: 'douban',
      torrent,
    })

    await screen.findByRole('option', { name: '下载器 A' })
    await screen.findByRole('option', { name: 'rclone:/downloads/remote' })
    await user.selectOptions(screen.getByLabelText('下载器（默认）'), '下载器 A')
    await user.selectOptions(screen.getByLabelText('保存目录（自动）'), 'rclone:/downloads/remote')
    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.click(screen.getByRole('button', { name: '查询媒体编号' }))
    await user.click(screen.getByRole('button', { name: '选择媒体编号' }))
    const submitButton = screen.getByRole('button', { name: '开始下载' })
    await user.click(submitButton)

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toEqual({
      downloader: '下载器 A',
      media_id: '1295644',
      media_source: 'douban',
      save_path: 'rclone:/downloads/remote',
      torrent_in: torrent,
    })
    expect(submitButton).toBeDisabled()
    expect(submitButton).toHaveTextContent('下载中...')
    await user.click(submitButton)
    expect(submitted).toHaveBeenCalledOnce()
    expect(mocks.startNProgress).toHaveBeenCalledOnce()

    deferred.resolve({ data: null, success: true })
    await waitFor(() => expect(events.done).toHaveBeenCalledWith(torrent.enclosure))

    expect(mocks.toastSuccess).toHaveBeenCalledWith('测试站 测试种子 下载成功！')
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(submitButton).not.toBeDisabled()
  })

  it('submits the selected album namespace for a music torrent without media context', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({
        category: '音乐',
        media_id: undefined,
        media_source: undefined,
        title: '周杰伦 - 叶惠美 FLAC',
      }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.selectOptions(screen.getByLabelText('音乐实体'), 'album')
    await user.type(screen.getByLabelText('MusicBrainz ID'), '977e6978-139d-425c-bb98-6b0c62d1e45e')
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
      media_source: 'musicbrainz',
      music_type: 'album',
    })
  })

  it('defaults a music torrent to the MusicBrainz source and music type', async () => {
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({ category: '音乐', media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))

    expect(screen.getByLabelText('类型')).toHaveValue('音乐')
    expect(screen.getByLabelText('数据源')).toHaveValue('musicbrainz')
    expect(screen.getByLabelText('音乐实体')).toBeInTheDocument()
    expect(screen.getByLabelText('MusicBrainz ID')).toBeEnabled()
  })

  it('switches the source to MusicBrainz and reveals the entity selector when the music type is picked', async () => {
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({ category: 'movie', media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.selectOptions(screen.getByLabelText('类型'), '音乐')

    expect(screen.getByLabelText('数据源')).toHaveValue('musicbrainz')
    expect(screen.getByLabelText('音乐实体')).toBeInTheDocument()
    expect(screen.getByLabelText('MusicBrainz ID')).toBeEnabled()
  })

  it('switches the type to music when a music source is selected manually', async () => {
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({ category: 'movie', media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.selectOptions(screen.getByLabelText('数据源'), 'musicbrainz')

    expect(screen.getByLabelText('类型')).toHaveValue('音乐')
    expect(screen.getByLabelText('音乐实体')).toBeInTheDocument()
  })

  it('keeps the media ID disabled until a media type is selected', async () => {
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({ category: '合集', media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))

    expect(screen.getByLabelText('类型')).toHaveValue('')
    expect(screen.getByLabelText('TheMovieDb编号')).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('类型'), '电影')
    expect(screen.getByLabelText('TheMovieDb编号')).toBeEnabled()
  })

  it('clears a stale media ID when the source is switched to avoid reusing the number', async () => {
    const user = userEvent.setup()

    await renderDialog({
      recognizeSource: 'themoviedb',
      torrent: createTorrent({ category: 'movie', media_id: undefined, media_source: undefined }),
    })

    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.type(screen.getByLabelText('TheMovieDb编号'), '6001')
    await user.selectOptions(screen.getByLabelText('数据源'), 'bangumi')

    expect(screen.getByLabelText('Bangumi编号')).toHaveValue('')
  })

  it('uses the source-native identity carried by a torrent without auxiliary ID fallback', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/add', { data: null, success: true }, 200, submitted))
    const torrent = createTorrent({ media_id: 'tt0111161', media_source: 'imdb' })
    const user = userEvent.setup()

    await renderDialog({ torrent })
    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: 'tt0111161',
      media_source: 'imdb',
    })
  })

  it('uses download/ for an existing media without locking unrelated optional fields', async () => {
    const submitted = vi.fn()
    server.use(downloadHandler('download/', { data: null, success: true }, 200, submitted))
    const media = createMedia()
    const torrent = createTorrent()
    const user = userEvent.setup()
    const { events } = await renderDialog({ media, torrent })

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      downloader: null,
      media_in: media,
      save_path: null,
      torrent_in: torrent,
    })
    expect(events.done).toHaveBeenCalledWith(torrent.enclosure)
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
  })

  it('retries an unrecognized download after confirmation', async () => {
    const submitted: Array<Record<string, unknown>> = []
    server.use(
      http.post(new URL('download/add', API_BASE_URL).href, async ({ request }) => {
        submitted.push((await request.json()) as Record<string, unknown>)
        if (submitted.length === 1) {
          return HttpResponse.json({
            data: { requires_confirmation: true },
            message: '无法识别媒体信息',
            success: false,
          })
        }
        return HttpResponse.json({ data: { download_id: 'collection-download' }, success: true })
      }),
    )
    mocks.confirm.mockResolvedValue(true)
    const user = userEvent.setup()
    const { events, torrent } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.done).toHaveBeenCalledWith(torrent.enclosure))
    expect(mocks.confirm).toHaveBeenCalledWith({
      type: 'warn',
      title: '无法识别媒体信息',
      content: '无法识别此资源的媒体信息，是否仍要下载？',
      confirmText: '继续下载',
    })
    expect(submitted).toHaveLength(2)
    expect(submitted[0]).not.toHaveProperty('allow_unrecognized')
    expect(submitted[1]).toEqual({
      ...submitted[0],
      allow_unrecognized: true,
    })
    expect(events.error).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('测试站 测试种子 下载成功！')
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
  })

  it('keeps the download dialog open when unrecognized download confirmation is cancelled', async () => {
    const submitted = vi.fn()
    server.use(
      downloadHandler(
        'download/add',
        { data: { requires_confirmation: true }, message: '无法识别媒体信息', success: false },
        200,
        submitted,
      ),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(submitted).toHaveBeenCalledOnce()
    expect(events.done).not.toHaveBeenCalled()
    expect(events.error).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })

  it('treats success:false at HTTP 200 as a business failure', async () => {
    server.use(downloadHandler('download/add', { data: null, message: '下载器拒绝任务', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(events.error).toHaveBeenCalledWith('下载器拒绝任务'))
    expect(events.done).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('测试站 测试种子 下载失败：下载器拒绝任务！')
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })

  it('clears loading and progress after an HTTP failure without emitting done', async () => {
    server.use(downloadHandler('download/add', { message: '服务异常', success: false }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '开始下载' }))

    await waitFor(() => expect(mocks.doneNProgress).toHaveBeenCalledOnce())
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(events.done).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '开始下载' })).not.toBeDisabled()
  })
})
