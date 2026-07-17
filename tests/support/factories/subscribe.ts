import type {
  DownloaderConf,
  FilterRuleGroup,
  MediaInfo,
  Site,
  Subscribe,
  SubscribeShare,
  SubscribeShareStatistics,
  TransferDirectoryConf,
} from '@/api/types'
import { createMediaInfo } from './media'

let subscribeSeed = 1000
let subscribeShareSeed = 2000
let siteSeed = 100

/** 构造满足前端订阅契约的最小记录。 */
export function createSubscribe(overrides: Partial<Subscribe> = {}): Subscribe {
  subscribeSeed += 1
  return {
    best_version: 0,
    best_version_full: 0,
    current_priority: 0,
    date: '2026-07-16',
    downloader: '',
    episode_group: '',
    id: subscribeSeed,
    last_update: '2026-07-16 12:00:00',
    name: `测试订阅 ${subscribeSeed}`,
    show_edit_dialog: false,
    sites: [],
    state: 'R',
    tmdbid: subscribeSeed,
    type: '电影',
    username: 'tester',
    year: '2026',
    ...overrides,
  }
}

/** 构造订阅分享列表、卡片与复用弹窗共同使用的稳定记录。 */
export function createSubscribeShare(overrides: Partial<SubscribeShare> = {}): SubscribeShare {
  subscribeShareSeed += 1
  return {
    backdrop: `https://images.example.com/share-backdrop-${subscribeShareSeed}.jpg`,
    count: 3,
    date: '2026-07-17 12:00:00',
    id: subscribeShareSeed,
    name: `分享媒体 ${subscribeShareSeed}`,
    poster: `https://images.example.com/share-poster-${subscribeShareSeed}.jpg`,
    share_comment: `分享说明 ${subscribeShareSeed}`,
    share_title: `分享标题 ${subscribeShareSeed}`,
    share_uid: `share-user-${subscribeShareSeed}`,
    share_user: `分享用户 ${subscribeShareSeed}`,
    subscribe_id: subscribeShareSeed + 1000,
    tmdbid: subscribeShareSeed,
    type: '电影',
    vote: 8.2,
    year: '2026',
    ...overrides,
  }
}

/** 构造分享排行榜使用的稳定聚合记录。 */
export function createSubscribeShareStatistics(
  overrides: Partial<SubscribeShareStatistics> = {},
): SubscribeShareStatistics {
  subscribeShareSeed += 1
  return {
    share_count: 2,
    share_user: `统计用户 ${subscribeShareSeed}`,
    total_reuse_count: 5,
    ...overrides,
  }
}

/** 构造电影媒体信息。 */
export function createSubscribeMovie(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return createMediaInfo({ type: '电影', ...overrides })
}

/** 构造电视剧媒体信息。 */
export function createSubscribeTv(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return createMediaInfo({
    season: 1,
    season_info: [
      { episode_count: 12, name: '第 1 季', season_number: 1 },
      { episode_count: 10, name: '第 2 季', season_number: 2 },
    ],
    type: '电视剧',
    ...overrides,
  })
}

/** 构造订阅站点选项。 */
export function createSubscribeSite(overrides: Partial<Site> = {}): Site {
  siteSeed += 1
  return {
    domain: `site-${siteSeed}.example.com`,
    downloader: '',
    id: siteSeed,
    is_active: true,
    name: `测试站点 ${siteSeed}`,
    url: `https://site-${siteSeed}.example.com`,
    ...overrides,
  }
}

/** 构造下载器选项。 */
export function createSubscribeDownloader(overrides: Partial<DownloaderConf> = {}): DownloaderConf {
  return {
    config: {},
    default: false,
    enabled: true,
    name: '测试下载器',
    type: 'qbittorrent',
    ...overrides,
  }
}

/** 构造下载目录配置。 */
export function createSubscribeDirectory(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    download_path: '/downloads',
    name: '测试目录',
    priority: 1,
    storage: 'local',
    transfer_type: 'link',
    ...overrides,
  }
}

/** 构造订阅过滤规则组。 */
export function createSubscribeRuleGroup(overrides: Partial<FilterRuleGroup> = {}): FilterRuleGroup {
  return {
    name: '默认规则组',
    rule_string: 'priority=1',
    ...overrides,
  }
}
