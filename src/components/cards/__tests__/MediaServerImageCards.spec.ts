import type { MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'
import PlayingBackdropCard from '@/components/cards/PlayingBackdropCard.vue'
import PosterCard from '@/components/cards/PosterCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/appDeepLink', () => ({
  openMediaServerItem: vi.fn(),
}))

const media: MediaServerPlayItem = {
  id: 'media-1',
  image: 'https://media.example.com/poster.jpg',
  title: 'Test media',
}

const VImgStub = defineComponent({
  inheritAttrs: false,
  props: {
    crossorigin: String,
    src: String,
  },
  setup: props => () => h('img', { crossorigin: props.crossorigin, src: props.src }),
})

describe.each([
  ['PosterCard', PosterCard],
  ['PlayingBackdropCard', PlayingBackdropCard],
])('%s image request mode', (_name, component) => {
  it('loads the media server image anonymously', async () => {
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      props: { media },
    })

    expect(container.querySelector('img')).toHaveAttribute('crossorigin', 'anonymous')
  })

  it('passes the global cache switch to the required backend proxy', async () => {
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: true },
          initialized: true,
          loading: false,
        },
      },
      props: { media: { ...media, use_cookies: true } },
    })

    const image = container.querySelector<HTMLImageElement>('img')
    expect(image?.src).toContain('system/img/0?imgurl=')
    expect(image?.src).toContain('&cache=true')
    expect(image?.src).toContain('&use_cookies=true')
  })
})

describe('BackdropCard image request mode', () => {
  it('passes the global cache switch to the required backend proxy', async () => {
    const { container } = await renderWithProviders(BackdropCard, {
      global: { stubs: { VImg: VImgStub } },
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: true },
          initialized: true,
          loading: false,
        },
      },
      props: { media: { ...media, use_cookies: true } },
    })

    const image = container.querySelector<HTMLImageElement>('img')
    expect(image?.src).toContain('system/img/0?imgurl=')
    expect(image?.src).toContain('&cache=true')
    expect(image?.src).toContain('&use_cookies=true')
  })
})
