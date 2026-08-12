import { formatDateDifference } from '@/@core/utils/formatters'
import type { SubscribeShare } from '@/api/types'
import SubscribeShareCard from '@/components/cards/SubscribeShareCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribeShare } from '@tests/support/factories/subscribe'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/router', () => ({
  default: { push: (...args: unknown[]) => mocks.routerPush(...args) },
}))

vi.mock('@iconify/vue', () => ({
  Icon: {
    props: ['icon'],
    template: '<span :data-icon="icon" />',
  },
}))

type ShareOverrides = Partial<SubscribeShare>

function observeElementsImmediately() {
  class ImmediateIntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {}

    observe(target: Element) {
      this.callback([{ intersectionRatio: 1, isIntersecting: true, target } as IntersectionObserverEntry], this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    unobserve() {}
  }

  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)
}

async function renderCard(overrides: ShareOverrides = {}, globalImageCache = false) {
  const media = createSubscribeShare(overrides)
  const result = await renderWithProviders(SubscribeShareCard, {
    initialState: {
      globalSettings: {
        data: { GLOBAL_IMAGE_CACHE: globalImageCache },
        initialized: true,
        loading: false,
      },
    },
    props: { media },
  })

  return { ...result, media }
}

async function loadPoster(container: Element) {
  const backdrop = container.querySelector<HTMLImageElement>('img')
  expect(backdrop).not.toBeNull()
  await fireEvent.load(backdrop as HTMLImageElement)
  await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2))
  return container.querySelectorAll<HTMLImageElement>('img')[1]
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, (...args: unknown[]) => void>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('SubscribeShareCard', () => {
  beforeEach(() => {
    observeElementsImmediately()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('renders sharing metadata and reveals the cached poster after the backdrop loads', async () => {
    const { container, media } = await renderCard({}, true)

    expect(screen.getByText(media.share_title!)).toBeInTheDocument()
    expect(screen.getByText(media.share_comment!)).toBeInTheDocument()
    expect(screen.getByText(media.share_user!)).toBeInTheDocument()
    expect(screen.getByText(media.count!.toLocaleString())).toBeInTheDocument()
    expect(screen.getByText(formatDateDifference(media.date!))).toBeInTheDocument()

    const backdrop = container.querySelector<HTMLImageElement>('img')
    expect(backdrop).not.toBeNull()
    expect((backdrop as HTMLImageElement).src).toContain('system/cache/image?url=')
    expect((backdrop as HTMLImageElement).src).toContain(encodeURIComponent(media.backdrop!))

    const poster = await loadPoster(container)
    expect(poster.src).toContain('system/cache/image?url=')
    expect(poster.src).toContain(encodeURIComponent(media.poster!))

    const dateMetadata = screen.getByText(formatDateDifference(media.date!)).closest('.v-card-text')
    expect(dateMetadata?.querySelector('[data-icon="mdi-calendar"], [data-icon="mdi:calendar"]')).not.toBeNull()
  })

  it('falls back to the poster when the backdrop is missing and hides a zero reuse count', async () => {
    const { container, media } = await renderCard({ backdrop: undefined, count: 0 })

    const backdrop = container.querySelector<HTMLImageElement>('img')
    expect(backdrop).not.toBeNull()
    expect((backdrop as HTMLImageElement).src).toContain(media.poster!)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it.each([
    ['TMDB', { media_id: '1101', media_source: 'themoviedb' }, 'themoviedb', '1101'],
    ['Douban', { media_id: '2202', media_source: 'douban' }, 'douban', '2202'],
    ['Bangumi', { media_id: '3303', media_source: 'bangumi' }, 'bangumi', '3303'],
    ['AniList', { media_id: '4404', media_source: 'anilist' }, 'anilist', '4404'],
  ] as const)(
    'routes media details with %s while keeping the fork dialog closed',
    async (_case, ids, mediaSource, mediaId) => {
      const { container, media } = await renderCard(ids)
      const poster = await loadPoster(container)

      await fireEvent.click(poster)

      expect(mocks.routerPush).toHaveBeenCalledWith({
        path: '/media',
        query: {
          media_id: mediaId,
          media_source: mediaSource,
          title: media.name,
          type: media.type,
          year: media.year,
        },
      })
      expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    },
  )

  it('opens the fork dialog with the exact media and replaces it with editing after fork success', async () => {
    const { container, media } = await renderCard()
    const card = container.querySelector<HTMLElement>('.v-card')
    expect(card).not.toBeNull()

    await fireEvent.click(card as HTMLElement)

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    const forkDialog = getDialogCall()
    expect(forkDialog.props).toEqual({ media })
    expect(forkDialog.options).toEqual({ closeOn: ['close', 'fork', 'delete'] })

    forkDialog.events.fork(4701)

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
    const editDialog = getDialogCall(1)
    expect(editDialog.props).toEqual({ subid: 4701 })
    expect(editDialog.events).toEqual({})
    expect(editDialog.options).toEqual({ closeOn: ['close', 'save', 'remove'] })
  })

  it('forwards deletion from the fork dialog without depending on its response payload', async () => {
    const { container, emitted } = await renderCard()
    const card = container.querySelector<HTMLElement>('.v-card')
    expect(card).not.toBeNull()
    await fireEvent.click(card as HTMLElement)

    getDialogCall().events.delete({ id: 9999 })

    expect(emitted('delete')).toHaveLength(1)
    expect(emitted('delete')?.[0]).toEqual([])
  })
})
