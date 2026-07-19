import type { DownloaderConf, Site, SiteStatistic, SiteUserData } from '@/api/types'

let siteSeed = 0

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
    ratio: 2,
    seeding: 3,
    upload: 2048,
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
