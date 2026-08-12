import type { MediaInfo, MusicArtistInfo } from '@/api/types'
import MusicArtistCard from '@/components/cards/MusicArtistCard.vue'
import MusicCard from '@/components/cards/MusicCard.vue'
import MusicDetailLayout from '@/views/discover/MusicDetailLayout.vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const ImageStub = defineComponent({
  name: 'VImg',
  inheritAttrs: false,
  props: { src: String },
  setup:
    (props, { slots }) =>
    () =>
      h('img', { src: props.src }, slots.default?.()),
})

const cachedImageState = {
  globalSettings: {
    data: { GLOBAL_IMAGE_CACHE: true },
    initialized: true,
    loading: false,
  },
  user: {
    permissions: { search: false, subscribe: false },
    superUser: false,
  },
}

/** 断言组件内所有远程音乐图片都已转换为后端全局缓存地址。 */
function expectCachedImages(container: Element, source: string) {
  const images = [...container.querySelectorAll<HTMLImageElement>('img')]
  expect(images.length).toBeGreaterThan(0)
  for (const image of images) {
    expect(image.src).toContain('system/cache/image?url=')
    expect(image.src).toContain(encodeURIComponent(source))
  }
}

describe('music image cache integration', () => {
  it('caches recording and album covers in the dedicated music card', async () => {
    const cover = 'https://coverartarchive.org/release-group/album-1/front-500'
    const music = {
      cover_url: cover,
      media_id: 'recording-1',
      music_type: 'recording',
      media_source: 'musicbrainz',
      title: '测试单曲',
      type: '音乐',
    } as MediaInfo

    const { container } = await renderWithProviders(MusicCard, {
      global: { stubs: { VImg: ImageStub } },
      initialState: cachedImageState,
      props: { music },
    })

    expectCachedImages(container, cover)
  })

  it('caches artist portraits in artist cards', async () => {
    const portrait = 'https://images.example.com/artists/artist-1.jpg'
    const artist = {
      image_url: portrait,
      media_id: 'artist-1',
      music_type: 'artist',
      name: '测试艺术家',
      media_source: 'musicbrainz',
      type: '音乐',
    } as MusicArtistInfo

    const { container } = await renderWithProviders(MusicArtistCard, {
      global: { stubs: { VImg: ImageStub } },
      initialState: cachedImageState,
      props: { artist },
    })

    expectCachedImages(container, portrait)
  })

  it('caches both background and foreground images in the shared music detail layout', async () => {
    const cover = 'https://coverartarchive.org/release-group/album-2/front-500'
    const { container } = await renderWithProviders(MusicDetailLayout, {
      global: { stubs: { VImg: ImageStub } },
      initialState: cachedImageState,
      props: { cover, title: '测试专辑' },
    })

    expectCachedImages(container, cover)
  })
})
