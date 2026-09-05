import type {
  ApiResponse,
  FileItem,
  ManualTransferTargetPathData,
  ManualTransferTargetPathRequest,
  StorageConf,
  TransferDirectoryConf,
} from '@/api/types'
import ReorganizeDialog from '@/components/dialog/ReorganizeDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_BASE_URL = 'http://localhost/api/v1/'
let initializationRequestCount = 0

const mocks = vi.hoisted(() => ({
  progressControllers: [] as Array<{
    active: unknown
    handler: (event: MessageEvent) => void
    key: string
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    url: string
  }>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useProgressSSE: (url: string, handler: (event: MessageEvent) => void, key: string, active: unknown) => {
      const controller = {
        active,
        handler,
        key,
        start: vi.fn(),
        stop: vi.fn(),
        url,
      }
      mocks.progressControllers.push(controller)
      return controller
    },
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

const DialogStub = defineComponent({
  name: 'VDialog',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { role: 'dialog' }, slots.default?.()) : null)
  },
})

type SelectItem = string | number | { title: string; value: unknown }

const SelectStub = defineComponent({
  name: 'NativeSelectStub',
  props: {
    items: { type: Array as PropType<SelectItem[]>, default: () => [] },
    label: String,
    modelModifiers: { type: Object as PropType<Record<string, boolean>>, default: () => ({}) },
    modelValue: { default: null },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const itemLabel = (item: SelectItem) => (typeof item === 'object' ? item.title : String(item))
    const itemValue = (item: SelectItem) => (typeof item === 'object' ? item.value : item)

    return () => {
      const selectedIndex = props.items.findIndex(item => itemValue(item) === props.modelValue)
      return h('label', [
        props.label,
        h(
          'select',
          {
            'aria-label': props.label,
            'onChange': (event: Event) => {
              const index = Number((event.target as HTMLSelectElement).value)
              const value = itemValue(props.items[index])
              emit('update:modelValue', props.modelModifiers.number ? Number(value) : value)
            },
            'value': selectedIndex >= 0 ? String(selectedIndex) : '',
          },
          props.items.map((item, index) =>
            h('option', { key: `${itemLabel(item)}-${index}`, value: String(index) }, itemLabel(item)),
          ),
        ),
      ])
    }
  },
})

const TextFieldStub = defineComponent({
  name: 'NativeTextFieldStub',
  props: {
    appendInnerIcon: String,
    label: String,
    modelModifiers: { type: Object as PropType<Record<string, boolean>>, default: () => ({}) },
    modelValue: { default: '' },
  },
  emits: ['click:append-inner', 'update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('label', [
        props.label,
        h('input', {
          'aria-label': props.label,
          'onInput': (event: Event) => {
            const value = (event.target as HTMLInputElement).value
            emit('update:modelValue', props.modelModifiers.number ? Number(value) : value)
          },
          'value': props.modelValue ?? '',
        }),
        props.appendInnerIcon
          ? h(
              'button',
              {
                onClick: () => emit('click:append-inner'),
                type: 'button',
              },
              '查询媒体编号',
            )
          : null,
        slots['append-inner']?.(),
      ])
  },
})

const SwitchStub = defineComponent({
  name: 'NativeSwitchStub',
  props: {
    label: String,
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('label', [
        h('input', {
          'aria-label': props.label,
          'checked': props.modelValue,
          'onChange': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
          'type': 'checkbox',
        }),
        props.label,
      ])
  },
})

const IconButtonStub = defineComponent({
  name: 'IconBtn',
  props: {
    disabled: Boolean,
    icon: String,
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () =>
      h(
        'button',
        {
          'aria-label': props.icon,
          disabled: props.disabled,
          onClick: (event: MouseEvent) => emit('click', event),
          type: 'button',
        },
        props.icon,
      )
  },
})

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { onClick: () => emit('click'), type: 'button' }, '关闭')
  },
})

