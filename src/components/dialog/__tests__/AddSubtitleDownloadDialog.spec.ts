import type { MediaDataSource, SubtitleInfo, TransferDirectoryConf } from '@/api/types'
import AddSubtitleDownloadDialog from '@/components/dialog/AddSubtitleDownloadDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'

const mocks = vi.hoisted(() => ({
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

const SelectStub = defineComponent({
  name: 'NativeSelectStub',
  props: {
    items: { type: Array as PropType<Array<string | { title: string; value: string }>>, default: () => [] },
    label: String,
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
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
            ...props.items.map(item => {
              const value = typeof item === 'string' ? item : item.value
              const title = typeof item === 'string' ? item : item.title
              return h('option', { key: value, value }, title)
            }),
          ],
        ),
      ])
  },
})

const TextFieldStub = defineComponent({
  name: 'NativeTextFieldStub',
  props: {
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
            emit('update:modelValue', '98765')
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
    download_path: '/subtitles/default',
    name: '字幕目录',
    priority: 0,
    storage: 'local',
    transfer_type: 'link',
    ...overrides,
  }
}

function createSubtitle(overrides: Partial<SubtitleInfo> = {}): SubtitleInfo {
  return {
    enclosure: 'https://subtitle.example/download/goal-6d#mp_sig=signed%2Fvalue%3D&mp_purpose=subtitle-download%3A42',
    language: '简体中文',
    site: 42,
    site_name: '字幕站',
    size: 2048,
    title: '测试字幕',
    uploader: '字幕组',
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

function subtitleDownloadHandler(
  response: JsonBodyType | Promise<JsonBodyType>,
  status = 200,
  onRequest: (body: unknown) => void | Promise<void> = () => {},
) {
  return http.post(new URL('download/subtitle', API_BASE_URL).href, async ({ request }) => {
    await onRequest(await request.json())
    return HttpResponse.json(await response, { status })
  })
}

async function renderDialog({
  directories = [],
  mediaId = '6001',
  mediaSource,
  recognizeSource = 'themoviedb',
  subtitle = createSubtitle(),
}: {
  directories?: TransferDirectoryConf[]
  mediaId?: string | null
  mediaSource?: MediaDataSource
  recognizeSource?: string
  subtitle?: SubtitleInfo
} = {}) {
  const events = {
    close: vi.fn(),
    done: vi.fn(),
    error: vi.fn(),
  }
  server.use(directoriesHandler(directories))
  const result = await renderWithProviders(AddSubtitleDownloadDialog, {
    global: {
      stubs: {
        AppCombobox: SelectStub,
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
      modelValue: true,
      onClose: events.close,
      onDone: events.done,
      onError: events.error,
      mediaId: mediaId ?? undefined,
      mediaSource,
      subtitle,
      title: '测试电影',
    },
  })

  return { ...result, events, subtitle }
}

describe('AddSubtitleDownloadDialog directories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('normalizes local, remote, missing-storage, and duplicate directories while keeping the default empty option', async () => {
    const missingStorage = createDirectory({
      download_path: '/subtitles/legacy',
      name: '兼容目录',
      storage: undefined as unknown as string,
    })
    const nullStorage = createDirectory({ download_path: '/subtitles/null-storage', name: '空存储目录' })
    nullStorage.storage = null as unknown as string

    await renderDialog({
      directories: [
        createDirectory({ download_path: '/subtitles/local' }),
        createDirectory({ download_path: '/subtitles/remote', name: '远程目录', storage: 's3' }),
        missingStorage,
        nullStorage,
        createDirectory({ download_path: '/subtitles/empty-storage', name: '空字符串存储', storage: '' }),
        createDirectory({ download_path: '/subtitles/remote', name: '重复目录', storage: 's3' }),
        createDirectory({ download_path: undefined, name: '无下载路径' }),
      ],
    })

    expect(await screen.findByRole('option', { name: '/subtitles/local' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '/subtitles/legacy' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '/subtitles/null-storage' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: ':/subtitles/empty-storage' })).toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: 's3:/subtitles/remote' })).toHaveLength(1)
    expect(screen.queryByText('undefined:/subtitles/legacy')).not.toBeInTheDocument()
    expect(screen.queryByText('null:/subtitles/null-storage')).not.toBeInTheDocument()
    expect(screen.getByLabelText('保存目录（自动）')).toHaveValue('')
  })
})

