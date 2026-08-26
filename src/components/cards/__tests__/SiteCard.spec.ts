import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import SiteCard from '@/components/cards/SiteCard.vue'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSite, createSiteStatistic, createSiteUserData } from '@tests/support/factories/site'
import { deleteSiteHandler, siteIconHandler, testSiteConnectionHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const ImageStub = defineComponent({
  inheritAttrs: false,
  props: {
    alt: String,
    src: String,
  },
  setup: props => () => h('img', { alt: props.alt, src: props.src }),
})

const imageStubs = { VImg: ImageStub }

async function renderCard(
  siteOverrides: Partial<Site> = {},
  props: Partial<{ data: SiteUserData; sortable: boolean; stats: SiteStatistic }> = {},
) {
  const site = createSite(siteOverrides)
  server.use(siteIconHandler(site.id, `https://images.example.com/site-${site.id}.png`))
  const result = await renderWithProviders(SiteCard, {
    global: { stubs: imageStubs },
    props: { site, ...props },
  })

  await waitFor(() => {
    expect(result.container.querySelector<HTMLImageElement>('img')?.src).toContain(`site-${site.id}.png`)
  })
  await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
  return { ...result, site }
}

function getActionButton(container: Element, index: number) {
  const button = container.querySelectorAll<HTMLButtonElement>('.site-card-actions > button')[index]
  if (!button) throw new Error(`Missing action button ${index}`)
  return button
}

function getTestButton(container: Element) {
  const button = container.querySelector('.pulse-dot')?.closest('button')
  if (!button) throw new Error('Missing connectivity test button')
  return button
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, () => void>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('SiteCard display', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  it('renders active site metadata, transfer values, feature flags, and a healthy border', async () => {
    const { container, site } = await renderCard(
      { filter: 'free', limit_interval: 10, proxy: true, render: true },
      {
        data: createSiteUserData({ download: 1024, upload: 2048 }),
        stats: createSiteStatistic({ lst_state: 0, seconds: 2 }),
      },
    )

    expect(screen.getByText(site.name)).toBeInTheDocument()
    expect(screen.getByText(site.url)).toBeInTheDocument()
    expect(screen.getByText('2.00 KB')).toBeInTheDocument()
    expect(screen.getByText('1.00 KB')).toBeInTheDocument()
    expect(container.querySelector('.site-card')).toHaveClass('border-success')
    expect(container.querySelectorAll('.ml-auto.flex.shrink-0.items-center.gap-2 > div')).toHaveLength(4)
    expect(
      [...container.querySelectorAll('.border-t .v-progress-linear')].map(progress =>
        progress.getAttribute('aria-valuenow'),
      ),
    ).toEqual(['100', '50'])
  })

  it.each([
    ['failed', createSiteStatistic({ lst_state: 1 }), 'border-error'],
    ['slow', createSiteStatistic({ lst_state: 0, seconds: 5 }), 'border-warning'],
    ['unknown without stats', undefined, null],
    ['unknown without duration', createSiteStatistic({ lst_state: 0, seconds: 0 }), null],
  ] as const)('projects %s connection state without inventing status', async (_case, stats, borderClass) => {
    const { container } = await renderCard({}, stats ? { stats } : {})
    const card = container.querySelector('.site-card')

    if (borderClass) expect(card).toHaveClass(borderClass)
    else expect(card).not.toHaveClass('border-error', 'border-warning', 'border-success')
  })

  it('keeps zero transfer data visible with stable minimum progress', async () => {
    await renderCard({ is_active: false }, { data: createSiteUserData({ download: 0, upload: 0 }) })

    expect(screen.getAllByText('0.00 B')).toHaveLength(2)
    expect(
      [...document.querySelectorAll('.border-t .v-progress-linear')].map(progress =>
        progress.getAttribute('aria-valuenow'),
      ),
    ).toEqual(['3', '3'])
  })
})

describe('SiteCard interactions', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['success', 200, { success: true }, 'success'],
    ['business failure', 200, { message: '认证失败', success: false }, 'error'],
  ] as const)(
    'reports connectivity %s and refreshes the current domain',
    async (_case, status, response, toastType) => {
      const requested = vi.fn()
      const { container, emitted, site } = await renderCard()
      server.use(testSiteConnectionHandler(site.id, response, status, requested))

      await fireEvent.click(getTestButton(container))

      await waitFor(() => expect(requested).toHaveBeenCalledOnce())
      const toast = toastType === 'success' ? mocks.toastSuccess : mocks.toastError
      await waitFor(() => expect(toast).toHaveBeenCalledOnce())
      expect(emitted('refresh-stats')).toEqual([[site.domain]])
      expect(getTestButton(container)).not.toBeDisabled()
    },
  )

  it('restores connectivity controls after an HTTP failure', async () => {
    const requested = vi.fn()
    const { container, emitted, site } = await renderCard()
    server.use(testSiteConnectionHandler(site.id, { message: 'server down', success: false }, 500, requested))

    await fireEvent.click(getTestButton(container))
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())

    await waitFor(() => expect(getTestButton(container)).not.toBeDisabled())
    expect(emitted('refresh-stats') ?? []).toHaveLength(0)
  })

  it.each([
    ['cancelled', false, 200, { success: true }, false, null],
    ['success', true, 200, { success: true }, true, null],
    ['business failure', true, 200, { message: '仍在使用', success: false }, false, '仍在使用'],
    ['HTTP failure', true, 500, { message: 'server down', success: false }, false, null],
  ] as const)('handles deletion when %s', async (_case, confirmed, status, response, removed, expectedMessage) => {
    const requested = vi.fn()
    mocks.confirm.mockResolvedValue(confirmed)
    const { container, emitted, site } = await renderCard()
    server.use(deleteSiteHandler(site.id, response, status, requested))

    await fireEvent.click(getActionButton(container, 3))
    await fireEvent.click(await screen.findByText('删除站点'))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())

    if (confirmed) await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    else expect(requested).not.toHaveBeenCalled()
    expect(emitted('remove') ?? []).toHaveLength(removed ? 1 : 0)
    if (expectedMessage) expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining(expectedMessage))
    if (_case === 'HTTP failure') expect(mocks.toastError).toHaveBeenCalledOnce()
  })

  it('opens each shared dialog with exact props, close events, and refresh ownership', async () => {
    const { container, emitted, site } = await renderCard()

    await fireEvent.click(container.querySelector('.site-card') as Element)
    expect(getDialogCall().props).toEqual({ site })
    expect(getDialogCall().options).toEqual({ closeOn: ['close'] })
    getDialogCall().events.close()
    expect(emitted('refresh-stats')).toEqual([[site.domain]])

    await fireEvent.click(getActionButton(container, 1))
    expect(getDialogCall(1).props).toEqual({ site })
    expect(getDialogCall(1).options).toEqual({ closeOn: ['close'] })

    await fireEvent.click(getActionButton(container, 2))
    expect(getDialogCall(2).props).toEqual({ site })
    expect(getDialogCall(2).options).toEqual({ closeOn: ['close', 'done'] })
    getDialogCall(2).events.done()
    expect(emitted('refresh-stats')).toEqual([[site.domain], [site.domain]])

    await fireEvent.click(getActionButton(container, 3))
    await fireEvent.click(await screen.findByText('编辑站点'))
    expect(getDialogCall(3).props).toEqual({ siteid: site.id })
    expect(getDialogCall(3).options).toEqual({ closeOn: ['close', 'save', 'remove'] })
    getDialogCall(3).events.save()
    getDialogCall(3).events.remove()
    expect(emitted('update')).toHaveLength(1)
    expect(emitted('remove')).toHaveLength(1)
  })

  it('opens the site URL normally and isolates every card action in sortable mode', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container, rerender, site } = await renderCard()

    await fireEvent.click(screen.getByText(site.url))
    expect(open).toHaveBeenCalledWith(site.url, '_blank')

    await rerender({ site, sortable: true })
    expect(container.querySelector('.site-card-actions')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByText(site.url))
    await fireEvent.click(container.querySelector('.site-card') as Element)
    expect(open).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('silently falls back to the default icon when the icon is unavailable', async () => {
    const site = createSite()
    const requested = vi.fn()
    server.use(siteIconHandler(site.id, null, 200, requested))
    const { container } = await renderWithProviders(SiteCard, {
      global: { stubs: imageStubs },
      props: { site },
    })

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('/site.webp'))
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
