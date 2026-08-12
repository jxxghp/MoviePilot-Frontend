import PluginMarketSettingDialog from '@/components/dialog/PluginMarketSettingDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: {
        itemKey: { type: Function, required: true },
        modelValue: { type: Array, required: true },
      },
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            props.modelValue.map((element, index) =>
              h('div', { 'data-repo-key': props.itemKey(element) }, slots.item?.({ element, index })),
            ),
          )
      },
    }),
  }
})

const DialogStub = defineComponent({
  name: 'VDialog',
  template: '<div role="dialog"><slot /></div>',
})

const CloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')">关闭</button>',
})

const IconButtonStub = defineComponent({
  name: 'IconBtn',
  props: { icon: String },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', { 'aria-label': props.icon, onClick: () => emit('click'), type: 'button' })
  },
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })

  return { promise, reject, resolve }
}

async function renderDialog() {
  const changed = vi.fn()
  const close = vi.fn()
  const save = vi.fn()
  const result = await renderWithProviders(PluginMarketSettingDialog, {
    props: {
      onChanged: changed,
      onClose: close,
      onSave: save,
    },
    global: {
      components: {
        VDialogCloseBtn: CloseButtonStub,
      },
      stubs: {
        IconBtn: IconButtonStub,
        VDialog: DialogStub,
      },
    },
  })

  return { ...result, changed, close, save }
}

const dialogSource = readFileSync(resolve(cwd(), 'src/components/dialog/PluginMarketSettingDialog.vue'), 'utf8')

function getStyleRule(selector: string) {
  const ruleStart = dialogSource.indexOf(`${selector} {`)
  const ruleEnd = dialogSource.indexOf('\n}', ruleStart)

  expect(ruleStart).toBeGreaterThanOrEqual(0)
  expect(ruleEnd).toBeGreaterThan(ruleStart)

  return dialogSource.slice(ruleStart, ruleEnd)
}