const TooltipStub = defineComponent({
  name: 'VTooltip',
  setup(_props, { slots }) {
    return () => h('span', [slots.activator?.({ props: {} }), slots.default?.()])
  },
})

const ProgressDialogStub = defineComponent({
  name: 'ProgressDialog',
  props: {
    text: String,
    value: Number,
  },
  setup(props) {
    return () => h('div', { 'data-testid': 'transfer-progress' }, `${props.text}:${props.value}`)
  },
})

const MediaIdSelectorStub = defineComponent({
  name: 'MediaIdSelector',
  emits: ['close', 'select', 'update:modelValue'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          onClick: () => {
            emit('update:modelValue', '600')
            emit('select', { type: 'tv' })
            emit('close')
          },
          type: 'button',
        },
        '选择电视剧',
      )
  },
})

function createFileItem(overrides: Partial<FileItem> = {}): FileItem {
  return {
    name: 'Movie.mkv',
    path: '/downloads/Movie.mkv',
    storage: 'local',
    type: 'file',
    ...overrides,
  }
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

/** 构造后端网络层使用的严格三段式响应。 */
function apiEnvelope<T>(data: T | null, success = true, message = ''): ApiResponse<T> {
  return { data, message, success }
}

function publicSettingHandlers({
  directories = [],
  episodeRules = [],
  onTargetPathRequest,
  storages = [],
  targetPathMatch = {},
  targetPathStatus = 200,
}: {
  directories?: TransferDirectoryConf[]
  episodeRules?: unknown[]
  onTargetPathRequest?: (payload: ManualTransferTargetPathRequest) => void
  storages?: StorageConf[]
  targetPathMatch?: ManualTransferTargetPathData
  targetPathStatus?: number
} = {}) {
  return [
    http.get(new URL('storage/directories', API_BASE_URL).href, () => {
      initializationRequestCount += 1
      return HttpResponse.json(apiEnvelope(directories))
    }),
    http.get(new URL('storage/options', API_BASE_URL).href, () => {
      initializationRequestCount += 1
      return HttpResponse.json(apiEnvelope(storages))
    }),
    http.get(new URL('system/setting/public/EpisodeFormatRuleTable', API_BASE_URL).href, () => {
      initializationRequestCount += 1
      return HttpResponse.json(apiEnvelope({ value: episodeRules }))
    }),
    http.post(new URL('transfer/manual/history', API_BASE_URL).href, () => {
      initializationRequestCount += 1
      return HttpResponse.json(apiEnvelope({ history_count: 0, reorganize: false }))
    }),
    http.post(new URL('transfer/manual/target-path', API_BASE_URL).href, async ({ request }) => {
      onTargetPathRequest?.((await request.json()) as ManualTransferTargetPathRequest)
      if (targetPathStatus >= 400) {
        return HttpResponse.json({ detail: 'target path unavailable' }, { status: targetPathStatus })
      }
      return HttpResponse.json(apiEnvelope(targetPathMatch))
    }),
  ]
}

async function renderDialog({
  directories = [],
  episodeRules = [],
  items,
  logids,
  onClose = vi.fn(),
  onDone = vi.fn(),
  onTargetPathRequest,
  storages = [],
  targetPath,
  targetPathMatch = {},
  targetPathStatus = 200,
  targetStorage,
}: {
  directories?: TransferDirectoryConf[]
  episodeRules?: unknown[]
  items?: FileItem[]
  logids?: number[]
  onClose?: ReturnType<typeof vi.fn>
  onDone?: ReturnType<typeof vi.fn>
  onTargetPathRequest?: (payload: ManualTransferTargetPathRequest) => void
  storages?: StorageConf[]
  targetPath?: string
  targetPathMatch?: ManualTransferTargetPathData
  targetPathStatus?: number
  targetStorage?: string
} = {}) {
  const resolvedItems = items ?? (logids?.length ? [] : [createFileItem()])
  server.use(
    ...publicSettingHandlers({
      directories,
      episodeRules,
      onTargetPathRequest,
      storages,
      targetPathMatch,
      targetPathStatus,
    }),
  )
  const result = await renderWithProviders(ReorganizeDialog, {
    global: {
      stubs: {
        IconBtn: IconButtonStub,
        MediaIdSelector: MediaIdSelectorStub,
        ProgressDialog: ProgressDialogStub,
        VCombobox: SelectStub,
        VDialog: DialogStub,
        VDialogCloseBtn: DialogCloseButtonStub,
        VSelect: SelectStub,
        VSwitch: SwitchStub,
        VTextField: TextFieldStub,
        VTooltip: TooltipStub,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          RECOGNIZE_SOURCE: 'themoviedb',
        },
      },
    },
    props: {
      items: resolvedItems,
      logids,
      modelValue: true,
      onClose,
      onDone,
      target_path: targetPath,
      target_storage: targetStorage,
    },
  })

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /立即整理|重新整理/ })).toBeInTheDocument()
  })
  await waitFor(() => {
    expect(initializationRequestCount).toBe(logids?.length || !resolvedItems.length ? 3 : 4)
  })

  return { ...result, onClose, onDone }
}

