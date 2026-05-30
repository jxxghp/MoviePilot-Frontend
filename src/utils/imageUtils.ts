/**
 * 静态资源导入工具函数
 * 用于在生产环境中正确引用静态资源
 */

// 导入所有 logo 图标
import qbittorrentLogo from '@/assets/images/logos/qbittorrent.png'
import transmissionLogo from '@/assets/images/logos/transmission.png'
import rtorrentLogo from '@/assets/images/logos/rtorrent.png'
import embyLogo from '@/assets/images/logos/emby.png'
import zspaceLogo from '@/assets/images/logos/zspace.webp'
import jellyfinLogo from '@/assets/images/logos/jellyfin.png'
import plexLogo from '@/assets/images/logos/plex.png'
import trimemediaLogo from '@/assets/images/logos/trimemedia.png'
import ugreenLogo from '@/assets/images/logos/ugreen.png'
import wechatLogo from '@/assets/images/logos/wechat.png'
import feishuLogo from '@/assets/images/logos/feishu.png'
import clawbotLogo from '@/assets/images/logos/clawbot.png'
import telegramLogo from '@/assets/images/logos/telegram.webp'
import slackLogo from '@/assets/images/logos/slack.webp'
import discordLogo from '@/assets/images/logos/discord.png'
import synologychatLogo from '@/assets/images/logos/synologychat.png'
import vocechatLogo from '@/assets/images/logos/vocechat.png'
import downloaderLogo from '@/assets/images/logos/downloader.png'
import mediaserverLogo from '@/assets/images/logos/mediaserver.png'
import notificationLogo from '@/assets/images/logos/notification.png'
import chromeLogo from '@/assets/images/logos/chrome.png'
import doubanLogo from '@/assets/images/logos/douban.png'
import githubLogo from '@/assets/images/logos/github.png'
import tmdbLogo from '@/assets/images/logos/tmdb.png'
import fanartLogo from '@/assets/images/logos/fanart.webp'
import pythonLogo from '@/assets/images/logos/python.png'
import pluginLogo from '@/assets/images/logos/plugin.png'
import siteLogo from '@/assets/images/logos/site.webp'
import bangumiLogo from '@/assets/images/logos/bangumi.png'
import doubanBlackLogo from '@/assets/images/logos/douban-black.png'
import qqLogo from '@/assets/images/logos/qq.png'

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
  ugreen: ugreenLogo,
  wechat: wechatLogo,
  feishu: feishuLogo,
  wechatclawbot: clawbotLogo,
  telegram: telegramLogo,
  slack: slackLogo,
  discord: discordLogo,
  synologychat: synologychatLogo,
  vocechat: vocechatLogo,
  downloader: downloaderLogo,
  mediaserver: mediaserverLogo,
  notification: notificationLogo,
  chrome: chromeLogo,
  douban: doubanLogo,
  github: githubLogo,
  tmdb: tmdbLogo,
  fanart: fanartLogo,
  python: pythonLogo,
  plugin: pluginLogo,
  site: siteLogo,
  bangumi: bangumiLogo,
  'douban-black': doubanBlackLogo,
  qq: qqLogo,
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
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === 'lain.bgm.tv' || hostname.endsWith('.lain.bgm.tv')
  } catch {
    return url.includes('lain.bgm.tv')
  }
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
  if (isBangumiImageUrl(url))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodedUrl}${useCache ? '&cache=true' : ''}`
  if (useCache)
    return `${import.meta.env.VITE_API_BASE_URL}system/cache/image?url=${encodedUrl}`
  if (url.includes('doubanio.com'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/0?imgurl=${encodedUrl}`
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
