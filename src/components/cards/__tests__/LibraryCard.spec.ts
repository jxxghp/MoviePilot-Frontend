import type { MediaServerLibrary } from '@/api/types'
import LibraryCard from '@/components/cards/LibraryCard.vue'
import { openMediaServerItem } from '@/utils/appDeepLink'
import emby from '@images/misc/emby.png'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/appDeepLink', () => ({ openMediaServerItem: vi.fn() }))
vi.mock('@/stores', () => ({
  useGlobalSettingsStore: () => ({ globalSettings: { GLOBAL_IMAGE_CACHE: true } }),
}))

const ImageStub = defineComponent({
  props: { src: String },
  emits: ['load', 'error'],
  setup:
    (props, { emit }) =>
    () =>
      h('img', { src: props.src, onError: () => emit('error'), onLoad: () => emit('load') }),
})
const stubs = {
  VHover: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.({ props: {}, isHovering: false }),
  }),
  VCard: defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', { class: 'v-card' }, slots.image?.()),
  }),
  VImg: ImageStub,
}

const media: MediaServerLibrary = {
  server: 'home',
  name: 'Movies',
  server_type: 'emby',
  image_list: ['https://media.example.com/1.jpg', 'https://media.example.com/2.jpg'],
  use_cookies: true,
}

