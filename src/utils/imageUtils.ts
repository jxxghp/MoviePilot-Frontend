/**
 * 静态资源导入工具函数
 * 用于在生产环境中正确引用静态资源
 */

import { getActivePinia } from 'pinia'

// 导入所有 logo 图标
import qbittorrentLogo from '@/assets/images/logos/qbittorrent.png'
import transmissionLogo from '@/assets/images/logos/transmission.png'
import rtorrentLogo from '@/assets/images/logos/rtorrent.png'
import embyLogo from '@/assets/images/logos/emby.png'
import zspaceLogo from '@/assets/images/logos/zspace.webp'
import jellyfinLogo from '@/assets/images/logos/jellyfin.png'
import plexLogo from '@/assets/images/logos/plex.png'
import trimemediaLogo from '@/assets/images/logos/trimemedia.png'
import mediavaultLogo from '@/assets/images/logos/mediavault.png'
import ugreenLogo from '@/assets/images/logos/ugreen.png'
import wechatLogo from '@/assets/images/logos/wechat.png'
import feishuLogo from '@/assets/images/logos/feishu.png'
import clawbotLogo from '@/assets/images/logos/clawbot.png'
import telegramLogo from '@/assets/images/logos/telegram.webp'
import slackLogo from '@/assets/images/logos/slack.webp'
import discordLogo from '@/assets/images/logos/discord.png'
import dingtalkLogo from '@/assets/images/logos/dingtalk.jpg'
import synologychatLogo from '@/assets/images/logos/synologychat.png'
import vocechatLogo from '@/assets/images/logos/vocechat.png'
import downloaderLogo from '@/assets/images/logos/downloader.png'
import mediaserverLogo from '@/assets/images/logos/mediaserver.png'
import notificationLogo from '@/assets/images/logos/notification.png'
import chromeLogo from '@/assets/images/logos/chrome.png'
import doubanLogo from '@/assets/images/logos/douban.png'
import githubLogo from '@/assets/images/logos/github.png'
import acoustidLogo from '@/assets/images/logos/acoustid.png'
import anilistLogo from '@/assets/images/logos/anilist.png'
import imdbLogo from '@/assets/images/logos/imdb.png'
import listenBrainzLogo from '@/assets/images/logos/listenbrainz.png'
import musicBrainzLogo from '@/assets/images/logos/musicbrainz.png'
import theAudioDbLogo from '@/assets/images/logos/theaudiodb.png'
import traceMoeLogo from '@/assets/images/logos/tracemoe.png'
import tmdbLogo from '@/assets/images/logos/tmdb.png'
import fanartLogo from '@/assets/images/logos/fanart.webp'
import pythonLogo from '@/assets/images/logos/python.png'
import pluginLogo from '@/assets/images/logos/plugin.png'
import siteLogo from '@/assets/images/logos/site.webp'
import bangumiLogo from '@/assets/images/logos/bangumi.png'
import doubanBlackLogo from '@/assets/images/logos/douban-black.png'
import qqLogo from '@/assets/images/logos/qq.png'
import { useGlobalSettingsStore } from '@/stores'

// 图标映射表
const logoMap: Record<string, string> = {
  qbittorrent: qbittorrentLogo,
  transmission: transmissionLogo,
  rtorrent: rtorrentLogo,
  emby: embyLogo,
  zspace: zspaceLogo,
  jellyfin: jellyfinLogo,
  plex: plexLogo,
  trimemedia: trimemediaLogo,
  mediavault: mediavaultLogo,
  ugreen: ugreenLogo,
  wechat: wechatLogo,
  feishu: feishuLogo,
  wechatclawbot: clawbotLogo,
  telegram: telegramLogo,
  slack: slackLogo,
  discord: discordLogo,
  dingtalk: dingtalkLogo,
  synologychat: synologychatLogo,
  vocechat: vocechatLogo,
  downloader: downloaderLogo,
  mediaserver: mediaserverLogo,
  notification: notificationLogo,
  chrome: chromeLogo,
  douban: doubanLogo,
  github: githubLogo,
  acoustid: acoustidLogo,
  anilist: anilistLogo,
  imdb: imdbLogo,
  listenbrainz: listenBrainzLogo,
  musicbrainz: musicBrainzLogo,
  theaudiodb: theAudioDbLogo,
  tracemoe: traceMoeLogo,
  tmdb: tmdbLogo,
  fanart: fanartLogo,
  python: pythonLogo,
  plugin: pluginLogo,
  site: siteLogo,
  bangumi: bangumiLogo,
  'douban-black': doubanBlackLogo,
  qq: qqLogo,
}

const BANGUMI_IMAGE_HOSTS = new Set(['bgm.tv', 'bangumi.tv', 'bangumi.lol'])
const BANGUMI_IMAGE_HOST_SUFFIXES = ['.bgm.tv', '.bangumi.tv', '.bangumi.lol']

type BangumiImageProxyMode = 'query' | 'host' | 'path'

interface BangumiImageProxyBase {
  url: string
  mode: BangumiImageProxyMode
}