function previewResponse(
  items: Array<{
    message?: string
    source: string
    success: boolean
    target: string
    title?: string
    type?: string
  }>,
  message = '',
) {
  return {
    data: {
      items,
      message,
      summary: {
        failed: items.filter(item => !item.success).length,
        success: items.filter(item => item.success).length,
        total: items.length,
      },
    },
    message: '',
    success: true,
  }
}

async function selectOption(label: string, index: number) {
  await fireEvent.change(screen.getByLabelText(label), { target: { value: String(index) } })
}

describe('ReorganizeDialog submission safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initializationRequestCount = 0
    mocks.progressControllers.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('keeps the dialog open when the backend reports a business failure', async () => {
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () =>
        HttpResponse.json(apiEnvelope(null, false, '整理失败')),
      ),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '立即整理' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理失败'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows a fallback error when a business failure has no message', async () => {
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () => HttpResponse.json(apiEnvelope(null, false))),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '立即整理' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('整理请求失败'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when the transfer request fails over HTTP', async () => {
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () =>
        HttpResponse.json({ detail: 'server error' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '立即整理' }))

    await waitFor(() => expect(screen.queryByTestId('transfer-progress')).not.toBeInTheDocument())
    expect(onDone).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
  })

  it('coalesces repeated submit clicks while a transfer request is pending', async () => {
    const response = createDeferred<ApiResponse<null>>()
    let requestCount = 0
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async () => {
        requestCount += 1
        return HttpResponse.json(await response.promise)
      }),
    )
    const { onDone } = await renderDialog()
    const submitButton = screen.getByRole('button', { name: '立即整理' })

    await fireEvent.click(submitButton)
    await fireEvent.click(submitButton)

    await waitFor(() => expect(requestCount).toBe(1))
    response.resolve(apiEnvelope(null))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('does not submit or finish when log ids and file items are both empty', async () => {
    let requestCount = 0
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () => {
        requestCount += 1
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({ items: [], logids: [] })

    await user.click(screen.getByRole('button', { name: '立即整理' }))

    expect(requestCount).toBe(0)
    expect(onDone).not.toHaveBeenCalled()
  })
})