describe('AddSubtitleDownloadDialog submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    server.use(subtitleDownloadHandler({ data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({ mediaId: null, recognizeSource: 'douban' })

    await user.type(screen.getByLabelText('豆瓣编号'), '13579')
    await user.click(screen.getByRole('button', { name: '下载字幕' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: '13579',
      media_source: 'douban',
    })
  })

  it('reveals advanced options and submits the selected media source identity', async () => {
    const submitted = vi.fn()
    server.use(subtitleDownloadHandler({ data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({ mediaId: '84', mediaSource: 'themoviedb' })

    expect(screen.getByLabelText('识别数据源')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: '显示高级选项' }))
    await user.selectOptions(screen.getByLabelText('识别数据源'), 'imdb')
    await user.clear(screen.getByLabelText('IMDb ID'))
    await user.type(screen.getByLabelText('IMDb ID'), 'tt0111161')
    await user.click(screen.getByRole('button', { name: '下载字幕' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: 'tt0111161',
      media_source: 'imdb',
    })
  })

  it('preserves the signed enclosure in download/subtitle and prevents duplicate submission', async () => {
    const deferred = createDeferred<JsonBodyType>()
    const submitted = vi.fn()
    server.use(subtitleDownloadHandler(deferred.promise, 200, submitted))
    const subtitle = createSubtitle()
    const expectedEnclosure = subtitle.enclosure
    const user = userEvent.setup()
    const { events } = await renderDialog({
      directories: [createDirectory({ download_path: '/subtitles/remote', storage: 's3' })],
      mediaId: null,
      recognizeSource: 'anilist',
      subtitle,
    })

    await screen.findByRole('option', { name: 's3:/subtitles/remote' })
    await user.selectOptions(screen.getByLabelText('保存目录（自动）'), 's3:/subtitles/remote')
    await user.click(screen.getByRole('button', { name: '查询媒体编号' }))
    await user.click(screen.getByRole('button', { name: '选择媒体编号' }))
    const submitButton = screen.getByRole('button', { name: '下载字幕' })
    await user.click(submitButton)

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toEqual({
      media_id: '98765',
      media_source: 'anilist',
      save_path: 's3:/subtitles/remote',
      subtitle_in: subtitle,
    })
    expect((submitted.mock.calls[0][0] as { subtitle_in: SubtitleInfo }).subtitle_in.enclosure).toBe(expectedEnclosure)
    expect(submitButton).toBeDisabled()
    expect(submitButton).toHaveTextContent('下载中...')
    await user.click(submitButton)
    expect(submitted).toHaveBeenCalledOnce()
    expect(mocks.startNProgress).toHaveBeenCalledOnce()

    deferred.resolve({ data: null, success: true })
    await waitFor(() => expect(events.done).toHaveBeenCalledWith(expectedEnclosure))

    expect(mocks.toastSuccess).toHaveBeenCalledWith('字幕站 测试字幕 字幕下载成功！')
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(submitButton).not.toBeDisabled()
  })

  it('submits the exact-search identity passed by the resource result', async () => {
    const submitted = vi.fn()
    server.use(subtitleDownloadHandler({ data: null, success: true }, 200, submitted))
    const user = userEvent.setup()

    await renderDialog({ mediaId: '84', mediaSource: 'themoviedb', recognizeSource: 'douban' })
    await user.click(screen.getByRole('button', { name: '下载字幕' }))

    await waitFor(() => expect(submitted).toHaveBeenCalledOnce())
    expect(submitted.mock.calls[0][0]).toMatchObject({
      media_id: '84',
      media_source: 'themoviedb',
    })
  })

  it('treats success:false at HTTP 200 as a business failure', async () => {
    server.use(subtitleDownloadHandler({ data: null, message: '签名已过期', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog({ mediaSource: 'themoviedb' })

    await user.click(screen.getByRole('button', { name: '下载字幕' }))

    await waitFor(() => expect(events.error).toHaveBeenCalledWith('签名已过期'))
    expect(events.done).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('字幕站 测试字幕 字幕下载失败：签名已过期！')
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(mocks.doneNProgress).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '下载字幕' })).not.toBeDisabled()
  })

  it('clears loading and progress after an HTTP failure without emitting done', async () => {
    server.use(subtitleDownloadHandler({ message: '服务异常', success: false }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog({ mediaSource: 'themoviedb' })

    await user.click(screen.getByRole('button', { name: '下载字幕' }))

    await waitFor(() => expect(mocks.doneNProgress).toHaveBeenCalledOnce())
    expect(mocks.startNProgress).toHaveBeenCalledOnce()
    expect(events.done).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '下载字幕' })).not.toBeDisabled()
  })
})