describe('LibraryCard composite image lifecycle', () => {
  let wrapper: ReturnType<typeof mount> | undefined
  let images: Array<{ src: string; onload: (() => void) | null; onerror: (() => void) | null }>
  let encoded: BlobCallback[]
  const createObjectURL = vi.fn(() => 'blob:library-cover')
  const revokeObjectURL = vi.fn()
  const gradient = { addColorStop: vi.fn() }
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    restore: vi.fn(),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    images = []
    encoded = []
    class TestURL extends URL {}
    TestURL.createObjectURL = createObjectURL
    TestURL.revokeObjectURL = revokeObjectURL
    vi.stubGlobal('URL', TestURL)
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        width = 300
        height = 450
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        setAttribute = vi.fn()
        constructor() {
          images.push(this)
        }
      },
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new Error('Synchronous encoding is not allowed')
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      encoded.push(callback)
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function mountCard(value = media) {
    wrapper = mount(LibraryCard, { props: { media: value }, global: { stubs } })
    return wrapper
  }

  async function loadPosters(count = 2) {
    for (let index = 0; index < count; index += 1) {
      expect(images[index]).toBeDefined()
      images[index].onload?.()
      await flushPromises()
    }
  }

  it('keeps original poster order, resolution, reflection and lossless PNG output', async () => {
    mountCard()
    expect(wrapper!.find('canvas').attributes()).toMatchObject({ width: '640', height: '360' })
    await loadPosters()
    expect(images[0].src).toContain(encodeURIComponent(media.image_list![0]))
    expect(images[0].src).toContain('cache=true')
    expect(images[0].src).toContain('use_cookies=true')
    expect(context.drawImage.mock.calls).toEqual([
      [images[0], 8, 0, 150, 256],
      [images[0], 0, 0, 300, 450, 8, 0, 150, 100],
      [images[1], 166, 0, 150, 256],
      [images[1], 0, 0, 300, 450, 166, 0, 150, 100],
    ])
    expect(context.translate).toHaveBeenCalledWith(0, 360)
    expect(context.scale).toHaveBeenCalledWith(1, -1)
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, 'rgba(0, 0, 0, 1)'],
      [1, 'rgba(0, 0, 0, 0.7)'],
      [0, 'rgba(0, 0, 0, 1)'],
      [1, 'rgba(0, 0, 0, 0.7)'],
    ])
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(createObjectURL).not.toHaveBeenCalled()
    const blob = new Blob(['png'], { type: 'image/png' })
    encoded[0](blob)
    await flushPromises()
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(wrapper!.find('img').attributes('src')).toBe('blob:library-cover')
    await wrapper!.find('img').trigger('load')
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await wrapper!.find('.v-card').trigger('click')
    expect(openMediaServerItem).toHaveBeenCalledWith(media)
    wrapper!.unmount()
    wrapper = undefined
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:library-cover')
  })

  it('keeps the object URL while a cached page is inactive', async () => {
    const active = ref(true)
    const Harness = defineComponent({
      setup: () => () => h(KeepAlive, null, () => (active.value ? h(LibraryCard, { media }) : null)),
    })
    wrapper = mount(Harness, { global: { stubs } })
    await loadPosters()
    encoded[0](new Blob(['png']))
    await flushPromises()
    active.value = false
    await flushPromises()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    active.value = true
    await flushPromises()
    expect(wrapper.find('img').attributes('src')).toBe('blob:library-cover')
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })

  it('does not allocate a URL if encoding finishes after unmount', async () => {
    mountCard()
    await loadPosters()
    wrapper!.unmount()
    wrapper = undefined
    encoded[0](new Blob(['png']))
    await flushPromises()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it.each([
    [0, 'onload'],
    [0, 'onerror'],
    [1, 'onload'],
    [1, 'onerror'],
  ] as const)('stops pending poster %s work after unmount on %s', async (index, event) => {
    mountCard()
    if (index > 0) await loadPosters(index)
    const drawCount = context.drawImage.mock.calls.length
    const fillCount = context.fillRect.mock.calls.length
    wrapper!.unmount()
    wrapper = undefined
    images[index][event]?.()
    await flushPromises()
    expect(images).toHaveLength(index + 1)
    expect(context.drawImage).toHaveBeenCalledTimes(drawCount)
    expect(context.fillRect).toHaveBeenCalledTimes(fillCount)
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it.each(['empty', 'throws'] as const)('uses the default image when PNG encoding %s', async failure => {
    if (failure === 'throws')
      vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => {
        throw new Error('Canvas unavailable')
      })
    mountCard()
    await loadPosters()
    if (failure === 'empty') encoded[0](null)
    await flushPromises()
    expect(wrapper!.find('img').attributes('src')).toBe(emby)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('releases a rejected composite URL once and leaves the fallback URL alone', async () => {
    mountCard()
    await loadPosters()
    encoded[0](new Blob(['png']))
    await flushPromises()
    await wrapper!.find('img').trigger('error')
    expect(wrapper!.find('img').attributes('src')).toBe(emby)
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:library-cover')
    wrapper!.unmount()
    wrapper = undefined
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('falls back when the browser cannot allocate an object URL', async () => {
    createObjectURL.mockImplementationOnce(() => {
      throw new Error('Object URL unavailable')
    })
    mountCard()
    await loadPosters()
    encoded[0](new Blob(['png']))
    await flushPromises()
    expect(wrapper!.find('img').attributes('src')).toBe(emby)
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('ignores late display-image events after unmount', async () => {
    mountCard()
    await loadPosters()
    encoded[0](new Blob(['png']))
    await flushPromises()
    const handlers = wrapper!.findComponent(ImageStub).vm.$.vnode.props!
    const state = wrapper!.vm as unknown as { imageLoaded: boolean; imageError: boolean; imgUrl: string }
    wrapper!.unmount()
    wrapper = undefined
    handlers.onLoad()
    handlers.onError()
    expect(state.imageLoaded).toBe(false)
    expect(state.imageError).toBe(false)
    expect(state.imgUrl).toBe('blob:library-cover')
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:library-cover')
  })

  it('preserves failed-poster placeholders and the four-poster limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mountCard({ ...media, image_list: Array.from({ length: 5 }, (_, i) => `https://media.example.com/${i}.jpg`) })
    images[0].onerror?.()
    await flushPromises()
    for (let index = 1; index < 4; index += 1) {
      images[index].onload?.()
      await flushPromises()
    }
    expect(images).toHaveLength(4)
    expect(context.fillRect).toHaveBeenCalledWith(8, 0, 150, 256)
    expect(context.drawImage).toHaveBeenCalledTimes(6)
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1)
  })

  it('keeps direct-image and default-image paths free of canvas encoding and URL ownership', async () => {
    mountCard({ ...media, image_list: [], image: 'https://media.example.com/cover.jpg' })
    await flushPromises()
    expect(wrapper!.find('img').attributes('src')).toContain(encodeURIComponent('https://media.example.com/cover.jpg'))
    await wrapper!.find('img').trigger('error')
    expect(wrapper!.find('img').attributes('src')).toBe(emby)
    expect(images).toHaveLength(0)
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })
})
