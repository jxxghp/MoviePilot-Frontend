import type { EndPoints, FileItem } from '@/api/types'
import type { DataApiClient } from '@/api'
import FileList from '@/components/filebrowser/FileList.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import type { AxiosRequestConfig } from 'axios'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  keepAliveOptions: undefined as { active?: { value: boolean } } | undefined,
  keepAliveRefresh: undefined as ((context?: { silent?: boolean }) => Promise<void>) | undefined,
  openSharedDialog: vi.fn(),
  progressHandler: undefined as ((event: MessageEvent) => void) | undefined,
  progressStart: vi.fn(),
  progressStop: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useProgressSSE: (_url: string, handler: (event: MessageEvent) => void) => {
      mocks.progressHandler = handler
      return { start: mocks.progressStart, stop: mocks.progressStop }
    },
  }),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: { value: false } }),
}))

vi.mock('@/composables/useAvailableHeight', () => ({
  useAvailableHeight: () => ({ availableHeight: { value: 480 } }),
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: (
    refresh: (context?: { silent?: boolean }) => Promise<void>,
    options: { active?: { value: boolean } },
  ) => {
    mocks.keepAliveRefresh = refresh
    mocks.keepAliveOptions = options
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const IconBtnStub = defineComponent({
  template: '<button type="button"><slot /></button>',
})

const IconStub = defineComponent({
  props: ['icon'],
  template: '<span class="test-icon" :data-icon="icon"><slot /></span>',
})

const HoverStub = defineComponent({
  template: '<div><slot v-bind="{ props: {}, isHovering: true }" /></div>',
})

const VirtualScrollStub = defineComponent({
  props: ['items'],
  template: '<div><slot v-for="item in items" :item="item" /></div>',
})

const ListItemStub = defineComponent({
  template: '<div role="button" class="test-list-item"><slot name="prepend" /><slot /><slot name="append" /></div>',
})

const TextFieldStub = defineComponent({
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue'],
  template:
    '<input :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
})

const ImageStub = defineComponent({
  props: ['src'],
  template: '<img :src="src" />',
})

const stubs = {
  IconBtn: IconBtnStub,
  LoadingBanner: true,
  VCheckbox: true,
  VHover: HoverStub,
  VIcon: IconStub,
  VImg: ImageStub,
  VListItem: ListItemStub,
  VListItemAction: true,
  VListItemSubtitle: defineComponent({ template: '<span><slot /></span>' }),
  VListItemTitle: defineComponent({ template: '<span><slot /></span>' }),
  VTextField: TextFieldStub,
  VVirtualScroll: VirtualScrollStub,
}

const endpoints: EndPoints = {
  delete: { method: 'post', url: '/storage/delete' },
  download: { method: 'post', url: '/storage/download' },
  image: { method: 'post', url: '/storage/image' },
  list: { method: 'post', url: '/storage/list/{sort}' },
  mkdir: { method: 'post', url: '/storage/mkdir' },
  rename: { method: 'post', url: '/storage/rename?name={newname}' },
}

function createItem(overrides: Partial<FileItem> = {}): FileItem {
  return {
    name: 'item.mkv',
    path: '/media/',
    storage: 'local',
    type: 'file',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function getIconButton(icon: string) {
  const iconElement = document.querySelector(`[data-icon="${icon}"]`)
  expect(iconElement).not.toBeNull()
  const button = iconElement?.closest('button')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

function getSlotIconButton(text: string) {
  const iconElement = Array.from(document.querySelectorAll('.test-icon')).find(element =>
    element.textContent?.includes(text),
  )
  expect(iconElement).toBeDefined()
  const button = iconElement?.closest('button')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

async function renderList(
  request: (config: AxiosRequestConfig) => unknown,
  options: {
    active?: boolean
    item?: FileItem
    refreshpending?: boolean
    sort?: string
  } = {},
) {
  const axios = Object.assign(vi.fn(), { request: vi.fn(request) }) as unknown as DataApiClient
  const result = await renderWithProviders(FileList, {
    global: { stubs },
    props: {
      active: options.active ?? true,
      axios,
      endpoints,
      item: options.item ?? createItem({ name: 'media', path: '/media/', type: 'dir' }),
      refreshpending: options.refreshpending ?? false,
      sort: options.sort ?? 'name',
    },
  })
  return { ...result, axios }
}

function getRequestConfig(axios: DataApiClient, index: number) {
  return vi.mocked(axios.request).mock.calls[index]?.[0] as AxiosRequestConfig
}

describe('FileList list state', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('uses the endpoint method, sort URL and current file item payload, then renders directories before files', async () => {
    const directory = createItem({ name: 'z-directory', path: '/media/z-directory/', type: 'dir' })
    const file = createItem({ name: 'a-file.mkv', path: '/media/a-file.mkv' })
    const { axios } = await renderList(() => Promise.resolve([file, directory]))

    await screen.findByText('z-directory')
    const config = getRequestConfig(axios, 0)
    expect(config).toMatchObject({
      data: expect.objectContaining({ path: '/media/', storage: 'local', type: 'dir' }),
      method: 'post',
      url: '/storage/list/name',
    })
    const renderedNames = Array.from(document.querySelectorAll('.test-list-item')).map(item => item.textContent)
    expect(renderedNames[0]).toContain('z-directory')
    expect(renderedNames[1]).toContain('a-file.mkv')
  })

  it('opens recognized music details when audio metadata uses title instead of name', async () => {
    const audio = createItem({
      extension: 'flac',
      name: '晴天.flac',
      path: '/music/晴天.flac',
      type: 'file',
    })
    mocks.apiGet.mockResolvedValueOnce({
      meta_info: { artists: ['周杰伦'], title: '晴天', type: '音乐' },
      media_info: { artist: '周杰伦', title: '晴天', type: '音乐' },
    })
    await renderList(() => Promise.resolve([]), { item: audio })

    await fireEvent.click(getSlotIconButton('mdi-text-recognition'))

    await waitFor(() =>
      expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
        context: {
          meta_info: { title: '晴天', type: '音乐' },
          media_info: { title: '晴天', type: '音乐' },
        },
      }),
    )
    expect(mocks.apiGet).toHaveBeenCalledWith('media/recognize_file', {
      params: { path: '/music/晴天.flac' },
    })
  })

  it('filters by substring, wildcard and case sensitivity', async () => {
    await renderList(() =>
      Promise.resolve([
        createItem({ name: 'Alpha.MKV' }),
        createItem({ name: 'beta.mp4' }),
        createItem({ name: 'notes.txt' }),
      ]),
    )
    const filter = await screen.findByPlaceholderText(/搜索/)

    await fireEvent.update(filter, 'alpha')
    expect(screen.getByText('Alpha.MKV')).toBeInTheDocument()
    expect(screen.queryByText('beta.mp4')).not.toBeInTheDocument()

    await fireEvent.update(filter, '*.mp4')
    expect(screen.getByText('beta.mp4')).toBeInTheDocument()
    expect(screen.queryByText('Alpha.MKV')).not.toBeInTheDocument()

    await fireEvent.click(getIconButton('mdi-format-letter-case'))
    await fireEvent.update(filter, 'BETA')
    expect(screen.queryByText('beta.mp4')).not.toBeInTheDocument()
  })

  it('refreshes once when the parent changes sort and requests a refresh, then ignores the stale response', async () => {
    const first = deferred<FileItem[]>()
    const second = deferred<FileItem[]>()
    const request = vi.fn()
    request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { axios, rerender } = await renderList(request, { sort: 'name' })

    await rerender({ refreshpending: true, sort: 'time' })
    await waitFor(() => expect(axios.request).toHaveBeenCalledTimes(2))
    expect(getRequestConfig(axios, 1).url).toBe('/storage/list/time')

    second.resolve([createItem({ name: 'newest.mkv' })])
    await screen.findByText('newest.mkv')
    first.resolve([createItem({ name: 'stale.mkv' })])
    await nextTick()

    expect(screen.getByText('newest.mkv')).toBeInTheDocument()
    expect(screen.queryByText('stale.mkv')).not.toBeInTheDocument()
    expect(axios.request).toHaveBeenCalledTimes(2)
  })

  it('reloads when a remote file identity changes without changing its path', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce([createItem({ name: 'first-drive.mkv' })])
      .mockResolvedValueOnce([createItem({ name: 'second-drive.mkv' })])
    const { axios, rerender } = await renderList(request, {
      item: createItem({ drive_id: 'drive-a', fileid: 'folder-a', name: 'media', path: '/media/', type: 'dir' }),
    })
    await screen.findByText('first-drive.mkv')

    await rerender({
      item: createItem({ drive_id: 'drive-b', fileid: 'folder-b', name: 'media', path: '/media/', type: 'dir' }),
    })
    await screen.findByText('second-drive.mkv')

    expect(axios.request).toHaveBeenCalledTimes(2)
    expect(getRequestConfig(axios, 1).data).toMatchObject({ drive_id: 'drive-b', fileid: 'folder-b' })
  })

  it('isolates consecutive refreshes even when path and sort stay unchanged', async () => {
    const initial = Promise.resolve([createItem({ name: 'initial.mkv' })])
    const olderRefresh = deferred<FileItem[]>()
    const newerRefresh = deferred<FileItem[]>()
    const request = vi.fn()
    request
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise)
    await renderList(request)
    await screen.findByText('initial.mkv')

    const refresh = getSlotIconButton('mdi-refresh')
    await fireEvent.click(refresh)
    await fireEvent.click(refresh)
    expect(request).toHaveBeenCalledTimes(3)

    newerRefresh.resolve([createItem({ name: 'newer-refresh.mkv' })])
    await screen.findByText('newer-refresh.mkv')
    olderRefresh.resolve([createItem({ name: 'older-refresh.mkv' })])
    await nextTick()

    expect(screen.queryByText('older-refresh.mkv')).not.toBeInTheDocument()
  })

  it('pairs external loading events for overlapping refreshes without committing the stale response', async () => {
    const olderRefresh = deferred<FileItem[]>()
    const newerRefresh = deferred<FileItem[]>()
    const request = vi
      .fn()
      .mockResolvedValueOnce([createItem({ name: 'initial.mkv' })])
      .mockReturnValueOnce(olderRefresh.promise)
      .mockReturnValueOnce(newerRefresh.promise)
    const { emitted } = await renderList(request)
    await screen.findByText('initial.mkv')
    const loadingEventCount = emitted().loading?.length ?? 0

    const refresh = getSlotIconButton('mdi-refresh')
    await fireEvent.click(refresh)
    await fireEvent.click(refresh)
    olderRefresh.resolve([createItem({ name: 'stale.mkv' })])
    await waitFor(() => expect(document.querySelector('loading-banner-stub')).not.toBeNull())
    newerRefresh.resolve([createItem({ name: 'newest.mkv' })])
    await screen.findByText('newest.mkv')

    expect(emitted().loading?.slice(loadingEventCount)).toEqual([[true], [true], [false], [false]])
    expect(document.querySelector('loading-banner-stub')).toBeNull()
    expect(screen.getByText('newest.mkv')).toBeInTheDocument()
    expect(screen.queryByText('stale.mkv')).not.toBeInTheDocument()
  })

  it('refreshes through the KeepAlive boundary only while the component is active', async () => {
    const request = vi.fn().mockResolvedValue([createItem()])
    const { rerender } = await renderList(request, { active: false })
    await waitFor(() => expect(request).toHaveBeenCalledOnce())

    expect(mocks.keepAliveOptions?.active?.value).toBe(false)
    await rerender({ active: true })
    expect(mocks.keepAliveOptions?.active?.value).toBe(true)
    await mocks.keepAliveRefresh?.({ silent: true })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('emits navigation paths and acknowledges refresh requests', async () => {
    const directory = createItem({ name: 'shows', path: '/media/shows/', type: 'dir' })
    const request = vi.fn().mockResolvedValue([directory])
    const { emitted, rerender } = await renderList(request)
    await screen.findByText('shows')

    await fireEvent.click(screen.getByText('shows').closest('[role="button"]') as Element)
    const pathChangedEvents = emitted().pathchanged as Array<[FileItem]> | undefined
    expect(pathChangedEvents?.at(-1)?.[0]).toMatchObject({
      name: 'shows',
      path: '/media/shows/',
      storage: 'local',
      type: 'dir',
    })

    await rerender({ refreshpending: true })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    expect(emitted().refreshed).toHaveLength(1)
  })

  it('synchronizes selected entries to the newest file objects after refresh', async () => {
    const original = createItem({ name: 'selected.mkv', path: '/media/selected.mkv', size: 10 })
    const refreshed = createItem({ name: 'selected.mkv', path: '/media/selected.mkv', size: 20 })
    const request = vi.fn().mockResolvedValueOnce([original]).mockResolvedValueOnce([refreshed])
    await renderList(request)
    await screen.findByText('selected.mkv')

    await fireEvent.click(getIconButton('mdi-select'))
    await fireEvent.click(screen.getByText('selected.mkv').closest('[role="button"]') as Element)
    await mocks.keepAliveRefresh?.({ silent: true })
    await fireEvent.click(getIconButton('mdi-folder-arrow-right'))

    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
      items: [expect.objectContaining({ size: 20 })],
    })
  })
})

describe('FileList destructive operations', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not emit deletion success for a business failure and always closes loading', async () => {
    const request = vi.fn((config: AxiosRequestConfig) => {
      if (config.url === '/storage/delete') return Promise.reject(new Error('delete denied'))
      return Promise.resolve([createItem({ name: 'failed.mkv' })])
    })
    const { emitted } = await renderList(request)
    await screen.findByText('failed.mkv')

    await fireEvent.click(getIconButton('mdi-delete-outline'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('delete denied'))

    expect(emitted().filedeleted).toBeUndefined()
    expect(emitted().loading?.at(-1)).toEqual([false])
  })

  it('closes loading and reports no success when deletion throws', async () => {
    const request = vi.fn((config: AxiosRequestConfig) => {
      if (config.url === '/storage/delete') return Promise.reject(new Error('network down'))
      return Promise.resolve([createItem({ name: 'throwing.mkv' })])
    })
    const { emitted } = await renderList(request)
    await screen.findByText('throwing.mkv')

    await fireEvent.click(getIconButton('mdi-delete-outline'))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())

    expect(emitted().filedeleted).toBeUndefined()
    expect(emitted().loading?.at(-1)).toEqual([false])
  })

  it('emits one success event, refreshes once and closes loading after a successful single delete', async () => {
    const item = createItem({ name: 'deleted.mkv', path: '/media/deleted.mkv' })
    let listCount = 0
    const request = vi.fn((config: AxiosRequestConfig) => {
      if (config.url?.startsWith('/storage/list/')) {
        listCount += 1
        return Promise.resolve(listCount === 1 ? [item] : [])
      }
      return Promise.resolve(null)
    })
    const { emitted } = await renderList(request)
    await screen.findByText('deleted.mkv')

    await fireEvent.click(getIconButton('mdi-delete-outline'))
    await waitFor(() => expect(listCount).toBe(2))

    expect(request.mock.calls.filter(([config]) => config.url === '/storage/delete')).toHaveLength(1)
    expect(emitted().filedeleted).toHaveLength(1)
    expect(emitted().loading?.at(-1)).toEqual([false])
  })

  it('deduplicates batch selection, refreshes once, summarizes failures and keeps failed items selected', async () => {
    const first = createItem({ name: 'first.mkv', path: '/media/first.mkv' })
    const failed = createItem({ name: 'failed.mkv', path: '/media/failed.mkv' })
    let listCount = 0
    const request = vi.fn((config: AxiosRequestConfig) => {
      if (config.url?.startsWith('/storage/list/')) {
        listCount += 1
        return Promise.resolve(listCount === 1 ? [first, failed] : [failed])
      }
      if ((config.data as FileItem).name === 'failed.mkv') {
        return Promise.reject(new Error('permission denied'))
      }
      return Promise.resolve(null)
    })
    const { emitted } = await renderList(request)
    await screen.findByText('first.mkv')
    const loadingEventCount = emitted().loading?.length ?? 0

    await fireEvent.click(getIconButton('mdi-select'))
    await fireEvent.click(screen.getByText('first.mkv').closest('[role="button"]') as Element)
    await fireEvent.click(screen.getByText('failed.mkv').closest('[role="button"]') as Element)
    await fireEvent.click(getIconButton('mdi-delete-outline'))

    await waitFor(() => expect(listCount).toBe(2))
    expect(request.mock.calls.filter(([config]) => config.url === '/storage/delete')).toHaveLength(2)
    expect(request.mock.calls.filter(([config]) => config.url?.startsWith('/storage/list/'))).toHaveLength(2)
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('failed.mkv'))
    expect(emitted().loading?.slice(loadingEventCount)).toEqual([[true], [false]])
    await fireEvent.click(getIconButton('mdi-folder-arrow-right'))
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({ items: [failed] })
  })
})

