import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

describe('MediaIdSelector layout', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('keeps the search field visible while results scroll independently', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        media_id: 'tmdb-1',
        overview: '测试简介',
        poster_path: '',
        title: 'Hello Mini',
        type: '电视剧',
        year: '2019',
      },
    ])

    const { container } = await renderWithProviders(MediaIdSelector, {
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })
    const searchPanel = container.querySelector('.media-id-selector__search')
    const closeButton = container.querySelector('.media-id-selector__close')

    expect(container.querySelector('.media-id-selector')).toBeInTheDocument()
    expect(searchPanel).toBeInstanceOf(HTMLElement)
    expect(closeButton).toBeInstanceOf(HTMLButtonElement)
    expect(container.querySelector('.v-input__details')).not.toBeInTheDocument()
    expect(closeButton).toHaveAttribute('aria-label', '关闭')
    expect(closeButton).not.toHaveClass('static')

    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, 'hello')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Hello Mini（2019）')).toBeInTheDocument()

    const results = container.querySelector('.media-id-selector__results')
    expect(results).toBeInstanceOf(HTMLElement)
  })
})
