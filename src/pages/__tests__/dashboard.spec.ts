import DashboardPage from '@/pages/dashboard.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const grid = {
    batchUpdate: vi.fn(),
    column: vi.fn(),
    destroy: vi.fn(),
    enableMove: vi.fn(),
    enableResize: vi.fn(),
    engine: { nodes: [] as Array<Record<string, unknown>> },
    getColumn: vi.fn(() => 12),
    load: vi.fn(),
    makeWidget: vi.fn((element: HTMLElement, widget: Record<string, unknown>) => {
      const node = { ...widget, el: element, id: widget.id }
      Object.assign(element, { gridstackNode: node })
      grid.engine.nodes.push(node)
    }),
    on: vi.fn(),
    removeAll: vi.fn(() => {
      grid.engine.nodes.forEach(node => {
        const element = node.el as HTMLElement | undefined
        if (element) delete (element as HTMLElement & { gridstackNode?: unknown }).gridstackNode
      })
      grid.engine.nodes.length = 0
    }),
    removeWidget: vi.fn(),
    resizeToContent: vi.fn(),
    save: vi.fn(() => []),
    setAnimation: vi.fn(),
    setStatic: vi.fn(),
    update: vi.fn((element: HTMLElement, widget: Record<string, unknown>) => {
      Object.assign((element as HTMLElement & { gridstackNode?: Record<string, unknown> }).gridstackNode ?? {}, widget)
    }),
  }

  return {
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    displayWidth: undefined as unknown as { value: number },
    grid,
    gridInit: vi.fn<(options: unknown, element: unknown) => unknown>(() => grid),
    openSharedDialog: vi.fn(),
    themeName: undefined as unknown as { value: string },
    useDynamicButton: vi.fn(),
  }
})

class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  disconnect() {}

  observe(target: Element) {
    requestAnimationFrame(() => {
      this.callback([{ contentRect: { height: 240 }, target } as ResizeObserverEntry], this)
    })
  }

  unobserve() {}
}

class LayoutSourceResizeObserverMock implements ResizeObserver {
  static readonly instances: LayoutSourceResizeObserverMock[] = []

  readonly observed = new Set<Element>()
  readonly unobserved = new Set<Element>()
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    LayoutSourceResizeObserverMock.instances.push(this)
  }

  disconnect() {
    this.observed.clear()
  }

  observe(target: Element) {
    this.observed.add(target)
  }

  unobserve(target: Element) {
    this.observed.delete(target)
    this.unobserved.add(target)
  }

  resize(target: Element, height: number) {
    this.callback([{ contentRect: { height }, target } as ResizeObserverEntry], this)
  }
}

async function findLayoutSourceObserver(source: Element) {
  await waitFor(() => {
    expect(LayoutSourceResizeObserverMock.instances.some(observer => observer.observed.has(source))).toBe(true)
  })

  return LayoutSourceResizeObserverMock.instances.find(observer => observer.observed.has(source))!
}

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

vi.mock('vuetify', async importOriginal => {
  const { ref } = await import('vue')
  mocks.displayWidth = ref(1512)
  mocks.themeName = ref('light')

  return {
    ...(await importOriginal<typeof import('vuetify')>()),
    useDisplay: () => ({ width: mocks.displayWidth }),
    useTheme: () => ({ global: { name: mocks.themeName } }),
  }
})