describe('FileList dialogs, download and lifecycle', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('passes single and selected items to scrape and reorganize boundary dialogs', async () => {
    const first = createItem({ name: 'first.mkv', path: '/media/first.mkv' })
    const second = createItem({ name: 'second.mkv', path: '/media/second.mkv' })
    const album = createItem({ name: '叶惠美', path: '/media/叶惠美/', type: 'dir' })
    await renderList(() => Promise.resolve([album, first, second]))
    await screen.findByText('first.mkv')

    const firstRow = screen.getByText('first.mkv').closest('[role="button"]') as Element
    await fireEvent.click(firstRow.querySelector('[data-icon="mdi-auto-fix"]')?.closest('button') as Element)
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({ items: [first] })

    await fireEvent.click(firstRow.querySelector('[data-icon="mdi-folder-arrow-right"]')?.closest('button') as Element)
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
      items: [first],
      target_storage: 'local',
    })

    const albumRow = screen.getByText('叶惠美').closest('[role="button"]') as Element
    await fireEvent.click(albumRow.querySelector('[data-icon="mdi-folder-arrow-right"]')?.closest('button') as Element)
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({
      items: [album],
      target_storage: 'local',
    })

    await fireEvent.click(getIconButton('mdi-select'))
    await fireEvent.click(firstRow)
    await fireEvent.click(screen.getByText('second.mkv').closest('[role="button"]') as Element)
    await fireEvent.click(getIconButton('mdi-auto-fix'))
    expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1]).toMatchObject({ items: [first, second] })
  })

  it('executes selected scrape requests sequentially, reports results and refreshes once', async () => {
    const first = createItem({ name: 'first.mkv', path: '/media/first.mkv' })
    const second = createItem({ name: 'second.mkv', path: '/media/second.mkv' })
    const request = vi.fn().mockResolvedValue([first, second])
    mocks.apiPost.mockResolvedValue(null)
    await renderList(request)
    await screen.findByText('first.mkv')

    await fireEvent.click(getIconButton('mdi-select'))
    await fireEvent.click(screen.getByText('first.mkv').closest('[role="button"]') as Element)
    await fireEvent.click(screen.getByText('second.mkv').closest('[role="button"]') as Element)
    await fireEvent.click(getIconButton('mdi-auto-fix'))
    const scrapeEvents = mocks.openSharedDialog.mock.calls.at(-1)?.[2] as Record<
      string,
      (options: Record<string, unknown>) => Promise<void>
    >
    await scrapeEvents.scrape({ season: 2 })

    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      1,
      'media/scrape/local',
      first,
      expect.objectContaining({ params: { season: 2 } }),
    )
    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      'media/scrape/local',
      second,
      expect.objectContaining({ params: { season: 2 } }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledTimes(2)
    expect(getIconButton('mdi-select')).toBeInTheDocument()
  })

  it('creates a temporary download URL and revokes it after the retention window', async () => {
    vi.useFakeTimers()
    const blob = new Blob(['download'])
    const createObjectURL = vi.fn().mockReturnValue('blob:download')
    const revokeObjectURL = vi.fn()
    const open = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('open', open)
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url === '/storage/download' ? Promise.resolve(blob) : Promise.resolve([createItem()]),
    )
    await renderList(request, { item: createItem({ name: 'selected.mkv', path: '/media/selected.mkv' }) })
    await waitFor(() => expect(request).toHaveBeenCalled())

    await fireEvent.click(getSlotIconButton('mdi-download'))
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:download', '_blank'))
    expect(createObjectURL).toHaveBeenCalledWith(blob)

    vi.advanceTimersByTime(60_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download')
  })

  it('only commits the latest image response and revokes URLs when switching files and unmounting', async () => {
    const secondImage = deferred<Blob>()
    const thirdImage = deferred<Blob>()
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:third')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const request = vi.fn((config: AxiosRequestConfig) => {
      if (config.url === '/storage/image' && (config.data as FileItem).name === 'first.jpg') {
        return Promise.resolve(new Blob(['first']))
      }
      if (config.url === '/storage/image' && (config.data as FileItem).name === 'second.jpg') return secondImage.promise
      if (config.url === '/storage/image') return thirdImage.promise
      return Promise.resolve([config.data as FileItem])
    })
    const { rerender, unmount } = await renderList(request, {
      item: createItem({ name: 'first.jpg', path: '/media/first.jpg' }),
    })
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:first'))

    await rerender({ item: createItem({ name: 'second.jpg', path: '/media/second.jpg' }) })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')
    await rerender({ item: createItem({ name: 'third.jpg', path: '/media/third.jpg' }) })
    thirdImage.resolve(new Blob(['third']))
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:third'))

    secondImage.resolve(new Blob(['second']))
    await nextTick()
    expect(createObjectURL).toHaveBeenCalledTimes(2)

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:third')
  })

  it('reloads an image when its remote identity changes at the same path', async () => {
    const createObjectURL = vi.fn().mockReturnValueOnce('blob:first-drive').mockReturnValueOnce('blob:second-drive')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url === '/storage/image'
        ? Promise.resolve(new Blob([(config.data as FileItem).fileid ?? '']))
        : Promise.resolve([config.data as FileItem]),
    )
    const { rerender } = await renderList(request, {
      item: createItem({ drive_id: 'drive-a', fileid: 'image-a', name: 'poster.jpg', path: '/media/poster.jpg' }),
    })
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:first-drive'))

    await rerender({
      item: createItem({ drive_id: 'drive-b', fileid: 'image-b', name: 'poster.jpg', path: '/media/poster.jpg' }),
    })
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:second-drive'))

    const imageRequests = request.mock.calls.filter(([config]) => config.url === '/storage/image')
    expect(imageRequests).toHaveLength(2)
    expect(imageRequests[1]?.[0].data).toMatchObject({ drive_id: 'drive-b', fileid: 'image-b' })
  })

  it('drops an image response that arrives after unmount without creating an object URL', async () => {
    const image = deferred<Blob>()
    const createObjectURL = vi.fn()
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url === '/storage/image' ? image.promise : Promise.resolve([config.data as FileItem]),
    )
    const { unmount } = await renderList(request, {
      item: createItem({ name: 'late.jpg', path: '/media/late.jpg' }),
    })

    unmount()
    image.resolve(new Blob(['late']))
    await nextTick()

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(mocks.progressStop).toHaveBeenCalled()
  })

  it('wires recursive rename progress SSE and closes resources on unmount', async () => {
    const controller = { close: vi.fn(), id: 1, updateProps: vi.fn() }
    mocks.openSharedDialog.mockReturnValue(controller)
    const renameResult = deferred<null>()
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url?.startsWith('/storage/rename')
        ? renameResult.promise
        : Promise.resolve([createItem({ name: 'rename.mkv' })]),
    )
    const { unmount } = await renderList(request)
    await screen.findByText('rename.mkv')

    const row = screen.getByText('rename.mkv').closest('[role="button"]') as Element
    await fireEvent.click(row.querySelector('[data-icon="mdi-rename"]')?.closest('button') as Element)
    const renameEvents = mocks.openSharedDialog.mock.calls.at(-1)?.[2] as Record<string, (value?: unknown) => void>
    renameEvents['update:name']?.('renamed.mkv')
    renameEvents['update:recursive']?.(true)
    const renamePromise = renameEvents.rename?.()

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/storage/rename?name=renamed.mkv&recursive=true' }),
    )
    expect(mocks.progressStart).toHaveBeenCalledOnce()
    mocks.progressHandler?.(new MessageEvent('message', { data: JSON.stringify({ text_i18n: '重命名中', value: 50 }) }))
    expect(controller.updateProps).toHaveBeenCalledWith(expect.objectContaining({ text: '重命名中', value: 50 }))
    renameResult.resolve(null)
    await renamePromise

    unmount()
    expect(mocks.progressStop).toHaveBeenCalled()
    expect(controller.close).toHaveBeenCalled()
  })

  it('keeps the rename dialog open and does not emit success for a business failure', async () => {
    const renameController = { close: vi.fn(), id: 1, updateProps: vi.fn() }
    const progressController = { close: vi.fn(), id: 2, updateProps: vi.fn() }
    mocks.openSharedDialog.mockReturnValueOnce(renameController).mockReturnValueOnce(progressController)
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url?.startsWith('/storage/rename')
        ? Promise.reject(new Error('rename denied'))
        : Promise.resolve([createItem({ name: 'rename.mkv' })]),
    )
    const { emitted } = await renderList(request)
    await screen.findByText('rename.mkv')

    const row = screen.getByText('rename.mkv').closest('[role="button"]') as Element
    await fireEvent.click(row.querySelector('[data-icon="mdi-rename"]')?.closest('button') as Element)
    const renameEvents = mocks.openSharedDialog.mock.calls[0]?.[2] as Record<string, (value?: unknown) => void>
    renameEvents['update:name']?.('renamed.mkv')
    renameEvents['update:recursive']?.(true)
    await renameEvents.rename?.()

    expect(mocks.toastError).toHaveBeenCalledWith('rename denied')
    expect(emitted().renamed).toBeUndefined()
    expect(emitted().loading?.at(-1)).toEqual([false])
    expect(mocks.progressStop).toHaveBeenCalledOnce()
    expect(progressController.close).toHaveBeenCalledOnce()
    expect(renameController.close).not.toHaveBeenCalled()
  })

  it('closes rename progress resources without emitting success when the request throws', async () => {
    const renameController = { close: vi.fn(), id: 1, updateProps: vi.fn() }
    const progressController = { close: vi.fn(), id: 2, updateProps: vi.fn() }
    mocks.openSharedDialog.mockReturnValueOnce(renameController).mockReturnValueOnce(progressController)
    const request = vi.fn((config: AxiosRequestConfig) =>
      config.url?.startsWith('/storage/rename')
        ? Promise.reject(new Error('network down'))
        : Promise.resolve([createItem({ name: 'rename.mkv' })]),
    )
    const { emitted } = await renderList(request)
    await screen.findByText('rename.mkv')

    const row = screen.getByText('rename.mkv').closest('[role="button"]') as Element
    await fireEvent.click(row.querySelector('[data-icon="mdi-rename"]')?.closest('button') as Element)
    const renameEvents = mocks.openSharedDialog.mock.calls[0]?.[2] as Record<string, (value?: unknown) => void>
    renameEvents['update:name']?.('renamed.mkv')
    renameEvents['update:recursive']?.(true)
    await renameEvents.rename?.()

    expect(mocks.toastError).toHaveBeenCalledWith('network down')
    expect(emitted().renamed).toBeUndefined()
    expect(emitted().loading?.at(-1)).toEqual([false])
    expect(mocks.progressStop).toHaveBeenCalledOnce()
    expect(progressController.close).toHaveBeenCalledOnce()
    expect(renameController.close).not.toHaveBeenCalled()
  })
})
