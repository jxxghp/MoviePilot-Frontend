import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import RoutePreviewDialog from '@/components/dialog/RoutePreviewDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { post: mocks.apiPost },
}))

const directories = [
  {
    name: '通用电视剧',
    priority: 0,
    storage: 'local',
    library_storage: 'local',
    download_path: '/downloads/tv',
    media_type: '电视剧',
    transfer_type: 'link',
    library_path: '/media/tv',
  },
  {
    name: '综艺',
    priority: 1,
    storage: 'local',
    library_storage: 'local',
    download_path: '/downloads/variety',
    media_type: '电视剧',
    media_category: '综艺',
    transfer_type: 'link',
    library_path: '/media/variety',
  },
]

const categoryConfig = { movie: {}, tv: { 综艺: { genre_ids: '10764' } } }

const previewResponse = {
  media: { type: '电视剧', title: '测试综艺', year: '2026' },
  metadata: { genre_ids: [10764], origin_country: ['CN'], first_air_date: '2026-01-01' },
  category: {
    automatic_category: '综艺',
    provided_category: '',
    selected_category: '综艺',
    source: 'automatic',
    rules: [
      {
        index: 0,
        category: '综艺',
        matched: true,
        selected: true,
        reachable: true,
        conditions: [{ field: 'genre_ids', expected: '10764', actual: [10764], matched: true, message: '条件匹配' }],
      },
    ],
    warnings: [{ code: 'multiple_category_matches', message: '当前媒体同时匹配多条分类规则', related_indices: [0] }],
  },
  route: {
    mode: 'specificity',
    selected_index: 1,
    selected_directory: directories[1],
    candidates: [
      {
        index: 0,
        directory: directories[0],
        eligible: true,
        selected: false,
        match_level: 'media_type',
        reasons: [],
      },
      {
        index: 1,
        directory: directories[1],
        eligible: true,
        selected: true,
        match_level: 'category',
        reasons: [],
      },
    ],
    warnings: [{ code: 'generic_before_specific', message: '通用目录位于精确目录之前', related_indices: [0, 1] }],
  },
  comparisons: [
    {
      mode: 'sequential',
      selected_index: 0,
      selected_directory: directories[0],
      candidates: [],
      warnings: [],
    },
    {
      mode: 'specificity',
      selected_index: 1,
      selected_directory: directories[1],
      candidates: [],
      warnings: [],
    },
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function renderDialog() {
  return renderWithProviders(RoutePreviewDialog, {
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
    props: { modelValue: true, directories, categoryConfig, matchMode: 'specificity' },
  })
}

describe('RoutePreviewDialog', () => {
  beforeEach(() => mocks.apiPost.mockReset())

  it('submits unsaved drafts and renders the selected route, comparison, rules, candidates, and warnings', async () => {
    mocks.apiPost.mockResolvedValue(previewResponse)
    const user = userEvent.setup()
    await renderDialog()

    await fireEvent.update(screen.getByLabelText('标题'), '测试综艺')
    await fireEvent.update(screen.getByLabelText('年份'), '2026')
    await fireEvent.update(screen.getByLabelText('类型 ID'), '10764')
    await fireEvent.update(screen.getByLabelText('国家/地区'), 'CN')
    await user.click(screen.getByLabelText('源存储'))
    await user.click(await screen.findByRole('option', { name: 'local' }))
    await fireEvent.update(screen.getByLabelText('源路径'), '/downloads/variety/show.mkv')
    await user.click(screen.getByLabelText('目标存储'))
    await user.click(await screen.findByRole('option', { name: 'local' }))
    await fireEvent.update(screen.getByLabelText('指定目标路径'), '/media/variety')
    await user.click(screen.getByRole('checkbox', { name: '包含未启用监控整理的目录' }))
    await user.click(screen.getByRole('button', { name: '开始预览' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'transfer/route/preview',
        expect.objectContaining({
          category_config: categoryConfig,
          directories,
          match_mode: 'specificity',
          include_unsorted: true,
          storage: 'local',
          src_path: '/downloads/variety/show.mkv',
          target_storage: 'local',
          dest_path: '/media/variety',
          media: expect.objectContaining({ type: '电视剧', title: '测试综艺', year: '2026' }),
          metadata: expect.objectContaining({
            genre_ids: [10764],
            origin_country: ['CN'],
            first_air_date: '2026-01-01',
          }),
        }),
        { feedback: 'silent' },
      )
    })

    expect(await screen.findByText('综艺', { selector: '[data-testid="selected-directory"]' })).toBeInTheDocument()
    expect(screen.getByText('通用电视剧')).toBeInTheDocument()
    expect(screen.getByText('同时命中多条分类规则，实际采用第一条。')).toBeInTheDocument()
    expect(screen.getByText('通用目录会先于后面的精确目录命中。')).toBeInTheDocument()
    await user.click(screen.getByText('分类规则'))
    expect(screen.getByText('genre_ids')).toBeInTheDocument()
    expect(screen.getByText('/media/variety')).toBeInTheDocument()
  })

  it('renders request failures and a successful no-route result', async () => {
    const user = userEvent.setup()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await renderDialog()
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    expect(await screen.findByText('路由预览失败：offline')).toBeInTheDocument()

    mocks.apiPost.mockResolvedValueOnce({
      ...previewResponse,
      route: { ...previewResponse.route, selected_index: null, selected_directory: null, candidates: [] },
    })
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    expect(await screen.findAllByText('没有目录满足当前条件。')).not.toHaveLength(0)
  })

  it('discards a response when visible inputs change while the request is pending', async () => {
    const pending = deferred<typeof previewResponse>()
    mocks.apiPost.mockReturnValueOnce(pending.promise)
    const user = userEvent.setup()
    await renderDialog()

    await fireEvent.update(screen.getByLabelText('标题'), '旧标题')
    await user.click(screen.getByRole('button', { name: '开始预览' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1))
    await fireEvent.update(screen.getByLabelText('标题'), '新标题')
    pending.resolve(previewResponse)

    await waitFor(() => expect(screen.getByRole('button', { name: '开始预览' })).not.toHaveClass('v-btn--loading'))
    expect(screen.queryByTestId('selected-directory')).not.toBeInTheDocument()
    expect(screen.getByText('填写媒体元数据后开始预览。')).toBeInTheDocument()
  })
})