vi.mock('gridstack', () => ({
  GridStack: {
    init: (options: unknown, element: unknown) => mocks.gridInit(options, element),
  },
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  return {
    usePWA: () => ({ appMode: ref(false) }),
  }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/components/misc/DashboardElement.vue', async () => {
  const { defineComponent, h, onMounted, ref } = await import('vue')

  return {
    default: defineComponent({
      name: 'DashboardElement',
      props: {
        config: { type: Object, required: true },
      },
      emits: ['loaded'],
      setup(props, { emit }) {
        const showLayoutSizeSource = ref(false)
        onMounted(() => emit('loaded'))

        return () =>
          h(
            'section',
            {
              'data-dashboard-id': (props.config as { id: string }).id,
              'data-testid': 'dashboard-item',
              onClick: () => {
                showLayoutSizeSource.value = !showLayoutSizeSource.value
              },
            },
            [
              (props.config as { name: string }).name,
              showLayoutSizeSource.value
                ? h('div', { 'data-layout-size-source': '', 'data-testid': 'layout-size-source' }, 'size source')
                : null,
            ],
          )
      },
    }),
  }
})

const enabledOnlySystemInfo = {
  cpu: false,
  latest: false,
  library: false,
  mediaRecommend: false,
  mediaStatistic: false,
  memory: false,
  network: false,
  playing: false,
  quickActions: false,
  recentImports: false,
  scheduler: false,
  speed: false,
  storage: false,
  systemInfo: true,
  weeklyOverview: false,
}

const enabledOnlyLibrary = {
  ...enabledOnlySystemInfo,
  library: true,
  systemInfo: false,
}

const enabledLibraryAndSystemInfo = {
  ...enabledOnlySystemInfo,
  library: true,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

async function renderDashboard() {
  return renderWithProviders(DashboardPage, {
    initialRoute: '/dashboard',
    initialState: {
      user: {
        permissions: { ...DEFAULT_PERMISSIONS, discovery: true },
        superUser: true,
      },
    },
  })
}

describe('dashboard page initial layout', () => {
  beforeEach(() => {
    LayoutSourceResizeObserverMock.instances.length = 0
    mocks.grid.engine.nodes.length = 0
    mocks.gridInit.mockClear()
    mocks.grid.resizeToContent.mockClear()
    mocks.grid.setAnimation.mockClear()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.displayWidth.value = 1512
    mocks.themeName.value = 'light'
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('renders the cached profile on the first frame without waiting for remote validation', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem('MP_DASHBOARD_ORDER', JSON.stringify([{ id: 'systemInfo', key: '' }]))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()

    expect(screen.getAllByTestId('dashboard-item')).toHaveLength(1)
    expect(screen.getByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'systemInfo')
    expect(mocks.gridInit).toHaveBeenCalledWith(expect.objectContaining({ animate: true }), expect.any(HTMLElement))
    expect(container.querySelector('.dashboard-grid')).not.toHaveClass('is-revealed')
    await waitFor(() => expect(mocks.grid.setAnimation).toHaveBeenCalledWith(true))

    remoteOrder.resolve({ data: { value: [{ id: 'systemInfo', key: '' }] } })
    remoteProfile.resolve({
      data: {
        value: {
          enabled: enabledOnlySystemInfo,
          items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
          updatedAt: 10,
        },
      },
    })

    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())
  })

  it('disables automatic grid transitions only while browsing with the glass theme', async () => {
    mocks.themeName.value = 'glass'
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder' || url === '/user/config/DashboardGridLayout') {
        return { data: {} }
      }
      if (url === '/user/config/Dashboard') return { data: {} }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()

    expect(mocks.gridInit).toHaveBeenCalledWith(expect.objectContaining({ animate: false }), expect.any(HTMLElement))
    await waitFor(() => expect(mocks.grid.setAnimation).toHaveBeenCalledWith(false))

    await fireEvent.click(document.querySelector('.compact-fab--primary') as HTMLElement)
    await waitFor(() => expect(mocks.grid.setAnimation).toHaveBeenCalledWith(true))
  })

  it('keeps the upstream progressive default while an uncached remote profile is loading', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()

    expect(screen.getAllByTestId('dashboard-item')).toHaveLength(10)
    expect(mocks.gridInit).toHaveBeenCalledWith(expect.objectContaining({ animate: true }), expect.any(HTMLElement))

    remoteOrder.resolve({ data: { value: [{ id: 'systemInfo', key: '' }] } })
    remoteProfile.resolve({
      data: {
        value: {
          enabled: enabledOnlySystemInfo,
          items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
          updatedAt: 20,
        },
      },
    })

    expect(await screen.findByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'systemInfo')
  })

  it('applies the shared remote order before profile validation settles', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    const enabled = {
      ...enabledOnlySystemInfo,
      quickActions: true,
      recentImports: true,
    }
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled,
        items: {},
        updatedAt: 10,
      }),
    )
    localStorage.setItem(
      'MP_DASHBOARD_ORDER',
      JSON.stringify([
        { id: 'systemInfo', key: '' },
        { id: 'recentImports', key: '' },
        { id: 'quickActions', key: '' },
      ]),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    expect(screen.getAllByTestId('dashboard-item').map(item => item.getAttribute('data-dashboard-id'))).toEqual([
      'systemInfo',
      'recentImports',
      'quickActions',
    ])

    remoteOrder.resolve({
      data: {
        value: [
          { id: 'quickActions', key: '' },
          { id: 'recentImports', key: '' },
          { id: 'systemInfo', key: '' },
        ],
      },
    })

    await waitFor(() =>
      expect(screen.getAllByTestId('dashboard-item').map(item => item.getAttribute('data-dashboard-id'))).toEqual([
        'quickActions',
        'recentImports',
        'systemInfo',
      ]),
    )
  })

  it('prepares an automatic card with its last measured profile height without making it manual', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlyLibrary,
        items: { library: { x: 0, y: 0, w: 12 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem('MP_DASHBOARD_GRID_AUTO_HEIGHTS', JSON.stringify({ library: 27 }))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    const libraryItem = container.querySelector('.dashboard-grid-item[gs-id="library"]')

    expect(libraryItem).toHaveAttribute('gs-h', '27')
    expect(libraryItem).not.toHaveClass('is-manual-height')

    remoteOrder.resolve({ data: { value: [{ id: 'library', key: '' }] } })
    remoteProfile.resolve({
      data: {
        value: {
          enabled: enabledOnlyLibrary,
          items: { library: { x: 0, y: 0, w: 12 } },
          updatedAt: 10,
        },
      },
    })
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())
  })

  it('observes an async size source and remeasures only its automatic card', async () => {
    vi.stubGlobal('ResizeObserver', LayoutSourceResizeObserverMock)
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledLibraryAndSystemInfo,
        items: { library: { x: 0, y: 0, w: 6 }, systemInfo: { x: 6, y: 0, w: 6 } },
        updatedAt: 10,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') {
        return {
          data: {
            value: [
              { id: 'library', key: '' },
              { id: 'systemInfo', key: '' },
            ],
          },
        }
      }
      if (url === '/user/config/DashboardGridLayout') {
        return {
          data: {
            value: {
              enabled: enabledLibraryAndSystemInfo,
              items: { library: { x: 0, y: 0, w: 6 }, systemInfo: { x: 6, y: 0, w: 6 } },
            },
          },
        }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))))
    mocks.grid.resizeToContent.mockClear()

    const libraryDashboard = screen
      .getAllByTestId('dashboard-item')
      .find(element => element.getAttribute('data-dashboard-id') === 'library')!
    await fireEvent.click(libraryDashboard)
    const sizeSource = libraryDashboard.querySelector('[data-layout-size-source]')!
    const observer = await findLayoutSourceObserver(sizeSource)
    const libraryItem = container.querySelector('.dashboard-grid-item[gs-id="library"]')
    const systemInfoItem = container.querySelector('.dashboard-grid-item[gs-id="systemInfo"]')
    observer.resize(sizeSource, 480)

    await waitFor(() => expect(mocks.grid.resizeToContent).toHaveBeenCalledWith(libraryItem))
    expect(mocks.grid.resizeToContent).toHaveBeenCalledTimes(1)
    expect(mocks.grid.resizeToContent).not.toHaveBeenCalledWith(systemInfoItem)

    mocks.grid.resizeToContent.mockClear()
    sizeSource.append(document.createElement('span'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.grid.resizeToContent).not.toHaveBeenCalled()

    await fireEvent.click(libraryDashboard)
    await waitFor(() => expect(observer.unobserved.has(sizeSource)).toBe(true))
  })

  it('ignores size source changes for manually sized cards', async () => {
    vi.stubGlobal('ResizeObserver', LayoutSourceResizeObserverMock)
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlyLibrary,
        items: { library: { x: 0, y: 0, w: 12, h: 20 } },
        updatedAt: 10,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return { data: { value: [{ id: 'library', key: '' }] } }
      if (url === '/user/config/DashboardGridLayout') {
        return {
          data: { value: { enabled: enabledOnlyLibrary, items: { library: { x: 0, y: 0, w: 12, h: 20 } } } },
        }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    mocks.grid.resizeToContent.mockClear()

    await fireEvent.click(screen.getByTestId('dashboard-item'))
    const sizeSource = container.querySelector('[data-layout-size-source]')!
    const observer = await findLayoutSourceObserver(sizeSource)
    observer.resize(sizeSource, 480)
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    expect(mocks.grid.resizeToContent).not.toHaveBeenCalled()
  })

  it('ignores size source changes while editing an automatic card', async () => {
    vi.stubGlobal('ResizeObserver', LayoutSourceResizeObserverMock)
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({ enabled: enabledOnlyLibrary, items: { library: { x: 0, y: 0, w: 12 } }, updatedAt: 10 }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return { data: { value: [{ id: 'library', key: '' }] } }
      if (url === '/user/config/DashboardGridLayout') {
        return { data: { value: { enabled: enabledOnlyLibrary, items: { library: { x: 0, y: 0, w: 12 } } } } }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.grid.resizeToContent).toHaveBeenCalled())
    mocks.grid.resizeToContent.mockClear()

    await fireEvent.click(screen.getByTestId('dashboard-item'))
    const sizeSource = container.querySelector('[data-layout-size-source]')!
    const observer = await findLayoutSourceObserver(sizeSource)
    await fireEvent.click(document.querySelector('.compact-fab--primary') as HTMLElement)
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    mocks.grid.resizeToContent.mockClear()
    observer.resize(sizeSource, 480)
    await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    expect(mocks.grid.resizeToContent).not.toHaveBeenCalled()
  })

  it('applies a newer remote profile and refreshes the local first-frame cache', async () => {
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
        updatedAt: 10,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') {
        return { data: { value: [{ id: 'quickActions', key: '' }] } }
      }
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()

    expect(screen.getByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'systemInfo')
    remoteProfile.resolve({
      data: {
        value: {
          enabled: { ...enabledOnlySystemInfo, quickActions: true, systemInfo: false },
          items: { quickActions: { x: 8, y: 0, w: 4, h: 5 } },
          updatedAt: 20,
        },
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'quickActions'),
    )
    expect(JSON.parse(localStorage.getItem('MP_DASHBOARD_GRID_LAYOUT') || '{}')).toEqual({
      enabled: { ...enabledOnlySystemInfo, quickActions: true, systemInfo: false },
      items: { quickActions: { x: 8, y: 0, w: 4, h: 5 } },
      updatedAt: 20,
    })
  })

  it('restores default coordinates when a newer remote profile clears cached layout overrides', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 0, y: 12, w: 8, h: 6 } },
        updatedAt: 10,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))
    expect(mocks.grid.makeWidget.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ id: 'systemInfo', x: 0, y: 12, w: 8 }),
    )
    mocks.grid.load.mockClear()

    remoteOrder.resolve({ data: { value: [{ id: 'systemInfo', key: '' }] } })
    remoteProfile.resolve({
      data: {
        value: {
          enabled: enabledOnlySystemInfo,
          items: {},
          updatedAt: 20,
        },
      },
    })
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())

    let loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    expect(loadedWidgets.find(widget => widget.id === 'systemInfo')).toEqual(
      expect.objectContaining({ x: 8, y: 27, w: 4 }),
    )

    mocks.grid.load.mockClear()
    await fireEvent.click(document.querySelector('.compact-fab--primary') as HTMLElement)
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())

    loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    expect(loadedWidgets.find(widget => widget.id === 'systemInfo')).toEqual(
      expect.objectContaining({ x: 8, y: 27, w: 4 }),
    )
  })

  it('falls back to the default dashboard after an uncached remote miss', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder' || url === '/user/config/DashboardGridLayout') {
        return { data: {} }
      }
      if (url === '/user/config/Dashboard') return { data: {} }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()

    await waitFor(() => expect(screen.getAllByTestId('dashboard-item')).toHaveLength(10))
  })

  it('registers the default desktop widgets in target position order', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder' || url === '/user/config/DashboardGridLayout') {
        return { data: {} }
      }
      if (url === '/user/config/Dashboard') return { data: {} }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(10))

    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'storage',
      'mediaStatistic',
      'speed',
      'recentImports',
      'scheduler',
      'memory',
      'cpu',
      'quickActions',
      'systemInfo',
      'mediaRecommend',
    ])
    const desktopReturnWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    expect(desktopReturnWidgets).toHaveLength(10)
    expect(desktopReturnWidgets.find(widget => widget.id === 'mediaRecommend')).toEqual(
      expect.objectContaining({ x: 0, y: 33, w: 8 }),
    )
  })

  it('registers cached automatic heights without forcing independent columns to share a baseline', async () => {
    localStorage.setItem(
      'MP_DASHBOARD_GRID_AUTO_HEIGHTS',
      JSON.stringify({
        cpu: 18,
        mediaRecommend: 27,
        mediaStatistic: 11,
        memory: 18,
        quickActions: 9,
        recentImports: 27,
        scheduler: 23,
        speed: 19,
        storage: 11,
        systemInfo: 10,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder' || url === '/user/config/DashboardGridLayout') {
        return { data: {} }
      }
      if (url === '/user/config/Dashboard') return { data: {} }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(10))
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())

    const loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    const widgets = Object.fromEntries(loadedWidgets.map(widget => [widget.id, widget])) as Record<
      string,
      Record<string, unknown>
    >
    expect(widgets.storage).toEqual(expect.objectContaining({ x: 0, y: 0, w: 4, h: 11 }))
    expect(widgets.mediaStatistic).toEqual(expect.objectContaining({ x: 4, y: 0, w: 8, h: 11 }))
    expect(widgets.speed).toEqual(expect.objectContaining({ x: 0, y: 7, w: 4, h: 19 }))
    expect(widgets.recentImports).toEqual(expect.objectContaining({ x: 4, y: 7, w: 4, h: 27 }))
    expect(widgets.scheduler).toEqual(expect.objectContaining({ x: 8, y: 7, w: 4, h: 23 }))
    expect(widgets.memory).toEqual(expect.objectContaining({ x: 0, y: 22, w: 4, h: 18 }))
    expect(widgets.cpu).toEqual(expect.objectContaining({ x: 4, y: 22, w: 4, h: 18 }))
    expect(widgets.quickActions).toEqual(expect.objectContaining({ x: 8, y: 22, w: 4, h: 9 }))
    expect(widgets.systemInfo).toEqual(expect.objectContaining({ x: 8, y: 27, w: 4, h: 10 }))
    expect(widgets.mediaRecommend).toEqual(expect.objectContaining({ x: 0, y: 33, w: 8, h: 27 }))
    await waitFor(() => {
      const autoHeights = JSON.parse(localStorage.getItem('MP_DASHBOARD_GRID_AUTO_HEIGHTS') || '{}')
      expect(autoHeights.speed).toBe(19)
      expect(autoHeights.scheduler).toBe(23)
      expect(widgets.speed.h).toBe(19)
      expect(widgets.scheduler.h).toBe(23)
    })
  })

  it('keeps a live automatic height when entering layout editing', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 8, y: 0, w: 4 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem('MP_DASHBOARD_GRID_AUTO_HEIGHTS', JSON.stringify({ systemInfo: 6 }))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))
    const element = container.querySelector<HTMLElement & { gridstackNode?: Record<string, unknown> }>(
      '.dashboard-grid-item[gs-id="systemInfo"]',
    )
    expect(element?.gridstackNode?.h).toBe(6)

    if (element?.gridstackNode) element.gridstackNode.h = 13
    mocks.grid.load.mockClear()
    await fireEvent.click(document.querySelector('.compact-fab--primary') as HTMLElement)
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())

    const loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    expect(loadedWidgets.find(widget => widget.id === 'systemInfo')).toEqual(expect.objectContaining({ h: 13 }))
  })

  it('keeps a live automatic height for the default layout when entering editing', async () => {
    const remoteOrder = deferred<unknown>()
    const remoteProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({ enabled: enabledOnlySystemInfo, items: {}, updatedAt: 10 }),
    )
    localStorage.setItem('MP_DASHBOARD_GRID_AUTO_HEIGHTS', JSON.stringify({ systemInfo: 6 }))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return remoteOrder.promise
      if (url === '/user/config/DashboardGridLayout') return remoteProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    const { container } = await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))
    const element = container.querySelector<HTMLElement & { gridstackNode?: Record<string, unknown> }>(
      '.dashboard-grid-item[gs-id="systemInfo"]',
    )
    expect(element?.gridstackNode?.h).toBe(6)

    if (element?.gridstackNode) element.gridstackNode.h = 13
    mocks.grid.load.mockClear()
    await fireEvent.click(document.querySelector('.compact-fab--primary') as HTMLElement)
    await waitFor(() => expect(mocks.grid.load).toHaveBeenCalled())

    const loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    expect(loadedWidgets.find(widget => widget.id === 'systemInfo')).toEqual(expect.objectContaining({ h: 13 }))
  })

  it('registers an arbitrary saved layout by position instead of settings order', async () => {
    const enabled = {
      ...enabledOnlySystemInfo,
      quickActions: true,
      recentImports: true,
    }
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled,
        items: {
          quickActions: { x: 7, y: 0, w: 5, h: 8 },
          recentImports: { x: 1, y: 12, w: 8, h: 19 },
          systemInfo: { x: 3, y: 40, w: 6, h: 9 },
        },
        updatedAt: 10,
      }),
    )
    localStorage.setItem(
      'MP_DASHBOARD_ORDER',
      JSON.stringify([
        { id: 'systemInfo', key: '' },
        { id: 'recentImports', key: '' },
        { id: 'quickActions', key: '' },
      ]),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') {
        return { data: { value: JSON.parse(localStorage.getItem('MP_DASHBOARD_ORDER') || '[]') } }
      }
      if (url === '/user/config/DashboardGridLayout') {
        return { data: { value: JSON.parse(localStorage.getItem('MP_DASHBOARD_GRID_LAYOUT') || '{}') } }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(3))

    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'quickActions',
      'recentImports',
      'systemInfo',
    ])
    const widgets = Object.fromEntries(
      mocks.grid.makeWidget.mock.calls.map(([, widget]) => [widget.id, widget]),
    ) as Record<string, Record<string, unknown>>
    expect(widgets.quickActions).toEqual(expect.objectContaining({ x: 7, y: 0, w: 5, h: 8 }))
    expect(widgets.recentImports).toEqual(expect.objectContaining({ x: 1, y: 12, w: 8, h: 19 }))
    expect(widgets.systemInfo).toEqual(expect.objectContaining({ x: 3, y: 40, w: 6, h: 9 }))
  })

  it('ignores an initial profile response after the viewport switches to another profile', async () => {
    const initialOrder = deferred<unknown>()
    const initialDesktopProfile = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT_MOBILE',
      JSON.stringify({
        enabled: enabledOnlyLibrary,
        items: { library: { x: 0, y: 0, w: 1, h: 20 } },
        updatedAt: 20,
      }),
    )
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') return initialOrder.promise
      if (url === '/user/config/DashboardGridLayout') return initialDesktopProfile.promise
      if (url === '/user/config/DashboardGridLayoutMobile') {
        return {
          data: {
            value: {
              enabled: enabledOnlyLibrary,
              items: { library: { x: 0, y: 0, w: 1, h: 20 } },
              updatedAt: 20,
            },
          },
        }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    mocks.displayWidth.value = 390
    expect(await screen.findByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'library')

    initialOrder.resolve({ data: { value: [{ id: 'systemInfo', key: '' }] } })
    initialDesktopProfile.resolve({
      data: {
        value: {
          enabled: enabledOnlySystemInfo,
          items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
          updatedAt: 30,
        },
      },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/plugin/dashboard/meta'))
    expect(screen.getByTestId('dashboard-item')).toHaveAttribute('data-dashboard-id', 'library')
    expect(mocks.apiPost).not.toHaveBeenCalledWith(
      '/user/config/DashboardGridLayoutMobile',
      expect.objectContaining({ items: { systemInfo: expect.anything() } }),
    )
  })

  it('rebuilds each responsive profile immediately before remote validation', async () => {
    const mobileProfile = deferred<unknown>()
    const desktopReturnProfile = deferred<unknown>()
    let desktopProfileReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder' || url === '/user/config/Dashboard') {
        return { data: {} }
      }
      if (url === '/user/config/DashboardGridLayout') {
        desktopProfileReads += 1

        return desktopProfileReads === 1 ? { data: {} } : desktopReturnProfile.promise
      }
      if (url === '/user/config/DashboardGridLayoutMobile') return mobileProfile.promise
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(10))
    mocks.grid.column.mockClear()
    mocks.grid.makeWidget.mockClear()
    mocks.grid.removeAll.mockClear()
    mocks.grid.update.mockClear()

    mocks.displayWidth.value = 390
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/user/config/DashboardGridLayoutMobile'))
    await waitFor(() => expect(mocks.grid.column).toHaveBeenCalledWith(1, 'list'))
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(10))
    expect(mocks.grid.setAnimation).toHaveBeenCalledWith(true)
    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'storage',
      'mediaStatistic',
      'mediaRecommend',
      'speed',
      'scheduler',
      'cpu',
      'memory',
      'recentImports',
      'quickActions',
      'systemInfo',
    ])
    mocks.grid.makeWidget.mockClear()

    mobileProfile.resolve({ data: {} })
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(2))
    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'storage',
      'mediaStatistic',
      'mediaRecommend',
      'speed',
      'scheduler',
      'cpu',
      'memory',
      'recentImports',
      'quickActions',
      'systemInfo',
    ])

    mocks.grid.column.mockClear()
    mocks.grid.makeWidget.mockClear()
    mocks.grid.removeAll.mockClear()
    mocks.grid.update.mockClear()

    mocks.displayWidth.value = 1512
    await waitFor(() => expect(desktopProfileReads).toBe(2))
    await waitFor(() => expect(mocks.grid.column).toHaveBeenCalledWith(12, 'moveScale'))
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(10))
    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'storage',
      'mediaStatistic',
      'speed',
      'recentImports',
      'scheduler',
      'memory',
      'cpu',
      'quickActions',
      'systemInfo',
      'mediaRecommend',
    ])
    mocks.grid.makeWidget.mockClear()

    desktopReturnProfile.resolve({ data: {} })
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(2))
    expect(mocks.grid.makeWidget.mock.calls.map(([, widget]) => widget.id)).toEqual([
      'storage',
      'mediaStatistic',
      'speed',
      'recentImports',
      'scheduler',
      'memory',
      'cpu',
      'quickActions',
      'systemInfo',
      'mediaRecommend',
    ])
  })

  it('rebuilds a legacy responsive profile before its migration save settles', async () => {
    const mobileProfile = deferred<unknown>()
    const migrationSave = deferred<unknown>()
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem('MP_DASHBOARD_ORDER', JSON.stringify([{ id: 'systemInfo', key: '' }]))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') {
        return { data: { value: [{ id: 'systemInfo', key: '' }] } }
      }
      if (url === '/user/config/DashboardGridLayout') {
        return {
          data: {
            value: {
              enabled: enabledOnlySystemInfo,
              items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
              updatedAt: 20,
            },
          },
        }
      }
      if (url === '/user/config/DashboardGridLayoutMobile') return mobileProfile.promise
      if (url === '/user/config/Dashboard') return { data: { value: enabledOnlyLibrary } }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })
    mocks.apiPost.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardGridLayoutMobile') return migrationSave.promise
      throw new Error('Unexpected POST ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))

    mocks.displayWidth.value = 390
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('/user/config/DashboardGridLayoutMobile'))
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(1))
    mocks.grid.removeAll.mockClear()
    mocks.grid.load.mockClear()

    mobileProfile.resolve({
      data: {
        value: {
          items: { library: { x: 0, y: 0, w: 1, h: 20 } },
          updatedAt: 30,
        },
      },
    })

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        '/user/config/DashboardGridLayoutMobile',
        expect.objectContaining({ enabled: enabledOnlyLibrary }),
      ),
    )
    await waitFor(() => expect(mocks.grid.removeAll).toHaveBeenCalledTimes(1))
    expect(mocks.grid.load.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ id: 'library', x: 0, y: 0, w: 1, h: 20 }),
    ])

    migrationSave.resolve({ data: {} })
  })

  it('keeps a newer remote legacy layout when its merged migration save fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT',
      JSON.stringify({
        enabled: enabledOnlySystemInfo,
        items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem(
      'MP_DASHBOARD_GRID_LAYOUT_MOBILE',
      JSON.stringify({
        enabled: enabledOnlyLibrary,
        items: { library: { x: 0, y: 0, w: 1, h: 10 } },
        updatedAt: 10,
      }),
    )
    localStorage.setItem('MP_DASHBOARD_ORDER', JSON.stringify([{ id: 'systemInfo', key: '' }]))
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardOrder') {
        return { data: { value: [{ id: 'systemInfo', key: '' }] } }
      }
      if (url === '/user/config/DashboardGridLayout') {
        return {
          data: {
            value: {
              enabled: enabledOnlySystemInfo,
              items: { systemInfo: { x: 8, y: 0, w: 4, h: 6 } },
              updatedAt: 20,
            },
          },
        }
      }
      if (url === '/user/config/DashboardGridLayoutMobile') {
        return {
          data: {
            value: {
              items: { library: { x: 0, y: 5, w: 1, h: 20 } },
              updatedAt: 30,
            },
          },
        }
      }
      if (url === '/plugin/dashboard/meta') return []
      throw new Error('Unexpected GET ' + url)
    })
    mocks.apiPost.mockImplementation((url: string) => {
      if (url === '/user/config/DashboardGridLayoutMobile') {
        return Promise.reject(new Error('migration save failed'))
      }
      throw new Error('Unexpected POST ' + url)
    })

    await renderDashboard()
    await waitFor(() => expect(mocks.grid.makeWidget).toHaveBeenCalledTimes(1))

    mocks.displayWidth.value = 390
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        '/user/config/DashboardGridLayoutMobile',
        expect.objectContaining({ enabled: enabledOnlyLibrary, updatedAt: 30 }),
      ),
    )
    await waitFor(() => {
      const loadedWidgets = mocks.grid.load.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>> | undefined

      expect(loadedWidgets?.find(widget => widget.id === 'library')).toEqual(
        expect.objectContaining({ x: 0, y: 5, w: 1, h: 20 }),
      )
    })
    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(expect.any(Error)))
    consoleError.mockRestore()
  })
})
