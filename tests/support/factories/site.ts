import type { DownloaderConf, Site, SiteCategory, SiteStatistic, SiteUserData, TorrentInfo } from '@/api/types'

let siteSeed = 0
let torrentSeed = 0

export function createSite(overrides: Partial<Site> = {}): Site {
  siteSeed += 1
  return {
    domain: `site-${siteSeed}.example.com`,
    downloader: '',
    id: siteSeed,
    is_active: true,
    name: `测试站点 ${siteSeed}`,
    pri: siteSeed,
    url: `https://site-${siteSeed}.example.com/`,
    ...overrides,
  }
}

export function createSiteStatistic(overrides: Partial<SiteStatistic> = {}): SiteStatistic {
  return {
    fail: 0,
    lst_state: 0,
    seconds: 1,
    success: 10,
    ...overrides,
  }
}

export function createSiteUserData(overrides: Partial<SiteUserData> = {}): SiteUserData {
  return {
    bonus: 100,
    download: 1024,
    join_at: '2024-01-02 10:00:00',
    ratio: 2,
    seeding: 3,
    seeding_info: [],
    seeding_size: 4 * 1024 ** 3,
    updated_day: '2026-07-18',
    upload: 2048,
    user_level: 'Elite',
    username: 'site-user',
    ...overrides,
  }
}

/** 构造可用的下载器配置测试记录。 */
export function createSiteDownloader(overrides: Partial<DownloaderConf> = {}): DownloaderConf {
  return {
    config: {},
    default: false,
    enabled: true,
    name: '测试下载器',
    type: 'qbittorrent',
    ...overrides,
  }
}

/** 构造站点资源分类测试记录。 */
export function createSiteCategory(overrides: Partial<SiteCategory> = {}): SiteCategory {
  return {
    cat: 'movie',
    desc: '电影',
    id: 1,
    ...overrides,
  }
}

/** 构造满足资源列表展示与下载边界的种子记录。 */
export function createTorrentInfo(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  torrentSeed += 1
  return {
    category: '电影',
    downloadvolumefactor: 1,
    freedate: '',
    freedate_diff: '',
    grabs: 10,
    hit_and_run: false,
    labels: [],
    media_id: '',
    media_source: 'themoviedb',
    peers: 3,
    pri_order: 0,
    seeders: 12,
    site_order: 0,
    site_proxy: false,
    size: 1_073_741_824,
    title: `测试资源 ${torrentSeed}`,
    uploadvolumefactor: 1,
    volume_factor: '1x',
    ...overrides,
  }
}
