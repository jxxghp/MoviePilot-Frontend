import SubscribePage from '@/pages/subscribe.vue'
import type { DynamicButtonMenuItem } from '@/composables/useDynamicButton'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import {
  computed,
  defineComponent,
  h,
  nextTick,
  ref,
  unref,
  type ComputedRef,
  type Ref,
} from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return {
    usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
  }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

interface SubscribeBatchState {
  enabled: boolean
  selectedCount: number
  totalCount: number
  allSelected: boolean
}

const SubscribeListViewStub = defineComponent({
  name: 'SubscribeListView',
  props: {
    type: String,
    subid: String,
    keyword: String,
    statusFilter: String,
    sortMode: {
      type: Boolean,
      default: false,
    },
    sortBy: {
      type: String,
      default: '',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  emits: ['update:sortMode', 'update:sortBy', 'batch-state-change'],
  setup(props, { emit, expose }) {
    const lastCommand = ref('none')
    const batchState = ref<SubscribeBatchState>({
      enabled: false,
      selectedCount: 0,
      totalCount: 0,
      allSelected: false,
    })

    const runCommand = (command: string) => {
      lastCommand.value = command
    }
    const publishBatchState = (state: SubscribeBatchState) => {
      batchState.value = state
      emit('batch-state-change', state)
    }

    expose({
      enterBatchMode: () => runCommand('enter-batch'),
      exitBatchMode: () => runCommand('exit-batch'),
      toggleSelectAll: () => runCommand('toggle-select-all'),
      batchEnableSubscribes: () => runCommand('batch-enable'),
      batchPauseSubscribes: () => runCommand('batch-pause'),
      batchDeleteSubscribes: () => runCommand('batch-delete'),
      openHistoryDialog: () => runCommand('open-history'),
    })

    return () =>
      h('section', { 'aria-label': 'subscription list stub' }, [
        h('button', { 'data-menu-activator': 'filter-btn', type: 'button' }, 'filter activator'),
        h('output', { 'aria-label': 'list type' }, props.type ?? ''),
        h('output', { 'aria-label': 'list subscription id' }, props.subid ?? ''),
        h('output', { 'aria-label': 'list keyword' }, props.keyword ?? ''),
        h('output', { 'aria-label': 'list status filter' }, props.statusFilter ?? ''),
        h('output', { 'aria-label': 'list sort mode' }, String(props.sortMode)),
        h('output', { 'aria-label': 'list sort by' }, props.sortBy ?? ''),
        h('output', { 'aria-label': 'list active state' }, String(props.active)),
        h('output', { 'aria-label': 'list batch state' }, JSON.stringify(batchState.value)),
        h('output', { 'aria-label': 'last list command' }, lastCommand.value),
        h(
          'button',
          { type: 'button', onClick: () => emit('update:sortMode', true) },
          'emit sort mode on',
        ),
        h(
          'button',
          { type: 'button', onClick: () => emit('update:sortMode', false) },
          'emit sort mode off',
        ),
        h('button', { type: 'button', onClick: () => emit('update:sortBy', 'date') }, 'emit date sort'),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              publishBatchState({ enabled: true, selectedCount: 2, totalCount: 3, allSelected: false }),
          },
          'publish batch selection',
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              publishBatchState({ enabled: true, selectedCount: 3, totalCount: 3, allSelected: true }),
          },
          'publish all selected batch',
        ),
      ])
  },
})

const SubscribePopularViewStub = defineComponent({
  name: 'SubscribePopularView',
  props: { type: String },
  setup(props) {
    return () => h('section', { 'aria-label': 'popular subscription stub' }, props.type ?? '')
  },
})

const SubscribeShareViewStub = defineComponent({
  name: 'SubscribeShareView',
  props: { keyword: String },
  setup(props) {
    return () =>
      h('section', { 'aria-label': 'shared subscription stub' }, [
        h('button', { 'data-menu-activator': 'share-filter-btn', type: 'button' }, 'share filter activator'),
        h('output', { 'aria-label': 'share keyword' }, props.keyword ?? ''),
      ])
  },
})

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>

interface HeaderButtonConfig {
  icon: string
  dataAttr?: string
  action?: () => void
  color?: MaybeRef<string>
  show?: MaybeRef<boolean>
}

interface HeaderTabConfig {
  items: MaybeRef<Array<{ title: string; tab: string }>>
  modelValue: Ref<string>
  appendButtons: HeaderButtonConfig[]
}

interface DynamicButtonConfig {
  icon: MaybeRef<string>
  menuItems?: MaybeRef<DynamicButtonMenuItem[] | undefined>
  onClick?: () => void
  show?: MaybeRef<boolean>
}

interface RenderSubscribeOptions {
  appMode?: boolean
  initialRoute?: string
  subType?: '电影' | '电视剧'
  subscribePermission?: boolean
  superUser?: boolean
}

