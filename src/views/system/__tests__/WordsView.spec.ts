import WordsView from '@/views/system/WordsView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  aceSetMode: vi.fn(),
  aceSetPadding: vi.fn(),
  aceSetScrollMargin: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: {
    lang: { type: String, default: 'text' },
    options: { type: Object, default: () => ({}) },
    value: { type: String, default: '' },
  },
  emits: ['init', 'update:value'],
  mounted() {
    this.$emit('init', {
      session: { setMode: mocks.aceSetMode },
      renderer: { setPadding: mocks.aceSetPadding, setScrollMargin: mocks.aceSetScrollMargin },
    })
  },
  template: `
    <div
      data-testid="words-ace-editor"
      :data-lang="lang"
      :data-show-gutter="String(Boolean(options.showGutter))"
      :data-show-line-numbers="String(Boolean(options.showLineNumbers))"
      :data-value="value"
    />
  `,
})

async function renderWordsView() {
  return renderWithProviders(WordsView, {
    global: {
      stubs: {
        VAceEditor: AceEditorStub,
      },
    },
  })
}

describe('WordsView editor preferences', () => {
  beforeEach(() => {
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint.includes('EpisodeFormatRuleTable')) return Promise.resolve({ data: { value: [] } })
      return Promise.resolve({ data: { value: ['alpha', 'beta'] } })
    })
    mocks.apiPost.mockResolvedValue({ success: true })
    mocks.aceSetMode.mockClear()
    mocks.aceSetPadding.mockClear()
    mocks.aceSetScrollMargin.mockClear()
  })

  it('keeps line numbers disabled when no preference is stored', async () => {
    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')
    const switchControl = screen.getByRole('checkbox', { name: '行号' })

    expect(switchControl).not.toBeChecked()
    expect(editor).toHaveAttribute('data-show-gutter', 'false')
    expect(editor).toHaveAttribute('data-show-line-numbers', 'false')
    expect(editor).toHaveAttribute('data-lang', 'word_list')
    expect(screen.getByRole('checkbox', { name: '语法高亮' })).not.toBeChecked()
    expect(mocks.aceSetMode).toHaveBeenCalledWith({ path: 'ace/mode/word_list', syntax: false })
    expect(localStorage.getItem('MP_WORDS_SHOW_LINE_NUMBERS')).toBeNull()
    expect(localStorage.getItem('MP_WORDS_SYNTAX_HIGHLIGHTING')).toBeNull()
  })

  it('restores the enabled preference from local storage', async () => {
    localStorage.setItem('MP_WORDS_SHOW_LINE_NUMBERS', 'true')

    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')

    expect(screen.getByRole('checkbox', { name: '行号' })).toBeChecked()
    expect(editor).toHaveAttribute('data-show-gutter', 'true')
    expect(editor).toHaveAttribute('data-show-line-numbers', 'true')
  })

  it('treats an unrecognized stored preference as disabled', async () => {
    localStorage.setItem('MP_WORDS_SHOW_LINE_NUMBERS', 'enabled')

    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')

    expect(screen.getByRole('checkbox', { name: '行号' })).not.toBeChecked()
    expect(editor).toHaveAttribute('data-show-gutter', 'false')
    expect(editor).toHaveAttribute('data-show-line-numbers', 'false')
  })

  it('restores the syntax highlighting preference from local storage', async () => {
    localStorage.setItem('MP_WORDS_SYNTAX_HIGHLIGHTING', 'true')

    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')

    expect(screen.getByRole('checkbox', { name: '语法高亮' })).toBeChecked()
    expect(mocks.aceSetMode).toHaveBeenCalledWith({ path: 'ace/mode/word_list', syntax: true })
    expect(editor).toHaveAttribute('data-lang', 'word_list')
  })

  it('updates Ace options and persists the preference without changing content', async () => {
    const user = userEvent.setup()
    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')
    await waitFor(() => expect(editor).toHaveAttribute('data-value', 'alpha\nbeta'))

    await user.click(screen.getByRole('checkbox', { name: '行号' }))

    await waitFor(() => {
      expect(editor).toHaveAttribute('data-show-gutter', 'true')
      expect(editor).toHaveAttribute('data-show-line-numbers', 'true')
      expect(localStorage.getItem('MP_WORDS_SHOW_LINE_NUMBERS')).toBe('true')
    })
    expect(editor).toHaveAttribute('data-value', 'alpha\nbeta')
    expect(mocks.apiPost).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: '行号' }))

    await waitFor(() => {
      expect(editor).toHaveAttribute('data-show-gutter', 'false')
      expect(editor).toHaveAttribute('data-show-line-numbers', 'false')
      expect(localStorage.getItem('MP_WORDS_SHOW_LINE_NUMBERS')).toBe('false')
    })
  })

  it('switches word list syntax highlighting and persists the preference without changing content', async () => {
    const user = userEvent.setup()
    await renderWordsView()

    const editor = await screen.findByTestId('words-ace-editor')
    await waitFor(() => expect(editor).toHaveAttribute('data-value', 'alpha\nbeta'))

    await user.click(screen.getByRole('checkbox', { name: '语法高亮' }))

    await waitFor(() => {
      expect(mocks.aceSetMode).toHaveBeenLastCalledWith({ path: 'ace/mode/word_list', syntax: true })
      expect(localStorage.getItem('MP_WORDS_SYNTAX_HIGHLIGHTING')).toBe('true')
    })
    expect(editor).toHaveAttribute('data-value', 'alpha\nbeta')
    expect(mocks.apiPost).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: '语法高亮' }))

    await waitFor(() => {
      expect(mocks.aceSetMode).toHaveBeenLastCalledWith({ path: 'ace/mode/word_list', syntax: false })
      expect(localStorage.getItem('MP_WORDS_SYNTAX_HIGHLIGHTING')).toBe('false')
    })
  })

  it('shows the switch only for custom identifiers', async () => {
    const user = userEvent.setup()
    await renderWordsView()
    await screen.findByTestId('words-ace-editor')

    const releaseGroupButtons = screen.getAllByRole('button', { name: /自定义制作组\/字幕组/ })
    await user.click(releaseGroupButtons[0])

    expect(screen.queryByRole('checkbox', { name: '行号' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '语法高亮' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('words-ace-editor')).not.toBeInTheDocument()
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })
})