describe('PluginMarketSettingDialog behavior', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue({ data: { value: '' }, success: true })
    mocks.apiPost.mockReset().mockResolvedValue({ success: true })
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('parses configured repositories with stable deduplication and supports list edits', async () => {
    const firstRepo = 'https://github.com/example/first'
    const secondRepo = 'https://github.com/example/second.git'
    mocks.apiGet.mockResolvedValueOnce({
      data: { value: ` ${firstRepo}，${secondRepo}\n${firstRepo} ` },
      success: true,
    })
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByText('example/first')).toBeInTheDocument()
    expect(screen.getByText('example/second')).toBeInTheDocument()
    expect(screen.getAllByText(firstRepo)).toHaveLength(1)

    await user.type(screen.getByPlaceholderText('输入插件仓库地址'), 'not-a-url')
    await user.click(screen.getByRole('button', { name: '添加仓库' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请输入有效的URL地址')

    await user.clear(screen.getByPlaceholderText('输入插件仓库地址'))
    const NativeURL = URL
    function BrowserLikeURL(input: string | URL, base?: string | URL) {
      if (String(input) === 'https://not a valid') {
        return { hostname: 'not%20a%20valid', protocol: 'https:' } as URL
      }

      return new NativeURL(input, base)
    }
    vi.stubGlobal('URL', BrowserLikeURL)
    await user.type(screen.getByPlaceholderText('输入插件仓库地址'), 'https://not a valid')
    await user.click(screen.getByRole('button', { name: '添加仓库' }))
    expect(mocks.toastError).toHaveBeenCalledTimes(2)
    vi.stubGlobal('URL', NativeURL)

    await user.clear(screen.getByPlaceholderText('输入插件仓库地址'))
    await user.type(screen.getByPlaceholderText('输入插件仓库地址'), firstRepo)
    await user.click(screen.getByRole('button', { name: '添加仓库' }))
    expect(mocks.toastError).toHaveBeenCalledWith('该地址已存在')

    await user.click(screen.getAllByRole('button', { name: 'mdi-pencil' })[1])
    const editingInput = screen.getAllByRole('textbox')[1]
    await user.type(editingInput, '/discarded')
    await fireEvent.keyUp(editingInput, { key: 'Escape' })
    expect(screen.queryByDisplayValue(`${secondRepo}/discarded`)).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'mdi-pencil' })[1])
    const resumedEditingInput = screen.getAllByRole('textbox')[1]
    await user.clear(resumedEditingInput)
    await user.type(resumedEditingInput, 'https://git.example.com/team/renamed')
    await fireEvent.keyUp(resumedEditingInput, { key: 'Enter' })
    expect(screen.getAllByText('https://git.example.com/team/renamed')).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'mdi-delete' })[0])
    expect(screen.queryByText(firstRepo)).not.toBeInTheDocument()
  })

  it('keeps a failed initial query distinct from an empty setting and retries in place', async () => {
    mocks.apiGet
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce({ data: { value: '' }, success: true })
    const user = userEvent.setup()

    await renderDialog()

    expect(await screen.findByText('服务器连接失败')).toBeInTheDocument()
    expect(screen.queryByText('暂无插件仓库地址')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('暂无插件仓库地址')).toBeInTheDocument()
    expect(screen.queryByText('服务器连接失败')).not.toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('normalizes text input, rejects invalid entries and saves the JSON string payload', async () => {
    mocks.apiGet.mockResolvedValueOnce({ data: { value: 'https://github.com/example/original' }, success: true })
    const user = userEvent.setup()
    const { close, save } = await renderDialog()

    await screen.findByText('example/original')
    await user.click(screen.getByRole('tab', { name: '文本维护' }))
    const textInput = screen.getByRole('textbox')
    await user.clear(textInput)
    await user.type(
      textInput,
      'https://github.com/example/a，invalid\nhttps://github.com/example/a,https://github.com/example/b',
    )

    expect(screen.getByText('文本中有 1 个无效地址，请修正后保存。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    await user.click(screen.getByRole('tab', { name: '列表维护' }))
    expect(mocks.toastWarning).toHaveBeenCalledWith('已忽略 1 个无效地址')
    await user.click(screen.getByRole('tab', { name: '文本维护' }))

    const normalizedTextInput = screen.getByRole('textbox')
    await user.clear(normalizedTextInput)
    await user.type(
      normalizedTextInput,
      'https://github.com/example/a，https://github.com/example/a\nhttps://github.com/example/b',
    )
    expect(screen.getByText('重复地址会在保存时自动去重。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/setting/PLUGIN_MARKET',
        'https://github.com/example/a,https://github.com/example/b',
      )
    })
    expect(save).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('locks save while pending and reports both business and HTTP failures without closing', async () => {
    mocks.apiGet.mockResolvedValue({ data: { value: 'https://github.com/example/repo' }, success: true })
    const pendingSave = createDeferred<{ success: boolean; message?: string }>()
    mocks.apiPost.mockReturnValueOnce(pendingSave.promise)
    const user = userEvent.setup()
    const { save } = await renderDialog()

    await screen.findByText('example/repo')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    pendingSave.resolve({ success: false, message: 'rejected' })
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件仓库保存失败：rejected！'))
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()

    mocks.apiPost.mockRejectedValueOnce(new Error('network failed'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('插件仓库保存失败：network failed！'))
    expect(save).not.toHaveBeenCalled()
  })

  it('publishes a persistent change after source sync and always releases its loading state', async () => {
    mocks.apiGet.mockResolvedValue({ data: { value: 'https://github.com/example/original' }, success: true })
    const pendingSync = createDeferred<{
      success: boolean
      data: { added_count: number; repos: string[]; total_count: number }
    }>()
    mocks.apiPost.mockReturnValueOnce(pendingSync.promise)
    const user = userEvent.setup()
    const { changed, close, save } = await renderDialog()

    await screen.findByText('example/original')
    await user.click(screen.getByRole('button', { name: '同步插件源' }))
    expect(screen.getByRole('button', { name: '同步插件源' })).toBeDisabled()

    pendingSync.resolve({
      success: true,
      data: {
        added_count: 1,
        repos: ['https://github.com/example/original', 'https://github.com/example/source'],
        total_count: 2,
      },
    })

    expect(await screen.findByText('example/source')).toBeInTheDocument()
    expect(changed).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/PLUGIN_MARKET/sync-wiki', {})
    expect(screen.getByRole('button', { name: '同步插件源' })).toBeEnabled()
  })

  it('keeps the dialog open when source sync reports a business or HTTP failure', async () => {
    mocks.apiGet.mockResolvedValue({ data: { value: 'https://github.com/example/original' }, success: true })
    mocks.apiPost
      .mockResolvedValueOnce({ success: false, message: 'source rejected' })
      .mockRejectedValueOnce(new Error('source offline'))
    const user = userEvent.setup()
    const { changed } = await renderDialog()

    await screen.findByText('example/original')
    await user.click(screen.getByRole('button', { name: '同步插件源' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('同步插件源失败：source rejected！'))
    expect(changed).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '同步插件源' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('同步插件源失败：source offline！'))
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '同步插件源' })).toBeEnabled()
  })
})

describe('PluginMarketSettingDialog theme surfaces', () => {
  it('uses shared theme tokens for the view switch and editor containers', () => {
    const modeSwitchRule = getStyleRule('.plugin-market-mode-switch')
    const listWrapRule = getStyleRule('.plugin-market-list-wrap')
    const textareaRule = getStyleRule('.plugin-market-textarea-field')

    expect(modeSwitchRule).toContain('border: var(--app-grouped-list-border)')
    expect(modeSwitchRule).toContain('backdrop-filter: var(--app-grouped-list-backdrop-filter)')
    expect(modeSwitchRule).toContain('background: var(--app-grouped-list-background)')
    expect(dialogSource).toContain('background: var(--app-grouped-list-hover-background)')
    expect(dialogSource).toContain('background: var(--app-grouped-list-active-background)')
    expect(listWrapRule).toContain('border-radius: var(--app-grouped-list-radius)')
    expect(listWrapRule).toContain('background: var(--app-grouped-list-background)')
    expect(textareaRule).toContain('background: var(--app-grouped-list-background)')
  })

  it('uses plugin-source wording instead of exposing the Wiki implementation detail', () => {
    expect(dialogSource).toContain("t('dialog.pluginMarketSetting.syncSources')")
    expect(dialogSource).not.toContain("t('dialog.pluginMarketSetting.syncWiki')")
  })
})