async function renderSubscribe(options: RenderSubscribeOptions = {}) {
  const subType = options.subType ?? '电影'
  mocks.appMode = options.appMode ?? false

  return renderWithProviders(SubscribePage, {
    initialRoute: options.initialRoute ?? `/subscribe/${subType === '电影' ? 'movie' : 'tv'}`,
    initialRouteMeta: { subType },
    initialState: {
      user: {
        permissions: {
          ...DEFAULT_PERMISSIONS,
          subscribe: options.subscribePermission ?? true,
        },
        superUser: options.superUser ?? false,
      },
    },
    global: {
      stubs: {
        SubscribeListView: SubscribeListViewStub,
        SubscribePopularView: SubscribePopularViewStub,
        SubscribeShareView: SubscribeShareViewStub,
      },
    },
  })
}

function getHeaderConfig() {
  return mocks.registerHeaderTab.mock.calls.at(-1)?.[0] as HeaderTabConfig
}

function getDynamicButtonConfig() {
  return mocks.useDynamicButton.mock.calls.at(-1)?.[0] as DynamicButtonConfig
}

function getHeaderButton(predicate: (button: HeaderButtonConfig) => boolean) {
  const button = getHeaderConfig().appendButtons.find(predicate)
  if (!button) throw new Error('Expected dynamic header button was not registered')
  return button
}

function getListOutput(label: string) {
  return screen.getByLabelText(label)
}

