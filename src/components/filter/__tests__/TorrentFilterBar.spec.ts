import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeAll: vi.fn(),
  closeSingle: vi.fn(),
  openSharedDialog: vi.fn(),
  updateAll: vi.fn(),
  updateSingle: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const PassThroughStub = defineComponent({
  template: '<div><slot /></div>',
})

const ButtonStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot name="prepend" /><slot /></button>',
})

const ListItemStub = defineComponent({
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\')"><slot name="prepend" /><slot /></button>',
})

const ChipGroupStub = defineComponent({
  emits: ['update:modelValue'],
  template:
    '<button type="button" data-testid="filter-value-control" @click="$emit(\'update:modelValue\', [\'Site B\'])"><slot /></button>',
})

const ChipStub = defineComponent({
  props: {
    closable: { type: Boolean, default: false },
  },
  emits: ['click:close'],
  template:
    '<span><slot /><button v-if="closable" type="button" aria-label="移除筛选" @click="$emit(\'click:close\')" /></span>',
})

const componentStubs = {
  VBadge: PassThroughStub,
  VBtn: ButtonStub,
  VCard: PassThroughStub,
  VCardText: PassThroughStub,
  VChip: ChipStub,
  VChipGroup: ChipGroupStub,
  VDivider: PassThroughStub,
  VIcon: PassThroughStub,
  VList: PassThroughStub,
  VListItem: ListItemStub,
  VListItemTitle: PassThroughStub,
  VMenu: PassThroughStub,
  VSpacer: PassThroughStub,
}

const defaultProps = {
  enableAnimation: false,
  filterForm: {
    edition: [],
    freeState: [],
    releaseGroup: [],
    resolution: [],
    season: [],
    site: ['Site A'],
    videoCode: [],
  },
  filterOptions: {
    edition: [],
    freeState: [],
    releaseGroup: [],
    resolution: [],
    season: ['S01'],
    site: ['Site A', 'Site B'],
    videoCode: [],
  },
  filterTitles: {
    edition: '版本',
    freeState: '促销',
    releaseGroup: '制作组',
    resolution: '分辨率',
    season: '季集',
    site: '站点',
    videoCode: '编码',
  },
  sortField: 'default',
  sortTitles: {
    default: '默认排序',
    publishTime: '发布时间',
    seeder: '做种数',
    site: '站点排序',
    size: '体积',
  },
  sortType: 'desc' as const,
  totalFilteredCount: 2,
}

async function renderFilterBar() {
  return renderWithProviders(TorrentFilterBar, {
    props: defaultProps,
    global: { stubs: componentStubs },
  })
}

describe('TorrentFilterBar', () => {
  beforeEach(() => {
    let openCount = 0
    mocks.openSharedDialog.mockImplementation(() => {
      openCount += 1
      return openCount === 1
        ? { close: mocks.closeSingle, id: 1, updateProps: mocks.updateSingle }
        : { close: mocks.closeAll, id: 2, updateProps: mocks.updateAll }
    })
  })

  it('emits desktop sorting, filtering, selection and clearing commands without mutating props', async () => {
    const result = await renderFilterBar()

    await fireEvent.click(screen.getAllByRole('button', { name: '升序' })[0])
    await fireEvent.click(screen.getAllByRole('button', { name: '体积' })[0])
    const siteValueControl = screen
      .getAllByTestId('filter-value-control')
      .find(control => control.textContent?.includes('Site A'))
    expect(siteValueControl).toBeDefined()
    await fireEvent.click(siteValueControl as HTMLElement)
    await fireEvent.click(screen.getAllByRole('button', { name: '全选' }).at(-1) as HTMLElement)
    await fireEvent.click(screen.getByRole('button', { name: '清除' }))
    await fireEvent.click(screen.getByRole('button', { name: '移除筛选' }))
    await fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))

    expect(result.emitted()['update:sortType']).toEqual([['asc']])
    expect(result.emitted()['update:sortField']).toEqual([['size']])
    expect(result.emitted()['update:filterForm']).toEqual([['site', ['Site B']]])
    expect(result.emitted().selectAll).toEqual([['site']])
    expect(result.emitted().clearFilter).toEqual([['site']])
    expect(result.emitted().removeFilter).toEqual([['site', 'Site A']])
    expect(result.emitted().clearAllFilters).toEqual([[]])
    expect(defaultProps.filterForm.site).toEqual(['Site A'])
  })

  it('drives mobile shared dialogs with current controlled props and closes them on unmount', async () => {
    const result = await renderFilterBar()
    const mobileButtons = Array.from(result.container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile'))
    const siteButton = mobileButtons.find(button => button.textContent?.includes('站点'))
    const seasonButton = mobileButtons.find(button => button.textContent?.includes('季集'))
    const allButton = mobileButtons.find(button => button.textContent?.includes('综合筛选'))

    expect(siteButton).toBeDefined()
    expect(seasonButton).toBeDefined()
    expect(allButton).toBeDefined()
    await fireEvent.click(siteButton as HTMLButtonElement)

    const singleProps = mocks.openSharedDialog.mock.calls[0][1] as Record<string, unknown>
    const singleEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (...args: unknown[]) => void>
    expect(singleProps).toMatchObject({
      filterForm: defaultProps.filterForm,
      filterKey: 'site',
      filterOptions: defaultProps.filterOptions,
      filterTitle: '站点',
    })
    singleEvents['update:filterForm']('site', ['Site B'])
    singleEvents.selectAll('site')
    singleEvents.clearFilter('site')
    expect(result.emitted()['update:filterForm']).toEqual([['site', ['Site B']]])
    expect(result.emitted().selectAll).toEqual([['site']])
    expect(result.emitted().clearFilter).toEqual([['site']])

    await fireEvent.click(seasonButton as HTMLButtonElement)
    expect(mocks.updateSingle).toHaveBeenCalledWith(
      expect.objectContaining({
        filterKey: 'season',
        filterTitle: '季集',
      }),
    )

    await fireEvent.click(allButton as HTMLButtonElement)
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)

    result.unmount()

    expect(mocks.closeSingle).toHaveBeenCalledOnce()
    expect(mocks.closeAll).toHaveBeenCalledOnce()
  })

  it('reopens shared dialogs after their close events release the active controller', async () => {
    const result = await renderFilterBar()
    const mobileButtons = Array.from(result.container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile'))
    const siteButton = mobileButtons.find(button => button.textContent?.includes('站点'))
    const allButton = mobileButtons.find(button => button.textContent?.includes('综合筛选'))

    await fireEvent.click(siteButton as HTMLButtonElement)
    const firstSingleEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (...args: unknown[]) => void>
    firstSingleEvents.close()

    await fireEvent.click(siteButton as HTMLButtonElement)
    const secondSingleEvents = mocks.openSharedDialog.mock.calls[1][2] as Record<string, (...args: unknown[]) => void>
    secondSingleEvents['update:modelValue'](false)

    await fireEvent.click(allButton as HTMLButtonElement)
    const firstAllEvents = mocks.openSharedDialog.mock.calls[2][2] as Record<string, (...args: unknown[]) => void>
    firstAllEvents.close()

    await fireEvent.click(allButton as HTMLButtonElement)
    const secondAllEvents = mocks.openSharedDialog.mock.calls[3][2] as Record<string, (...args: unknown[]) => void>
    secondAllEvents['update:modelValue'](false)

    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(4)
    result.unmount()
  })
})