describe('ReorganizeDialog payloads and lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initializationRequestCount = 0
    mocks.progressControllers.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('shows automatic defaults when media type and source are unset', async () => {
    await renderDialog()

    expect(screen.getByLabelText<HTMLSelectElement>('类型')).toHaveDisplayValue('自动')
    expect(screen.getByLabelText<HTMLSelectElement>('数据源')).toHaveDisplayValue('自动')
  })

  it('resets the data source to auto and hides the media id input after switching media type', async () => {
    await renderDialog()

    // 类型为自动时隐藏媒体ID输入框
    expect(screen.queryByLabelText('TheMovieDb编号')).not.toBeInTheDocument()

    // 切换到音乐：显示媒体ID输入框，数据源保持自动（音乐由媒体ID标签兜底为 MusicBrainz）
    await selectOption('类型', 3)
    await waitFor(() => expect(screen.getByLabelText('MusicBrainz ID')).toBeInTheDocument())
    expect(screen.getByLabelText<HTMLSelectElement>('数据源')).toHaveDisplayValue('自动')

    // 切回电影：数据源自动回退为自动，媒体ID输入框随类型重新显示
    await selectOption('类型', 1)
    await waitFor(() => expect(screen.getByLabelText('TheMovieDb编号')).toBeInTheDocument())
    expect(screen.getByLabelText<HTMLSelectElement>('数据源')).toHaveDisplayValue('自动')
  })

  it('resets a stale music source back to auto when switching away from music type', async () => {
    await renderDialog()

    // 先手动选择音乐源（触发类型联动为音乐）
    await selectOption('数据源', 5)
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('类型')).toHaveDisplayValue('音乐'))

    // 切回电影后，音乐源不应残留
    await selectOption('类型', 1)
    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('数据源')).toHaveDisplayValue('自动'))
    expect(screen.getByLabelText<HTMLSelectElement>('类型')).toHaveDisplayValue('电影')
  })

  it('deduplicates selected files and submits nullable automatic target fields in one background request', async () => {
    const bodies: unknown[] = []
    const backgrounds: string[] = []
    const first = createFileItem({ name: 'Episode 1.mkv', path: '/downloads/Episode 1.mkv' })
    const second = createFileItem({ name: 'Episode 2.mkv', path: '/downloads/Episode 2.mkv' })
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        backgrounds.push(new URL(request.url).searchParams.get('background') ?? '')
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({ items: [first, first, second] })

    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(backgrounds).toEqual(['true'])
    expect(bodies).toEqual([
      expect.objectContaining({
        episode_group: null,
        fileitems: [first, second],
        target_path: null,
        target_storage: null,
        transfer_type: null,
      }),
    ])
    expect(bodies[0]).not.toHaveProperty('fileitem')
    expect(bodies[0]).not.toHaveProperty('media_id')
    expect(bodies[0]).not.toHaveProperty('media_source')
    expect(mocks.progressControllers).toHaveLength(0)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('文件 共 2 项 已加入整理队列！')
  })

  it('submits mixed file and directory items separately and rotates synchronous progress streams', async () => {
    const bodies: unknown[] = []
    const directory = createFileItem({ name: 'Series', path: '/downloads/Series', type: 'dir' })
    const file = createFileItem({ name: 'Movie.mkv', path: '/downloads/Movie.mkv' })
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({ items: [directory, file] })

    await user.click(screen.getByRole('button', { name: '立即整理' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([
      expect.objectContaining({ fileitem: directory, logid: 0 }),
      expect.objectContaining({ fileitem: file, logid: 0 }),
    ])
    expect(mocks.progressControllers).toHaveLength(2)
    expect(mocks.progressControllers[0].key).toBe('reorganize-progress-filetransfer')
    expect(mocks.progressControllers[0].start).toHaveBeenCalledTimes(1)
    expect(mocks.progressControllers[0].stop).toHaveBeenCalledTimes(1)
    expect(mocks.progressControllers[1].start).toHaveBeenCalledTimes(1)
    expect(mocks.progressControllers[1].stop).toHaveBeenCalledTimes(1)
  })

  it('submits each historical record with reorganize semantics', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({ logids: [41, 42] })

    expect(screen.getByRole('button', { name: '重新整理' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(bodies).toEqual([
      expect.objectContaining({
        fileitem: {},
        from_history: false,
        logid: 41,
        reorganize: true,
        target_path: null,
        target_storage: null,
      }),
      expect.objectContaining({
        fileitem: {},
        from_history: false,
        logid: 42,
        reorganize: true,
        target_path: null,
        target_storage: null,
      }),
    ])
    expect(mocks.toastSuccess).toHaveBeenNthCalledWith(1, '历史记录 41 已加入整理队列！')
    expect(mocks.toastSuccess).toHaveBeenNthCalledWith(2, '历史记录 42 已加入整理队列！')
  })

  it('updates synchronous progress from SSE and always stops it after success', async () => {
    const response = createDeferred<ApiResponse<null>>()
    let payload: unknown
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json(await response.promise)
      }),
    )
    const { onDone } = await renderDialog()

    await fireEvent.click(screen.getByRole('button', { name: '立即整理' }))
    await waitFor(() => expect(mocks.progressControllers).toHaveLength(1))
    mocks.progressControllers[0].handler(
      new MessageEvent('message', {
        data: JSON.stringify({ text: 'fallback', text_i18n: '正在写入媒体库', value: 65 }),
      }),
    )
    await waitFor(() => expect(screen.getByTestId('transfer-progress')).toHaveTextContent('正在写入媒体库:65'))

    response.resolve(apiEnvelope(null))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(payload).toEqual(
      expect.objectContaining({
        fileitems: [expect.objectContaining({ path: '/downloads/Movie.mkv' })],
        target_path: null,
        target_storage: null,
      }),
    )
    expect(mocks.progressControllers[0].stop).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('transfer-progress')).not.toBeInTheDocument()
  })

  it('stops the active progress stream when unmounted during a request', async () => {
    const response = createDeferred<ApiResponse<null>>()
    const requestCompleted = createDeferred<void>()
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async () => {
        const body = await response.promise
        requestCompleted.resolve()
        return HttpResponse.json(body)
      }),
    )
    const { unmount } = await renderDialog()

    await fireEvent.click(screen.getByRole('button', { name: '立即整理' }))
    await waitFor(() => expect(mocks.progressControllers).toHaveLength(1))
    unmount()

    expect(mocks.progressControllers[0].stop).toHaveBeenCalledTimes(1)
    response.resolve(apiEnvelope(null))
    await requestCompleted.promise
    await new Promise(resolve => setTimeout(resolve, 0))
  })

  it('applies a configured library target and can reset every derived field back to automatic', async () => {
    const bodies: unknown[] = []
    const directory: TransferDirectoryConf = {
      library_category_folder: true,
      library_path: '/library/tv',
      library_storage: 'rclone',
      library_type_folder: true,
      name: '电视剧目录',
      priority: 1,
      scraping: true,
      storage: 'local',
      transfer_type: 'copy',
    }
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({
      directories: [directory],
      storages: [{ name: '远程存储', type: 'rclone' }],
    })

    expect(screen.getByRole('option', { name: '远程存储' })).toBeInTheDocument()
    await selectOption('目的路径', 1)
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))
    await waitFor(() => expect(bodies).toHaveLength(1))

    expect(bodies[0]).toEqual(
      expect.objectContaining({
        library_category_folder: true,
        library_type_folder: true,
        scrape: true,
        target_path: '/library/tv',
        target_storage: 'rclone',
        transfer_type: 'copy',
      }),
    )

    await selectOption('目的路径', 0)
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual(
      expect.objectContaining({
        library_category_folder: null,
        library_type_folder: null,
        scrape: null,
        target_path: null,
        target_storage: null,
        transfer_type: null,
      }),
    )
  })

  it('previews and explicitly applies the backend matched target path', async () => {
    const bodies: unknown[] = []
    const targetRequests: ManualTransferTargetPathRequest[] = []
    const directory: TransferDirectoryConf = {
      library_category_folder: true,
      library_path: '/library/tv',
      library_storage: 'rclone',
      library_type_folder: true,
      name: '电视剧目录',
      priority: 1,
      scraping: true,
      storage: 'local',
      transfer_type: 'copy',
    }
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({
      directories: [directory],
      onTargetPathRequest: payload => targetRequests.push(payload),
      storages: [{ name: '远程存储', type: 'rclone' }],
      targetPathMatch: {
        library_category_folder: true,
        library_type_folder: true,
        scrape: true,
        target_path: '/library/tv',
        target_storage: 'rclone',
        transfer_type: 'copy',
      },
    })

    expect(await screen.findByText('自动匹配到 远程存储 · /library/tv')).toBeInTheDocument()
    expect(targetRequests).toEqual([
      {
        fileitem: expect.objectContaining({ path: '/downloads/Movie.mkv' }),
        target_storage: null,
      },
    ])
    await user.click(screen.getByRole('button', { name: '使用匹配路径' }))
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        library_category_folder: true,
        library_type_folder: true,
        scrape: true,
        target_path: '/library/tv',
        target_storage: 'rclone',
        transfer_type: 'copy',
      }),
    )
  })

  it('does not request or overwrite an explicit target path', async () => {
    const bodies: unknown[] = []
    const targetRequest = vi.fn()
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({
      onTargetPathRequest: targetRequest,
      targetPath: '/custom/library',
      targetStorage: 'local',
    })

    expect(screen.queryByText(/自动匹配到/)).not.toBeInTheDocument()
    expect(targetRequest).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        target_path: '/custom/library',
        target_storage: 'local',
      }),
    )
  })

  it('keeps manual organization available when target path matching fails', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({ targetPathStatus: 503 })

    expect(await screen.findByText('无法预览自动目的路径，不影响手动选择或整理')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toEqual(expect.objectContaining({ target_path: null, target_storage: null }))
  })

  it('submits media selection, episode group, episode formatting, and folder options from the form', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(new URL('media/groups/600', API_BASE_URL).href, () =>
        HttpResponse.json(apiEnvelope([{ episode_count: 12, group_count: 1, id: 'group-1', name: '播出顺序' }])),
      ),
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog()

    // 类型为自动时媒体ID输入框隐藏，先选择类型再查询媒体编号
    await selectOption('类型', 2)
    await user.click(screen.getByRole('button', { name: '查询媒体编号' }))
    await user.click(screen.getByRole('button', { name: '选择电视剧' }))
    await waitFor(() => expect(screen.getByRole('option', { name: '播出顺序' })).toBeInTheDocument())
    await selectOption('类型', 2)
    await selectOption('剧集组', 1)
    await selectOption('季', 2)
    await fireEvent.input(screen.getByLabelText('集'), { target: { value: '1-3' } })
    await fireEvent.input(screen.getByLabelText('集数定位'), { target: { value: '{season_episode}' } })
    await fireEvent.input(screen.getByLabelText('集数偏移'), { target: { value: 'EP+1' } })
    await fireEvent.input(screen.getByLabelText('指定Part'), { target: { value: 'part2' } })
    await fireEvent.input(screen.getByLabelText('最小文件大小（MB）'), { target: { value: '128' } })
    await user.click(screen.getByLabelText('按类型分类'))
    await user.click(screen.getByLabelText('按类别分类'))
    await user.click(screen.getByLabelText('刮削元数据'))
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        episode_detail: '1-3',
        episode_format: '{season_episode}',
        episode_group: 'group-1',
        episode_offset: 'EP+1',
        episode_part: 'part2',
        library_category_folder: true,
        library_type_folder: true,
        media_id: '600',
        media_source: 'themoviedb',
        min_filesize: 128,
        scrape: true,
        season: 2,
        type_name: '电视剧',
      }),
    )

    await selectOption('数据源', 2)
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual(
      expect.objectContaining({
        episode_group: null,
      }),
    )
    expect(bodies[1]).not.toHaveProperty('media_id')
    expect(bodies[1]).not.toHaveProperty('media_source')
  })

  it('submits an explicit music entity namespace for manual transfer', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({
      items: [createFileItem({ name: '叶惠美', path: '/downloads/叶惠美', type: 'dir' })],
    })

    await selectOption('类型', 3)
    await waitFor(() => expect(screen.getByLabelText('MusicBrainz ID')).toBeInTheDocument())
    expect(screen.getByLabelText<HTMLSelectElement>('音乐实体')).toHaveDisplayValue('专辑')
    await fireEvent.input(screen.getByLabelText('MusicBrainz ID'), {
      target: { value: '977e6978-139d-425c-bb98-6b0c62d1e45e' },
    })
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual(
      expect.objectContaining({
        media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
        media_source: 'musicbrainz',
        music_type: 'album',
        type_name: '音乐',
      }),
    )
  })

  it('defaults a selected audio file to the recording namespace', async () => {
    await renderDialog({
      items: [createFileItem({ name: '晴天.flac', path: '/downloads/晴天.flac' })],
    })

    await selectOption('类型', 3)

    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>('音乐实体')).toHaveDisplayValue('单曲'))
  })

  it('recommends an episode format and includes it in the next request', async () => {
    const recommendationBodies: unknown[] = []
    const transferBodies: unknown[] = []
    server.use(
      http.post(new URL('transfer/episode-format/recommend', API_BASE_URL).href, async ({ request }) => {
        recommendationBodies.push(await request.json())
        return HttpResponse.json({
          data: {
            episode_format: '{season_episode}',
            message: '已匹配',
            pattern: 'S(\\d+)E(\\d+)',
            rule_name: '标准季集',
            sample_file: 'Movie.mkv',
          },
          message: '',
          success: true,
        })
      }),
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        transferBodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({ episodeRules: [{ name: '标准季集' }] })

    await selectOption('类型', 2)
    await user.click(screen.getByRole('button', { name: 'mdi-auto-fix' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('已生成集数定位模板'))
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    expect(recommendationBodies).toEqual([
      {
        fileitem: expect.objectContaining({ path: '/downloads/Movie.mkv' }),
      },
    ])
    await waitFor(() => expect(transferBodies).toHaveLength(1))
    expect(transferBodies[0]).toEqual(expect.objectContaining({ episode_format: '{season_episode}' }))
  })

  it('emits close and submits the historical recognition preference', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(apiEnvelope(null))
      }),
    )
    const user = userEvent.setup()
    const { onClose } = await renderDialog({ logids: [41] })

    await user.click(screen.getByLabelText('复用历史识别信息'))
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await user.click(screen.getByRole('button', { name: '加入整理队列' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual(expect.objectContaining({ from_history: true, logid: 41 }))
  })
})

