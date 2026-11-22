import type { MediaServerPlayItem } from '@/api/types'
import BackdropCard from '@/components/cards/BackdropCard.vue'
import PlayingBackdropCard from '@/components/cards/PlayingBackdropCard.vue'
import PosterCard from '@/components/cards/PosterCard.vue'
import { nativeCardMenus } from '@/native/card'
import { readNativeCardMenu } from '@tests/support/nativeCardMenu'
import { openMediaServerItem } from '@/utils/appDeepLink'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ canPlay: vi.fn(() => true), play: vi.fn() }))

vi.mock('@/utils/appDeepLink', () => ({
  openMediaServerItem: vi.fn(),
}))
vi.mock('@/utils/mediaPlayback', () => ({
  canUseNativeMediaPlayback: mocks.canPlay,
  playMediaServerLibraryItem: mocks.play,
}))

afterEach(() => {
  nativeCardMenus.setContext(undefined)
  vi.clearAllMocks()
})

const media: MediaServerPlayItem = {
  id: 'media-1',
  image: 'https://media.example.com/poster.jpg',
  title: 'Test media',
  item_id: 'emby-item-1',
  server: 'Emby-客厅',
  server_type: 'emby',
  link: 'https://emby.example.com/web/index.html#!/item?id=emby-item-1',
}

const VImgStub = defineComponent({
  inheritAttrs: false,
  props: {
    aspectRatio: [String, Number],
    crossorigin: String,
    src: String,
  },
  emits: ['load', 'error'],
  setup:
    (props, { emit }) =>
    () =>
      h('img', {
        'data-aspect-ratio': props.aspectRatio !== undefined ? String(props.aspectRatio) : undefined,
        crossorigin: props.crossorigin,
        src: props.src,
        onLoad: () => emit('load'),
        onError: () => emit('error'),
      }),
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
    expect(image?.src).toContain(component === PosterCard ? '&maxWidth=500' : '&maxWidth=1280')
    expect(image?.src).toContain('&quality=80')
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
    expect(image?.src).toContain('&maxWidth=1280')
    expect(image?.src).toContain('&quality=80')
    expect(Number(image?.dataset.aspectRatio)).toBeCloseTo(3 / 2, 5)
  })
})

describe.each([
  ['PosterCard', PosterCard],
  ['BackdropCard', BackdropCard],
  ['PlayingBackdropCard', PlayingBackdropCard],
])('%s glass optical exclusion lifecycle', (_name, component) => {
  it('excludes glass backdrop sampling only after the real image loads cleanly', async () => {
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      props: { media },
    })
    const card = container.querySelector('.v-card')!
    const image = container.querySelector('img')!

    expect(card).not.toHaveAttribute('data-glass-optical-mode')

    image.dispatchEvent(new Event('load'))
    await nextTick()
    expect(card).toHaveAttribute('data-glass-optical-mode', 'excluded')

    image.dispatchEvent(new Event('error'))
    await nextTick()
    expect(card).not.toHaveAttribute('data-glass-optical-mode')
  })
})

describe.each([
  ['PosterCard', PosterCard],
  ['BackdropCard', BackdropCard],
  ['PlayingBackdropCard', PlayingBackdropCard],
])('%s native dashboard actions', (_name, component) => {
  it('offers local iOS playback and opening the matching media server', async () => {
    const item = { ...media, server: undefined }
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      props: { media: item, server: 'Emby-客厅' },
    })
    const card = container.querySelector('.v-card')
    expect(card).not.toBeNull()
    const menu = readNativeCardMenu(card!)!
    expect(menu.items.map(item => item.title)).toEqual(['播放', '在 Emby 中打开'])

    expect(await nativeCardMenus.menus.select(menu.presentationId, 'action-play', async () => {})).toBe(true)
    expect(mocks.play).toHaveBeenCalledWith('emby-item-1', 'Test media', 'Emby-客厅')

    const openMenu = readNativeCardMenu(card!)!
    expect(await nativeCardMenus.menus.select(openMenu.presentationId, 'action-open-server', async () => {})).toBe(true)
    expect(openMediaServerItem).toHaveBeenCalledWith(item)
  })

  it('hides local playback when the media cannot be resolved from its server', async () => {
    const { container } = await renderWithProviders(component, {
      global: { stubs: { VImg: VImgStub } },
      props: {
        media: { ...media, item_id: undefined, id: undefined, server: undefined },
        server: undefined,
      },
    })
    const card = container.querySelector('.v-card')!
    const menu = readNativeCardMenu(card)!
    expect(menu.items.map(item => item.id)).toEqual(['action-open-server'])
  })
})
