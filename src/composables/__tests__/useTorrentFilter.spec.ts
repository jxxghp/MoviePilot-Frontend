import type { Context } from '@/api/types'
import { useTorrentFilter } from '@/composables/useTorrentFilter'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

interface TorrentOverrides {
  edition?: string
  freeState?: string
  name?: string
  pageUrl?: string
  priOrder?: number
  publishTime?: string
  releaseGroup?: string
  resolution?: string
  season?: string
  seeders?: number
  site?: string
  size?: number
  title?: string
  videoCode?: string
}

function createTorrent(overrides: TorrentOverrides = {}): Context {
  return {
    media_info: {},
    meta_info: {
      edition: overrides.edition ?? 'WEB-DL',
      name: overrides.name ?? '测试媒体',
      resource_pix: overrides.resolution ?? '1080p',
      resource_team: overrides.releaseGroup ?? 'Team A',
      season_episode: overrides.season ?? 'S01',
      video_encode: overrides.videoCode ?? 'H.264',
    },
    torrent_info: {
      page_url: overrides.pageUrl ?? `https://example.test/${overrides.title ?? 'torrent'}`,
      pri_order: overrides.priOrder ?? 0,
      pubdate: overrides.publishTime ?? '2025-01-01T00:00:00Z',
      seeders: overrides.seeders ?? 0,
      site_name: overrides.site ?? 'Site A',
      size: overrides.size ?? 1,
      title: overrides.title ?? '测试资源',
      volume_factor: overrides.freeState ?? 'FREE',
    },
  } as Context
}