describe('ReorganizeDialog preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initializationRequestCount = 0
    mocks.progressControllers.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('keeps partial preview failures as successful response data', async () => {
    const payloads: unknown[] = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        payloads.push(await request.json())
        return HttpResponse.json(
          previewResponse(
            [
              {
                source: '/downloads/Episode 1.mkv',
                success: true,
                target: '/library/Series/S01E01.mkv',
                title: 'Series',
                type: '电视剧',
              },
              {
                message: '未识别到集数',
                source: '/downloads/Episode 2.mkv',
                success: false,
                target: '',
                title: 'Series',
                type: '电视剧',
              },
            ],
            '部分文件无法整理',
          ),
        )
      }),
    )
    const user = userEvent.setup()
    const { onDone } = await renderDialog({
      items: [
        createFileItem({ name: 'Episode 1.mkv', path: '/downloads/Episode 1.mkv' }),
        createFileItem({ name: 'Episode 2.mkv', path: '/downloads/Episode 2.mkv' }),
      ],
    })

    await user.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText('部分文件无法整理')).toBeInTheDocument()
    expect(screen.getByText('总数 2')).toBeInTheDocument()
    expect(screen.getByText('成功 1')).toBeInTheDocument()
    expect(screen.getByText('失败 1')).toBeInTheDocument()
    expect(screen.getByText('未识别到集数')).toBeInTheDocument()
    expect(payloads).toEqual([
      expect.objectContaining({
        fileitems: expect.arrayContaining([
          expect.objectContaining({ path: '/downloads/Episode 1.mkv' }),
          expect.objectContaining({ path: '/downloads/Episode 2.mkv' }),
        ]),
        preview: true,
      }),
    ])
    expect(mocks.toastWarning).toHaveBeenCalledWith('成功 1，失败 1')
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('merges and deduplicates preview results from separate source requests', async () => {
    const payloads: Array<Record<string, unknown>> = []
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, async ({ request }) => {
        const payload = (await request.json()) as Record<string, unknown>
        payloads.push(payload)
        const source = (payload.fileitem as FileItem).path
        return HttpResponse.json(
          previewResponse([
            {
              source: '/downloads/shared.nfo',
              success: true,
              target: '/library/shared.nfo',
            },
            {
              source,
              success: true,
              target: `/library/${(payload.fileitem as FileItem).name}`,
            },
          ]),
        )
      }),
    )
    const user = userEvent.setup()
    await renderDialog({
      items: [
        createFileItem({ name: 'Series', path: '/downloads/Series', type: 'dir' }),
        createFileItem({ name: 'Movie.mkv', path: '/downloads/Movie.mkv' }),
      ],
    })

    await user.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText('总数 3')).toBeInTheDocument()
    expect(screen.getByText('成功 3')).toBeInTheDocument()
    expect(screen.getByText('失败 0')).toBeInTheDocument()
    expect(screen.getAllByText('shared.nfo')).toHaveLength(2)
    expect(payloads).toHaveLength(2)
    expect(payloads).toEqual([
      expect.objectContaining({ fileitem: expect.objectContaining({ type: 'dir' }), preview: true }),
      expect.objectContaining({ fileitem: expect.objectContaining({ type: 'file' }), preview: true }),
    ])
  })

  it('summarizes a business-level preview failure without closing the preview', async () => {
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () =>
        HttpResponse.json(apiEnvelope(null, false, '目标目录不可用')),
      ),
    )
    const user = userEvent.setup()
    await renderDialog()

    await user.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByText('总数 1')).toBeInTheDocument()
    expect(screen.getByText('成功 0')).toBeInTheDocument()
    expect(screen.getByText('失败 1')).toBeInTheDocument()
    expect(screen.getAllByText('目标目录不可用')).toHaveLength(2)
    expect(mocks.toastWarning).toHaveBeenCalledWith('成功 0，失败 1')
  })

  it('does not treat empty log ids and file items as a successful empty preview', async () => {
    let requestCount = 0
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () => {
        requestCount += 1
        return HttpResponse.json(previewResponse([]))
      }),
    )
    const user = userEvent.setup()
    await renderDialog({ items: [], logids: [] })

    await user.click(screen.getByRole('button', { name: '预览' }))

    expect(requestCount).toBe(0)
    expect(screen.queryByText('总数 0')).not.toBeInTheDocument()
    expect(screen.queryByText('成功 0')).not.toBeInTheDocument()
    expect(screen.queryByText('失败 0')).not.toBeInTheDocument()
  })

  it('pages through long preview results and can collapse the preview again', async () => {
    const items = Array.from({ length: 21 }, (_, index) => ({
      source: `/downloads/Episode ${index + 1}.mkv`,
      success: true,
      target: `/library/Episode ${index + 1}.mkv`,
    }))
    server.use(
      http.post(new URL('transfer/manual', API_BASE_URL).href, () => HttpResponse.json(previewResponse(items))),
    )
    const user = userEvent.setup()
    const { container } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '预览' }))
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    const paginationButtons = container.querySelectorAll('.reorganize-preview-pane__pagination button')
    expect(paginationButtons).toHaveLength(2)

    await fireEvent.click(paginationButtons[1])
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(screen.getAllByText('Episode 21.mkv')).toHaveLength(2)

    await fireEvent.click(paginationButtons[0])
    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预览' }))
    expect(screen.getByRole('button', { name: '预览' })).not.toHaveClass('reorganize-action-btn--active')
  })
})