describe('subscribe page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.appMode = false
  })

  it('uses movie route meta and query values to register the movie page contract', async () => {
    const { router } = await renderSubscribe({ initialRoute: '/subscribe/movie?id=42' })

    await waitFor(() => expect(getListOutput('list active state')).toHaveTextContent('true'))
    const header = getHeaderConfig()

    expect(router.currentRoute.value.meta.subType).toBe('电影')
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub', 'popular'])
    expect(header.modelValue.value).toBe('mysub')
    expect(getListOutput('list type')).toHaveTextContent('电影')
    expect(getListOutput('list subscription id')).toHaveTextContent('42')
  })

  it('uses TV route meta and tab query to expose the share page contract', async () => {
    const { router } = await renderSubscribe({
      initialRoute: '/subscribe/tv?tab=share&id=73',
      subType: '电视剧',
    })
    const header = getHeaderConfig()

    expect(router.currentRoute.value.meta.subType).toBe('电视剧')
    expect(unref(header.items).map(item => item.tab)).toEqual(['mysub', 'popular', 'share'])
    expect(header.modelValue.value).toBe('share')
    expect(screen.getByLabelText('share keyword')).toHaveTextContent('')
  })

  it.each([
    ['movie value', '电影' as const, 'last_update', 'last_update'],
    ['TV-only value', '电视剧' as const, 'lack_episode', 'lack_episode'],
    ['invalid value', '电视剧' as const, 'unexpected', ''],
    ['TV-only value on movies', '电影' as const, 'lack_episode', ''],
  ])('normalizes stored sorting for %s', async (_case, subType, storedSort, expectedSort) => {
    localStorage.setItem(`MPSubscribeSortBy:${subType}`, storedSort)

    await renderSubscribe({ subType })

    expect(getListOutput('list sort by')).toHaveTextContent(expectedSort)
  })

  it('keeps page state usable when sort storage reads or writes fail', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage read failed')
    })

    await renderSubscribe()

    expect(getListOutput('list sort by')).toHaveTextContent('')
    expect(consoleWarn).toHaveBeenCalledWith('读取订阅排序方式失败:', expect.any(Error))
    getItem.mockRestore()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage write failed')
    })
    await fireEvent.click(screen.getByRole('button', { name: 'emit date sort' }))

    await waitFor(() => expect(getListOutput('list sort by')).toHaveTextContent('date'))
    expect(consoleWarn).toHaveBeenCalledWith('保存订阅排序方式失败:', expect.any(Error))
  })

  it('coordinates filter and sort state through header actions and list emits', async () => {
    await renderSubscribe({ subType: '电视剧' })
    const filterButton = getHeaderButton(button => button.dataAttr === 'filter-btn')
    const sortButton = getHeaderButton(button => button.icon === 'mdi-sort-variant')

    filterButton.action?.()
    await nextTick()
    const nameInput = await screen.findByPlaceholderText('名称')
    await fireEvent.update(nameInput, 'Matrix')
    expect(getListOutput('list keyword')).toHaveTextContent('Matrix')

    await fireEvent.click(screen.getByText('暂停'))
    expect(getListOutput('list status filter')).toHaveTextContent('paused')

    sortButton.action?.()
    await nextTick()
    expect(getListOutput('list sort mode')).toHaveTextContent('true')
    expect(getListOutput('list sort by')).toHaveTextContent('custom')

    await fireEvent.click(screen.getByRole('button', { name: 'emit sort mode off' }))
    await fireEvent.click(screen.getByRole('button', { name: 'emit date sort' }))
    expect(getListOutput('list sort mode')).toHaveTextContent('false')
    expect(getListOutput('list sort by')).toHaveTextContent('date')
  })

  it('exits batch management before entering drag sorting', async () => {
    await renderSubscribe({ appMode: true })
    const sortButton = getHeaderButton(button => button.icon === 'mdi-sort-variant')
    const batchButton = getHeaderButton(button => button.icon === 'mdi-checkbox-multiple-marked-outline')

    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))
    expect(unref(getDynamicButtonConfig().show)).toBe(true)

    sortButton.action?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('exit-batch')
    expect(getListOutput('list sort mode')).toHaveTextContent('true')
    expect(getListOutput('list sort by')).toHaveTextContent('custom')
    expect(unref(batchButton.color)).toBe('gray')
    expect(unref(getDynamicButtonConfig().show)).toBe(false)
  })

  it('delegates PWA batch actions to the list public API', async () => {
    await renderSubscribe({ appMode: true })
    const batchButton = getHeaderButton(button => button.icon === 'mdi-checkbox-multiple-marked-outline')

    batchButton.action?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('enter-batch')

    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))
    const dynamicButton = getDynamicButtonConfig()
    const menuItems = unref(dynamicButton.menuItems) ?? []

    expect(unref(dynamicButton.show)).toBe(true)
    expect(unref(dynamicButton.icon)).toBe('mdi-checkbox-multiple-marked-outline')
    expect(menuItems.find(item => item.titleKey === 'subscribe.batchSelectAll')?.disabled).toBe(false)

    for (const [titleKey, command] of [
      ['subscribe.batchSelectAll', 'toggle-select-all'],
      ['subscribe.batchEnable', 'batch-enable'],
      ['subscribe.batchPause', 'batch-pause'],
      ['subscribe.batchDelete', 'batch-delete'],
    ] as const) {
      menuItems.find(item => item.titleKey === titleKey)?.action()
      await nextTick()
      expect(getListOutput('last list command')).toHaveTextContent(command)
    }

    dynamicButton.onClick?.()
    await nextTick()
    expect(getListOutput('last list command')).toHaveTextContent('exit-batch')
  })

  it('exits batch mode when the header leaves the personal subscription tab', async () => {
    await renderSubscribe({ appMode: true, subType: '电视剧' })
    await fireEvent.click(screen.getByRole('button', { name: 'publish batch selection' }))

    getHeaderConfig().modelValue.value = 'popular'
    await nextTick()

    expect(getListOutput('last list command')).toHaveTextContent('exit-batch')
    expect(getListOutput('list active state')).toHaveTextContent('false')
    expect(unref(getDynamicButtonConfig().icon)).toBe('mdi-clipboard-edit-outline')
  })

  it('exposes administrator history and default-rule actions on desktop and PWA', async () => {
    const { unmount } = await renderSubscribe({ superUser: true })

    await waitFor(() => expect(document.querySelectorAll('.compact-fab button')).toHaveLength(2))
    const [historyButton, defaultRuleButton] = document.querySelectorAll<HTMLButtonElement>('.compact-fab button')

    await fireEvent.click(historyButton)
    expect(getListOutput('last list command')).toHaveTextContent('open-history')
    await fireEvent.click(defaultRuleButton)
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { default: true, type: '电影' },
      {},
      { closeOn: ['close', 'save'] },
    )
    unmount()

    await renderSubscribe({ appMode: true, superUser: true })
    const dynamicButton = getDynamicButtonConfig()
    expect(unref(dynamicButton.show)).toBe(true)
    expect(unref(dynamicButton.icon)).toBe('mdi-history')
    expect(unref(dynamicButton.menuItems)?.map(item => item.titleKey)).toEqual([
      'dialog.subscribeHistory.title',
      'dialog.subscribeEdit.titleDefault',
    ])
  })

  it.each([
    [true, true],
    [false, false],
  ])('gates the PWA share statistics action by subscribe permission=%s', async (permission, visible) => {
    await renderSubscribe({
      appMode: true,
      initialRoute: '/subscribe/tv?tab=share',
      subType: '电视剧',
      subscribePermission: permission,
    })
    const dynamicButton = getDynamicButtonConfig()

    expect(unref(dynamicButton.show)).toBe(visible)
    if (visible) {
      expect(unref(dynamicButton.icon)).toBe('mdi-chart-line')
      dynamicButton.onClick?.()
      expect(mocks.openSharedDialog).toHaveBeenCalledWith(
        expect.any(Object),
        {},
        {},
        { closeOn: ['close'] },
      )
    }
  })

  it('debounces and trims share search, then cancels pending work on unmount', async () => {
    const { unmount } = await renderSubscribe({
      initialRoute: '/subscribe/tv?tab=share',
      subType: '电视剧',
    })
    getHeaderButton(button => button.dataAttr === 'share-filter-btn').action?.()
    await nextTick()
    const keywordInput = await screen.findByPlaceholderText('关键词')

    vi.useFakeTimers()
    await fireEvent.update(keywordInput, '  science fiction  ')
    expect(getListOutput('share keyword')).toHaveTextContent('')
    vi.advanceTimersByTime(299)
    await nextTick()
    expect(getListOutput('share keyword')).toHaveTextContent('')
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(getListOutput('share keyword')).toHaveTextContent('science fiction')

    await fireEvent.update(keywordInput, 'pending')
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