/**
 * 获取图标 URL
 * @param logoName 图标名称
 * @returns 图标的 URL
 */
export function getLogoUrl(logoName: string): string {
  return logoMap[logoName] || ''
}

/**
 * 判断是否为需要强制走后端代理的 Bangumi 图片。
 * @param url 图片地址
 * @returns 是否为 Bangumi 图片地址
 */
export function isBangumiImageUrl(url: string): boolean {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '')
    return BANGUMI_IMAGE_HOSTS.has(hostname) || BANGUMI_IMAGE_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

/**
 * 读取 Bangumi 图片代理配置。
 * @returns 当前全局设置中的 Bangumi 图片代理配置
 */
function getBangumiImageProxySettings(): { enabled: boolean; baseUrl: string } {
  const pinia = getActivePinia()
  if (!pinia) return { enabled: false, baseUrl: '' }

  const settings = useGlobalSettingsStore(pinia).globalSettings
  return {
    enabled: settings.BANGUMI_PROXY_ENABLE === true,
    baseUrl: String(settings.BANGUMI_IMAGE_DOMAIN || '').trim(),
  }
}

/**
 * 归一化 Bangumi 图片代理地址，并根据写法确定拼接模式。
 * @param baseUrl 图片代理 Base URL
 * @returns 可用的代理地址与拼接模式，无效地址返回 null
 */
function normalizeBangumiImageProxyBaseUrl(baseUrl: string): BangumiImageProxyBase | null {
  const rawUrl = baseUrl.trim()
  if (!rawUrl) return null

  const candidate = rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.hash) {
    return null
  }

  if (parsed.search) return { url: candidate, mode: 'query' }
  let normalizedUrl = candidate
  while (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1)
  return {
    url: normalizedUrl,
    mode: rawUrl.endsWith('/') ? 'host' : 'path',
  }
}

/**
 * 将 Bangumi 原始图片地址转换为配置的图片代理地址。
 * @param imageUrl Bangumi 原始图片地址
 * @param baseUrl 图片代理 Base URL
 * @returns 图片代理地址；配置无效或地址不匹配时返回原地址
 */
function buildBangumiImageProxyUrl(imageUrl: string, baseUrl: string): string {
  if (!isBangumiImageUrl(imageUrl)) return imageUrl
  const proxyBase = normalizeBangumiImageProxyBaseUrl(baseUrl)
  if (!proxyBase) return imageUrl

  const sourceUrl = new URL(imageUrl)
  const proxyUrl = new URL(proxyBase.url)
  if (proxyBase.mode === 'query') {
    return `${proxyBase.url}${encodeURIComponent(imageUrl)}`
  }
  if (proxyBase.mode === 'host') {
    if (sourceUrl.hostname.toLowerCase() === proxyUrl.hostname.toLowerCase()) return imageUrl
    return `${proxyBase.url}${sourceUrl.pathname}${sourceUrl.search}`
  }
  return `${proxyBase.url}/${imageUrl}`
}

/** 后端图片代理参数。 */
export interface ImageProxyOptions {
  proxy?: boolean
  useCache?: boolean
  useCookies?: boolean
}

/**
 * 生成后端图片代理地址，供必须代理的跨域或鉴权图片统一传递全局缓存开关。
 * @param url 原始图片地址
 * @param options 代理、磁盘缓存和媒体服务器 Cookie 选项
 * @returns 后端图片代理地址
 */
export function getProxyImageUrl(url: string, options: ImageProxyOptions = {}): string {
  if (!url || !/^https?:\/\//i.test(url)) return url
  const encodedUrl = encodeURIComponent(url)
  const proxy = options.proxy ? 1 : 0
  const cacheParam = options.useCache ? '&cache=true' : ''
  const cookiesParam = options.useCookies ? '&use_cookies=true' : ''
  return `${import.meta.env.VITE_API_BASE_URL}system/img/${proxy}?imgurl=${encodedUrl}${cacheParam}${cookiesParam}`
}

/**
 * 将远程图片地址转换为前端可直接展示的地址。
 * @param url 原始图片地址
 * @param useCache 是否使用后端图片缓存
 * @returns 转换后的图片地址
 */
export function getDisplayImageUrl(url: string, useCache = false): string {
  if (!url || !/^https?:\/\//i.test(url)) return url
  const encodedUrl = encodeURIComponent(url)
  const bangumiSettings = getBangumiImageProxySettings()
  if (isBangumiImageUrl(url) && bangumiSettings.enabled) {
    const proxiedUrl = buildBangumiImageProxyUrl(url, bangumiSettings.baseUrl)
    return getProxyImageUrl(proxiedUrl, { proxy: true, useCache })
  }
  if (useCache) return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodedUrl}`
  if (url.includes('doubanio.com')) return getProxyImageUrl(url)
  return url
}

/**
 * 获取所有可用的图标名称
 * @returns 图标名称数组
 */
export function getAvailableLogos(): string[] {
  return Object.keys(logoMap)
}

/**
 * 检查图标是否存在
 * @param logoName 图标名称
 * @returns 是否存在
 */
export function hasLogo(logoName: string): boolean {
  return logoName in logoMap
}
