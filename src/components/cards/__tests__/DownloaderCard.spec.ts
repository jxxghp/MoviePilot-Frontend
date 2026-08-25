import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useConditionalDataRefresh: () => ({ stop: vi.fn() }),
  }),
}))

vi.mock('@/composables/useCardAccentColor', () => ({
  useCardAccentColor: () => ({
    accentRgb: ref('141, 81, 249'),
    imageRef: ref(),
    updateAccentColor: vi.fn(),
  }),
}))

vi.mock('@/utils/imageUtils', () => ({
  getLogoUrl: () => '/downloader.png',
}))

const passthroughStub = (name: string, tag = 'div') =>
  defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })

const VHoverStub = defineComponent({
  name: 'VHover',
  inheritAttrs: false,
  setup(_props, { slots }) {
    return () => slots.default?.({ props: { onMouseenter: hoverMouseenter } })
  },
})

const hoverMouseenter = vi.fn()

const VCardStub = passthroughStub('VCard', 'article')

const globalStubs = {
  IconBtn: passthroughStub('IconBtn', 'button'),
  VBadge: passthroughStub('VBadge', 'span'),
  VCard: VCardStub,
  VCardText: passthroughStub('VCardText'),
  VDialogCloseBtn: passthroughStub('VDialogCloseBtn', 'button'),
  VHover: VHoverStub,
  VIcon: passthroughStub('VIcon', 'span'),
  VImg: defineComponent({
    name: 'VImg',
    props: { src: String },
    setup(props, { attrs }) {
      return () => h('img', { ...attrs, src: props.src })
    },
  }),
}

const downloader = {
  name: 'qb-main',
  type: 'qbittorrent',
  default: true,
  enabled: false,
  config: {},
}

describe('DownloaderCard', () => {
  it('places draggable attributes on the card DOM instead of the hover wrapper', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const externalMouseenter = vi.fn()
    hoverMouseenter.mockClear()
    const Harness = defineComponent({
      setup() {
        return () =>
          h(DownloaderCard, {
            downloader,
            downloaders: [downloader],
            allowRefresh: false,
            'data-draggable': 'true',
            'aria-label': 'qb-main-card',
            class: 'draggable-item',
            onMouseenter: externalMouseenter,
          })
      },
    })

    const { container } = await renderWithProviders(Harness, {
      global: { stubs: globalStubs },
    })

    const card = container.querySelector('article')
    expect(card).toBeInTheDocument()
    expect(card).toHaveAttribute('data-draggable', 'true')
    expect(card).toHaveAttribute('aria-label', 'qb-main-card')
    expect(card).toHaveClass('draggable-item', 'app-card-shell', 'app-card-colorful')
    expect(container.querySelectorAll('[data-draggable]')).toHaveLength(1)
    card?.dispatchEvent(new MouseEvent('mouseenter'))
    expect(externalMouseenter).toHaveBeenCalledOnce()
    expect(hoverMouseenter).toHaveBeenCalledOnce()

    const attributeWarnings = warn.mock.calls.filter(([message]) =>
      String(message).includes('Extraneous non-props attributes'),
    )
    expect(attributeWarnings).toHaveLength(0)
  })
})