describe('useTorrentFilter', () => {
  it('builds unique options and naturally orders whole seasons before episodes', () => {
    const filter = useTorrentFilter()

    filter.filterRowData([
      createTorrent({ season: 'S02', site: 'Site B' }),
      createTorrent({ season: 'S10E01-E03', site: 'Site A' }),
      createTorrent({ season: 'S01E12', site: 'Site A' }),
      createTorrent({ season: 'S10', site: 'Site B' }),
      createTorrent({ season: 'Special' }),
    ])

    expect(filter.filterOptions.site).toEqual(['Site B', 'Site A'])
    expect(filter.filterOptions.season).toEqual(['S10', 'S02', 'S10E01-E03', 'S01E12', 'Special'])
  })

  it('combines filters and exposes every matching original row index', () => {
    const filter = useTorrentFilter()
    const torrents = [
      createTorrent({ releaseGroup: 'Team A', resolution: '2160p', site: 'Site A', title: '匹配一' }),
      createTorrent({ releaseGroup: 'Team B', resolution: '2160p', site: 'Site A', title: '发布组不匹配' }),
      createTorrent({ releaseGroup: 'Team A', resolution: '1080p', site: 'Site A', title: '分辨率不匹配' }),
      createTorrent({ releaseGroup: 'Team A', resolution: '2160p', site: 'Site B', title: '站点不匹配' }),
      createTorrent({ releaseGroup: 'Team A', resolution: '2160p', site: 'Site A', title: '匹配二' }),
    ]
    filter.filterForm.site = ['Site A']
    filter.filterForm.releaseGroup = ['Team A']
    filter.filterForm.resolution = ['2160p']

    const result = filter.filterRowData(torrents)

    expect(result.map(item => item.torrent_info.title)).toEqual(['匹配一', '匹配二'])
    expect(filter.getFilteredIndices()).toEqual([0, 4])
    expect(filter.totalFilteredCount.value).toBe(2)
  })

  it('ignores malformed restored contexts and preserves valid original indices', () => {
    const filter = useTorrentFilter()
    const malformedWithoutTorrent = {
      meta_info: createTorrent().meta_info,
      title: '被错误响应模型展平的缓存资源',
    } as unknown as Context
    const malformedWithoutMeta = {
      torrent_info: createTorrent({ title: '缺少元数据的缓存资源' }).torrent_info,
    } as unknown as Context
    const valid = createTorrent({ title: '可恢复资源' })
    const contexts = [malformedWithoutTorrent, malformedWithoutMeta, valid]

    expect(filter.filterRowData(contexts).map(item => item.torrent_info.title)).toEqual(['可恢复资源'])
    expect(filter.getFilteredIndices()).toEqual([2])
    expect(filter.totalFilteredCount.value).toBe(1)

    expect(filter.filterCardData(contexts).map(item => item.torrent_info.title)).toEqual(['可恢复资源'])
    expect(filter.getFilteredIndices()).toEqual([2])
    expect(filter.totalFilteredCount.value).toBe(1)
  })

  it.each([
    ['default', ['默认小', '默认大']],
    ['site', ['站点 A', '站点 B']],
    ['size', ['体积小', '体积大']],
    ['seeder', ['做种少', '做种多']],
    ['publishTime', ['发布时间早', '发布时间晚']],
  ])('sorts rows by %s in both directions', (sortField, ascendingTitles) => {
    const filter = useTorrentFilter()
    const titles = {
      default: ['默认大', '默认小'],
      publishTime: ['发布时间晚', '发布时间早'],
      seeder: ['做种多', '做种少'],
      site: ['站点 B', '站点 A'],
      size: ['体积大', '体积小'],
    }
    const torrents = [
      createTorrent({
        priOrder: 20,
        publishTime: '2025-02-01T00:00:00Z',
        seeders: 20,
        site: 'Site B',
        size: 20,
        title: titles[sortField as keyof typeof titles][0],
      }),
      createTorrent({
        priOrder: 10,
        publishTime: '2025-01-01T00:00:00Z',
        seeders: 10,
        site: 'Site A',
        size: 10,
        title: titles[sortField as keyof typeof titles][1],
      }),
    ]
    filter.sortField.value = sortField
    filter.sortType.value = 'asc'

    expect(filter.filterRowData(torrents).map(item => item.torrent_info.title)).toEqual(ascendingTitles)

    filter.sortType.value = 'desc'
    expect(filter.filterRowData(torrents).map(item => item.torrent_info.title)).toEqual([...ascendingTitles].reverse())
  })

  it('groups matching cards while preserving every member original index for downstream consumers', () => {
    const filter = useTorrentFilter()
    const torrents = [
      createTorrent({ pageUrl: 'https://example.test/a', site: 'Site A', title: '同组一' }),
      createTorrent({ pageUrl: 'https://example.test/b', site: 'Site A', title: '同组二' }),
      createTorrent({ name: '另一媒体', pageUrl: 'https://example.test/c', site: 'Site B', title: '另一组' }),
    ]
    filter.filterForm.site = ['Site A']

    const result = filter.filterCardData(torrents)

    expect(result).toHaveLength(1)
    expect(result[0].torrent_info.title).toBe('同组一')
    expect(result[0].more?.map(item => item.torrent_info.title)).toEqual(['同组二'])
    expect(filter.totalFilteredCount.value).toBe(2)
    expect(filter.getFilteredIndices()).toEqual([0, 1])
  })

  it.each([
    ['site', ['站点 A', '站点 B']],
    ['size', ['体积小', '体积大']],
    ['seeder', ['做种少', '做种多']],
    ['publishTime', ['发布时间早', '发布时间晚']],
  ])('sorts grouped cards by %s while keeping their original indices aligned', (sortField, ascendingTitles) => {
    const filter = useTorrentFilter()
    const titles = {
      publishTime: ['发布时间晚', '发布时间早'],
      seeder: ['做种多', '做种少'],
      site: ['站点 B', '站点 A'],
      size: ['体积大', '体积小'],
    }
    const torrents = [
      createTorrent({
        name: '媒体一',
        priOrder: 20,
        publishTime: '2025-02-01T00:00:00Z',
        seeders: 20,
        site: 'Site B',
        size: 20,
        title: titles[sortField as keyof typeof titles][0],
      }),
      createTorrent({
        name: '媒体二',
        priOrder: 10,
        publishTime: '2025-01-01T00:00:00Z',
        seeders: 10,
        site: 'Site A',
        size: 10,
        title: titles[sortField as keyof typeof titles][1],
      }),
    ]
    filter.sortField.value = sortField
    filter.sortType.value = 'asc'

    expect(filter.filterCardData(torrents).map(item => item.torrent_info.title)).toEqual(ascendingTitles)
    expect(filter.getFilteredIndices()).toEqual([1, 0])

    filter.sortType.value = 'desc'
    expect(filter.filterCardData(torrents).map(item => item.torrent_info.title)).toEqual([...ascendingTitles].reverse())
    expect(filter.getFilteredIndices()).toEqual([0, 1])
  })

  it('keeps grouped-card sorting stable when comparable torrent metadata is missing', () => {
    const cases: Array<[string, TorrentOverrides]> = [
      ['site', { site: '' }],
      ['size', { size: 0 }],
      ['seeder', { seeders: 0 }],
      ['publishTime', { publishTime: '' }],
    ]

    for (const [sortField, overrides] of cases) {
      const filter = useTorrentFilter()
      filter.sortField.value = sortField
      filter.sortType.value = 'asc'
      const torrents = [
        createTorrent({ ...overrides, name: `${sortField}-一`, title: `${sortField}-一` }),
        createTorrent({ ...overrides, name: `${sortField}-二`, title: `${sortField}-二` }),
      ]

      expect(filter.filterCardData(torrents).map(item => item.torrent_info.title)).toEqual([
        `${sortField}-一`,
        `${sortField}-二`,
      ])
      expect(filter.getFilteredIndices()).toEqual([0, 1])
    }
  })

  it('uses empty controlled defaults and toggles the sort direction in both directions', () => {
    const filter = useTorrentFilter()

    expect(filter.hasActiveFilters()).toBe(false)
    filter.setFilterForm({ site: ['Site A'] })
    expect(filter.filterForm.site).toEqual(['Site A'])
    expect(filter.filterForm.resolution).toEqual([])

    expect(filter.sortType.value).toBe('desc')
    filter.handleSortIconClick()
    expect(filter.sortType.value).toBe('asc')
    filter.handleSortIconClick()
    expect(filter.sortType.value).toBe('desc')
  })

  it('supports controlled filter actions and restores a detached state snapshot', () => {
    const filter = useTorrentFilter()
    filter.filterRowData([createTorrent({ site: 'Site A' }), createTorrent({ site: 'Site B' })])

    filter.selectAll('site')
    filter.filterForm.resolution = ['1080p']
    filter.sortField.value = 'size'
    filter.sortType.value = 'asc'
    const snapshot = filter.getFilterState()

    expect(filter.getFilterCount.value).toBe(3)
    expect(filter.getSelectedFilters.value).toEqual({
      resolution: ['1080p'],
      site: ['Site A', 'Site B'],
    })
    expect(filter.hasActiveFilters()).toBe(true)

    filter.removeFilter('site', 'Site A')
    filter.clearFilter('resolution')
    filter.clearAllFilters()
    filter.sortField.value = 'default'
    filter.sortType.value = 'desc'
    filter.setFilterState(snapshot)

    expect(filter.getFilterForm()).toEqual(snapshot.filterForm)
    expect(filter.sortField.value).toBe('size')
    expect(filter.sortType.value).toBe('asc')
    snapshot.filterForm.site.push('mutated')
    expect(filter.filterForm.site).toEqual(['Site A', 'Site B'])
  })
})
