/**
 * 通用APP深度链接工具类
 * 支持媒体服务器（Plex、Jellyfin、Emby、极影视、飞牛影视）和豆瓣的APP跳转和网页跳转
 *
 * 深度链接格式参考：
 * - Plex: https://forums.plex.tv/t/plex-mobile-app-deep-linking/123456
 * - Emby: https://emby.media/support/articles/Deep-Linking.html
 * - Jellyfin: https://jellyfin.org/docs/general/administration/deep-linking
 * - 豆瓣: 官方搜索格式
 */

import { isMobileDevice, isIOSDevice, isAndroidDevice } from '@/@core/utils'

// APP类型
export type AppType = 'plex' | 'jellyfin' | 'emby' | 'zspace' | 'trimemedia' | 'douban'

// 深度链接配置
interface DeepLinkConfig {
  appScheme: string
  webUrl: string
  timeout: number
}

// 各APP的深度链接配置
const DEEP_LINK_CONFIGS: Record<AppType, DeepLinkConfig> = {
  plex: {
    appScheme: 'plex://',
    webUrl: 'https://app.plex.tv',
    timeout: 2000,
  },
  jellyfin: {
    appScheme: 'jellyfin://',
    webUrl: 'https://jellyfin.org',
    timeout: 2000,
  },
  emby: {
    appScheme: 'emby://',
    webUrl: 'https://emby.media',
    timeout: 2000,
  },
  zspace: {
    appScheme: 'emby://',
    webUrl: 'https://www.zspace.com.cn',
    timeout: 2000,
  },
  trimemedia: {
    appScheme: 'trimemedia://',
    webUrl: 'https://trimemedia.com',
    timeout: 2000,
  },
  douban: {
    appScheme: 'douban://',
    webUrl: 'https://movie.douban.com',
    timeout: 2000,
  },
}

// 豆瓣APP跳转参数
interface DoubanAppParams {
  doubanId: string
  mediaType?: string
  title?: string
  year?: string
  fallbackUrl?: string
}

// 媒体服务器卡片跳转所需的最小字段集合
interface MediaServerLinkTarget {
  id?: string | number
  item_id?: string | number
  itemId?: string | number
  server_id?: string
  serverId?: string
  link?: string
  server_type?: string
}

// Emby hash 路由中的目标参数
interface EmbyHashTarget {
  mediaId: string | null
  serverId: string | null
}

/**
 * 判断链接参数是否为有效值。
 * @param value 待检查的链接参数
 */
function getValidLinkValue(value?: string | number | null): string | null {
  if (value === undefined || value === null) return null
  const stringValue = String(value).trim()
  if (!stringValue || ['none', 'null', 'undefined'].includes(stringValue.toLowerCase())) return null
  return stringValue
}

/**
 * 获取媒体服务器条目的真实项目ID。
 * @param target 媒体服务器跳转目标
 */
function getTargetItemId(target?: MediaServerLinkTarget): string | null {
  return getValidLinkValue(target?.item_id ?? target?.itemId)
}

/**
 * 获取媒体服务器条目的真实服务器ID。
 * @param target 媒体服务器跳转目标
 */
function getTargetServerId(target?: MediaServerLinkTarget): string | null {
  return getValidLinkValue(target?.server_id ?? target?.serverId)
}

/**
 * 解析媒体服务器网页链接中的 hash 查询参数。
 * @param playUrl 原始播放链接
 */
function getHashRouteParams(playUrl: string): { hashPath: string; params: URLSearchParams } | null {
  const url = new URL(playUrl)
  const hash = url.hash || ''
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) return null
  return {
    hashPath: hash.slice(0, queryIndex),
    params: new URLSearchParams(hash.slice(queryIndex + 1)),
  }
}

/**
 * 从 Emby 网页链接中提取 App 跳转需要的媒体ID和服务器ID。
 * @param playUrl 原始播放链接
 */
function getEmbyHashTarget(playUrl: string): EmbyHashTarget {
  const hashRoute = getHashRouteParams(playUrl)
  if (!hashRoute) return { mediaId: null, serverId: null }

  const serverId = getValidLinkValue(hashRoute.params.get('serverId'))
  if (hashRoute.hashPath.includes('/videos')) {
    return {
      mediaId: getValidLinkValue(hashRoute.params.get('parentId')),
      serverId,
    }
  }

  return {
    mediaId: getValidLinkValue(hashRoute.params.get('id')),
    serverId,
  }
}

/**
 * 使用后端返回的真实ID修正Emby网页链接。
 * @param playUrl 原始播放链接
 * @param target 媒体服务器跳转目标
 */
function normalizeEmbyWebUrl(playUrl: string, target?: MediaServerLinkTarget): string {
  try {
    const url = new URL(playUrl)
    const hashRoute = getHashRouteParams(playUrl)
    if (!hashRoute) return playUrl

    const { hashPath, params } = hashRoute
    const itemId = getTargetItemId(target)
    const serverId = getTargetServerId(target)

    if (itemId && (hashPath.includes('/item') || params.has('id'))) {
      params.set('id', itemId)
    }

    if (itemId && (hashPath.includes('/videos') || params.has('parentId'))) {
      params.set('parentId', itemId)
    }

    if (serverId) {
      params.set('serverId', serverId)
    } else if (params.has('serverId') && !getValidLinkValue(params.get('serverId'))) {
      params.delete('serverId')
    }

    url.hash = `${hashPath}?${params.toString()}`
    return url.toString()
  } catch (error) {
    console.warn('修正Emby网页链接失败:', error)
    return playUrl
  }
}

/**
 * 获取媒体服务器卡片可用的跳转链接。
 * @param target 媒体服务器跳转目标
 */
function getMediaServerPlayUrl(target: MediaServerLinkTarget): string | null {
  const playUrl = getValidLinkValue(target.link)
  if (!playUrl) return null

  const serverType = target.server_type?.toLowerCase()
  if (serverType === 'emby' || serverType === 'zspace') {
    return normalizeEmbyWebUrl(playUrl, target)
  }
  return playUrl
}

/**
 * 打开媒体服务器卡片对应的播放页面。
 * @param target 媒体服务器跳转目标
 */
export async function openMediaServerItem(target: MediaServerLinkTarget): Promise<void> {
  const playUrl = getMediaServerPlayUrl(target)
  if (!playUrl) return
  await openMediaServerWithAutoDetect(playUrl, undefined, target.server_type)
}

/**
 * 尝试跳转到APP，如果失败则跳转到网页
 * @param appType APP类型
 * @param params 跳转参数
 */
export async function openApp(appType: AppType, params: string | DoubanAppParams, fallbackUrl?: string): Promise<void> {
  // 如果不是移动设备，直接使用网页链接
  if (!isMobileDevice()) {
    const webUrl = getWebUrl(appType, params, fallbackUrl)
    window.open(webUrl, '_blank')
    return
  }

  const config = DEEP_LINK_CONFIGS[appType]
  if (!config) {
    console.warn(`不支持的APP类型: ${appType}`)
    const webUrl = getWebUrl(appType, params, fallbackUrl)
    window.open(webUrl, '_blank')
    return
  }

  // 构建APP深度链接
  const appUrl = buildDeepLinkUrl(appType, params)

  console.log(`构建${appType}深度链接:`, {
    params,
    deepLinkUrl: appUrl,
  })

  // 尝试跳转到APP
  try {
    await attemptAppLaunch(appUrl, config.timeout)
  } catch (error) {
    console.log(`${appType} APP跳转失败，使用网页链接: ${error}`)
    // APP跳转失败，使用网页链接
    const webUrl = getWebUrl(appType, params, fallbackUrl)
    window.open(webUrl, '_blank')
  }
}

/**
 * 获取网页链接
 * @param appType APP类型
 * @param params 参数
 * @param fallbackUrl 备用链接
 */
function getWebUrl(appType: AppType, params: string | DoubanAppParams, fallbackUrl?: string): string {
  if (fallbackUrl) return fallbackUrl

  const config = DEEP_LINK_CONFIGS[appType]

  switch (appType) {
    case 'douban':
      const doubanParams = params as DoubanAppParams
      return `${config.webUrl}/subject/${doubanParams.doubanId}`
    default:
      return typeof params === 'string' ? params : config.webUrl
  }
}

/**
 * 构建深度链接URL
 * @param appType APP类型
 * @param params 参数
 */
function buildDeepLinkUrl(appType: AppType, params: string | DoubanAppParams): string {
  switch (appType) {
    case 'plex':
      return buildPlexDeepLink(params as string)

    case 'jellyfin':
      return buildJellyfinDeepLink(params as string)

    case 'emby':
      return buildEmbyDeepLink(params as string)

    case 'zspace':
      return buildEmbyDeepLink(params as string)

    case 'trimemedia':
      return buildTrimemediaDeepLink(params as string)

    case 'douban':
      return buildDoubanDeepLink(params as DoubanAppParams)

    default:
      return typeof params === 'string' ? params : ''
  }
}

/**
 * 构建Plex深度链接
 * 参考: https://forums.plex.tv/t/plex-mobile-app-deep-linking/123456
 *
 * 后台API返回格式：
 * - 媒体库: web/index.html#!/media/{machineIdentifier}/com.plexapp.plugins.library?source={library.key}&X-Plex-Token={token}
 * - 媒体项: web/index.html#!/server/{machineIdentifier}/details?key={item_id}&X-Plex-Token={token}
 *
 * Plex官方APP URL格式：
 * plex://play/?metadataKey=/library/metadata/$SOME_ID&server=$SERVER_ID
 * 例如: plex://play/?metadataKey=/library/metadata/123&server=456
 *
 * @param playUrl 播放链接
 */
function buildPlexDeepLink(playUrl: string): string {
  try {
    const url = new URL(playUrl)

    // 提取媒体ID、机器标识符、库ID等
    let mediaId: string | null = null
    let machineIdentifier: string | null = null
    let libraryKey: string | null = null
    let librarySectionId: string | null = null
    let plexToken: string | null = null

    // 提取X-Plex-Token
    const tokenMatch = playUrl.match(/X-Plex-Token=([^&]+)/)
    if (tokenMatch) {
      plexToken = tokenMatch[1]
      console.log('提取Plex Token:', { plexToken })
    }

    // 格式1: 后台API返回的媒体库格式
    // web/index.html#!/media/{machineIdentifier}/com.plexapp.plugins.library?source={library.key}&X-Plex-Token={token}
    const mediaLibraryMatch = playUrl.match(/\/media\/([^\/]+)\/com\.plexapp\.plugins\.library\?source=([^&]+)/)
    if (mediaLibraryMatch) {
      machineIdentifier = mediaLibraryMatch[1]
      libraryKey = mediaLibraryMatch[2]
      console.log('Plex后台API媒体库格式匹配:', { machineIdentifier, libraryKey })

      // 从library.key中提取section ID
      // library.key格式通常是: library://video-section/1 或类似格式
      const sectionMatch = libraryKey.match(/section\/(\d+)/)
      if (sectionMatch) {
        librarySectionId = sectionMatch[1]
        console.log('从library.key提取section ID:', { librarySectionId })
      }
    }

    // 格式2: 后台API返回的媒体项格式
    // web/index.html#!/server/{machineIdentifier}/details?key={item_id}&X-Plex-Token={token}
    const serverDetailsMatch = playUrl.match(/\/server\/([^\/]+)\/details\?key=([^&]+)/)
    if (serverDetailsMatch) {
      machineIdentifier = serverDetailsMatch[1]
      const keyValue = serverDetailsMatch[2]
      console.log('Plex后台API媒体项格式匹配:', { machineIdentifier, keyValue })

      // 从key中提取媒体ID
      // key格式可能是: /library/metadata/1668 或直接是 1668
      const metadataMatch = keyValue.match(/\/library\/metadata\/(\d+)/)
      if (metadataMatch) {
        mediaId = metadataMatch[1]
        console.log('从key提取媒体ID:', { mediaId })
      } else if (/^\d+$/.test(keyValue)) {
        // 如果key本身就是数字，直接使用
        mediaId = keyValue
        console.log('key本身就是媒体ID:', { mediaId })
      }
    }

    // 构建深度链接 - 使用新的官方格式
    if (mediaId && machineIdentifier) {
      // plex://play/?metadataKey=/library/metadata/$SOME_ID&server=$SERVER_ID
      let deepLink = `plex://play/?metadataKey=/library/metadata/${mediaId}&server=${machineIdentifier}`
      if (plexToken) {
        deepLink += `&X-Plex-Token=${plexToken}`
      }
      console.log('Plex深度链接构建成功:', {
        originalUrl: playUrl,
        machineIdentifier,
        libraryKey,
        librarySectionId,
        mediaId,
        plexToken,
        deepLink,
      })
      return deepLink
    }

    // 如果有媒体ID但没有机器标识符，尝试使用旧的格式作为降级
    if (mediaId) {
      let deepLink = `plex://library/metadata/${mediaId}`
      if (plexToken) {
        deepLink += `?X-Plex-Token=${plexToken}`
      }
      console.log('Plex深度链接构建成功(降级格式):', {
        originalUrl: playUrl,
        mediaId,
        plexToken,
        deepLink,
      })
      return deepLink
    }

    // 如果有库ID，尝试使用库ID
    if (librarySectionId) {
      // http://[PMS_IP_Address]:32400/library/sections/29/all?X-Plex-Token=YourTokenGoesHere
      let libraryLink = `plex://library/sections/${librarySectionId}/all`
      if (plexToken) {
        libraryLink += `?X-Plex-Token=${plexToken}`
      }
      console.log('Plex库深度链接构建成功:', {
        originalUrl: playUrl,
        librarySectionId,
        plexToken,
        libraryLink,
      })
      return libraryLink
    }

    // 如果无法提取媒体ID，尝试使用机器标识符
    if (machineIdentifier) {
      // http://[PMS_IP_Address]:32400/library/sections?X-Plex-Token=YourTokenGoesHere
      let fallbackLink = `plex://library/sections`
      if (plexToken) {
        fallbackLink += `?X-Plex-Token=${plexToken}`
      }
      console.log('Plex深度链接构建失败，使用机器标识符:', {
        originalUrl: playUrl,
        machineIdentifier,
        plexToken,
        fallbackLink,
      })
      return fallbackLink
    }

    // 最后的降级方案
    console.log('Plex深度链接构建失败，使用原始URL:', {
      originalUrl: playUrl,
    })
    return `plex://${playUrl}`
  } catch (error) {
    console.warn('构建Plex深度链接失败:', error)
    return `plex://${playUrl}`
  }
}

/**
 * 构建Jellyfin深度链接
 * 参考: https://jellyfin.org/docs/general/administration/deep-linking
 * @param playUrl 播放链接
 */
function buildJellyfinDeepLink(playUrl: string): string {
  try {
    const url = new URL(playUrl)
    const serverAddress = url.hostname + (url.port ? `:${url.port}` : '')

    // 提取媒体ID、库ID、serverId
    let mediaId: string | null = null
    let libraryId: string | null = null
    let serverId: string | null = null

    // 格式1: /details?id={item_id}&serverId={serverid}
    const detailsMatch = playUrl.match(/\/details\?id=([^&]+)&serverId=([^&]+)/)
    if (detailsMatch) {
      mediaId = detailsMatch[1]
      serverId = detailsMatch[2]
    }

    // 格式2: /movies.html?topParentId={libraryId}
    const moviesMatch = playUrl.match(/\/movies\.html\?topParentId=([^&]+)/)
    if (moviesMatch) {
      libraryId = moviesMatch[1]
    }
    // 格式3: /tv.html?topParentId={libraryId}
    const tvMatch = playUrl.match(/\/tv\.html\?topParentId=([^&]+)/)
    if (tvMatch) {
      libraryId = tvMatch[1]
    }
    // 格式4: /library.html?topParentId={libraryId}
    const libMatch = playUrl.match(/\/library\.html\?topParentId=([^&]+)/)
    if (libMatch) {
      libraryId = libMatch[1]
    }

    // 兼容原有格式：?id=xxx
    if (!mediaId) {
      const idMatch = playUrl.match(/[?&]id=([^&]+)/)
      if (idMatch) {
        mediaId = idMatch[1]
      }
    }

    // 兼容原有格式：/items/xxx
    if (!mediaId) {
      const itemsMatch = playUrl.match(/\/items\/([^\/\?]+)/)
      if (itemsMatch) {
        mediaId = itemsMatch[1]
      }
    }

    // 构建深度链接
    if (mediaId) {
      let deepLink = `jellyfin://${serverAddress}/item/${mediaId}`
      if (serverId) {
        deepLink += `?serverId=${serverId}`
      }
      console.log('Jellyfin深度链接构建成功:', {
        originalUrl: playUrl,
        serverAddress,
        mediaId,
        serverId,
        deepLink,
      })
      return deepLink
    }
    if (libraryId) {
      const deepLink = `jellyfin://${serverAddress}/library/${libraryId}`
      console.log('Jellyfin库深度链接构建成功:', {
        originalUrl: playUrl,
        serverAddress,
        libraryId,
        deepLink,
      })
      return deepLink
    }

    // 如果无法提取ID，尝试直接使用服务器地址
    const fallbackLink = `jellyfin://${serverAddress}`
    console.log('Jellyfin深度链接构建失败，使用服务器地址:', {
      originalUrl: playUrl,
      serverAddress,
      fallbackLink,
    })
    return fallbackLink
  } catch (error) {
    console.warn('构建Jellyfin深度链接失败:', error)
    return `jellyfin://${playUrl}`
  }
}

/**
 * 构建Emby深度链接
 * 参考: https://emby.media/support/articles/Deep-Linking.html
 * iOS格式: emby://items?serverId={SERVER_ID}&itemId={ITEM_ID}
 * Android格式: emby://{服务器地址}/item/{媒体ID}
 * @param playUrl 播放链接
 */
function buildEmbyDeepLink(playUrl: string): string {
  try {
    const url = new URL(playUrl)
    const serverAddress = url.hostname + (url.port ? `:${url.port}` : '')

    // 尝试多种格式提取媒体ID
    const hashTarget = getEmbyHashTarget(playUrl)
    let mediaId: string | null = hashTarget.mediaId
    let serverId: string | null = hashTarget.serverId

    // 格式1: /web/index.html#!/item?id=xxx&context=home&serverId=xxx (后台返回的格式)
    const itemHashMatch = !mediaId ? playUrl.match(/\/item\?id=([^&]+)/) : null
    if (!mediaId && itemHashMatch) {
      mediaId = itemHashMatch[1]
      // 提取serverId
      const serverIdMatch = playUrl.match(/serverId=([^&]+)/)
      if (serverIdMatch) {
        serverId = getValidLinkValue(serverIdMatch[1])
      }
    }

    // 格式2: /web/index.html#!/videos?serverId=xxx&parentId=xxx (后台返回的格式)
    const videosHashMatch = !mediaId ? playUrl.match(/\/videos\?serverId=([^&]+)&parentId=([^&]+)/) : null
    if (!mediaId && videosHashMatch) {
      // 对于videos格式，我们使用parentId作为媒体ID
      mediaId = videosHashMatch[2]
      serverId = getValidLinkValue(videosHashMatch[1])
    }

    // 格式3: ?id=xxx (通用格式)
    if (!mediaId) {
      const idMatch = playUrl.match(/[?&]id=([^&]+)/)
      if (idMatch) {
        mediaId = idMatch[1]
      }
    }

    // 格式4: /itemdetails.html?id=xxx
    if (!mediaId) {
      const itemMatch = playUrl.match(/\/itemdetails\.html\?id=([^&]+)/)
      if (itemMatch) {
        mediaId = itemMatch[1]
      }
    }

    // 格式5: /items/xxx
    if (!mediaId) {
      const itemsMatch = playUrl.match(/\/items\/([^\/\?]+)/)
      if (itemsMatch) {
        mediaId = itemsMatch[1]
      }
    }

    // 格式6: /item/xxx (路径格式)
    if (!mediaId) {
      const itemPathMatch = playUrl.match(/\/item\/([^\/\?]+)/)
      if (itemPathMatch) {
        mediaId = itemPathMatch[1]
      }
    }

    if (mediaId) {
      let deepLink: string
      const encodedMediaId = encodeURIComponent(mediaId)
      const encodedServerId = serverId ? encodeURIComponent(serverId) : null

      // 根据设备类型使用不同的深度链接格式
      if (isIOSDevice()) {
        // iOS格式: emby://items?serverId={SERVER_ID}&itemId={ITEM_ID}
        if (encodedServerId) {
          deepLink = `emby://items?serverId=${encodedServerId}&itemId=${encodedMediaId}`
        } else {
          deepLink = `emby://items?itemId=${encodedMediaId}`
        }
      } else if (encodedServerId) {
        // Android格式: emby://items/{SERVER_ID}/{ITEM_ID}
        deepLink = `emby://items/${encodedServerId}/${encodedMediaId}`
      } else {
        deepLink = `emby://${serverAddress}/item/${encodedMediaId}`
      }

      console.log('Emby深度链接构建成功:', {
        originalUrl: playUrl,
        serverAddress,
        mediaId,
        serverId,
        deviceType: isIOSDevice() ? 'iOS' : 'Android',
        deepLink,
      })
      return deepLink
    }

    // 如果无法提取媒体ID，尝试直接使用服务器地址
    // 这会打开Emby APP的主界面
    const fallbackLink = `emby://${serverAddress}`
    console.log('Emby深度链接构建失败，使用服务器地址:', {
      originalUrl: playUrl,
      serverAddress,
      fallbackLink,
    })
    return fallbackLink
  } catch (error) {
    console.warn('构建Emby深度链接失败:', error)
    return playUrl
  }
}

/**
 * 构建Trimemedia深度链接
 * @param playUrl 播放链接
 */
function buildTrimemediaDeepLink(playUrl: string): string {
  try {
    const url = new URL(playUrl)
    const serverAddress = url.hostname + (url.port ? `:${url.port}` : '')

    // 提取媒体ID
    let mediaId: string | null = null

    // 尝试从URL路径中提取媒体ID
    const pathMatch = playUrl.match(/\/item\/([^\/\?]+)/)
    if (pathMatch) {
      mediaId = pathMatch[1]
    }

    // 尝试从查询参数中提取媒体ID
    if (!mediaId) {
      const idMatch = playUrl.match(/[?&]id=([^&]+)/)
      if (idMatch) {
        mediaId = idMatch[1]
      }
    }

    // 构建深度链接
    if (mediaId) {
      const deepLink = `trimemedia://${serverAddress}/item/${mediaId}`
      console.log('Trimemedia深度链接构建成功:', {
        originalUrl: playUrl,
        serverAddress,
        mediaId,
        deepLink,
      })
      return deepLink
    }

    // 如果无法提取媒体ID，尝试直接使用服务器地址
    const fallbackLink = `trimemedia://${serverAddress}`
    console.log('Trimemedia深度链接构建失败，使用服务器地址:', {
      originalUrl: playUrl,
      serverAddress,
      fallbackLink,
    })
    return fallbackLink
  } catch (error) {
    console.warn('构建Trimemedia深度链接失败:', error)
    return playUrl
  }
}

/**
 * 构建豆瓣深度链接
 * 使用豆瓣App官方支持的搜索格式
 * @param params 豆瓣参数
 */
function buildDoubanDeepLink(params: DoubanAppParams): string {
  const { title, year } = params

  // 使用豆瓣App官方支持的搜索格式
  // 格式：douban:///search?q={query}
  const searchQuery = `${title || ''} ${year || ''}`.trim()
  const deepLink = `douban:///search?q=${encodeURIComponent(searchQuery)}`

  console.log('豆瓣深度链接构建成功:', {
    params,
    searchQuery,
    deepLink,
  })

  return deepLink
}

/**
 * 尝试启动APP
 * @param appUrl APP深度链接
 * @param timeout 超时时间
 */
async function attemptAppLaunch(appUrl: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // 创建一个隐藏的iframe来尝试启动APP
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = appUrl

    // 设置超时
    const timeoutId = setTimeout(() => {
      document.body.removeChild(iframe)
      reject(new Error('APP启动超时'))
    }, timeout)

    // 监听页面可见性变化，如果用户切换到APP，说明启动成功
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(timeoutId)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        document.body.removeChild(iframe)
        resolve()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 添加到页面并尝试启动
    document.body.appendChild(iframe)

    // 对于iOS，还需要尝试window.location
    if (isIOSDevice()) {
      try {
        window.location.href = appUrl
      } catch (error) {
        console.log('iOS window.location跳转失败:', error)
      }
    }
  })
}

/**
 * 根据播放链接自动检测媒体服务器类型并跳转
 * @param playUrl 播放链接
 * @param fallbackUrl 备用网页链接
 * @param serverType 媒体服务器类型（可选，优先使用此参数）
 */
export async function openMediaServerWithAutoDetect(
  playUrl: string,
  fallbackUrl?: string,
  serverType?: string,
): Promise<void> {
  let detectedServerType: AppType | null = null

  // 优先使用传入的 serverType 参数
  if (serverType) {
    const type = serverType.toLowerCase()
    if (type === 'plex' || type === 'jellyfin' || type === 'emby' || type === 'zspace' || type === 'trimemedia') {
      detectedServerType = type as AppType
    }
  }

  // 如果没有传入 serverType 或类型不支持，则从URL中检测
  if (!detectedServerType) {
    const url = playUrl.toLowerCase()

    if (url.includes('plex') || url.includes('plex.tv')) {
      detectedServerType = 'plex'
    } else if (url.includes('jellyfin')) {
      detectedServerType = 'jellyfin'
    } else if (url.includes('emby')) {
      detectedServerType = 'emby'
    } else if (url.includes('zspace')) {
      detectedServerType = 'zspace'
    }
  }

  if (detectedServerType) {
    await openApp(detectedServerType, playUrl, fallbackUrl)
  } else {
    // 无法检测到服务器类型，直接使用网页链接
    window.open(fallbackUrl || playUrl, '_blank')
  }
}

/**
 * 打开豆瓣APP
 * @param doubanId 豆瓣ID
 * @param mediaType 媒体类型（电影/电视剧）
 * @param title 媒体标题
 * @param year 媒体年份
 * @param fallbackUrl 备用网页链接
 */
export async function openDoubanApp(
  doubanId: string,
  mediaType?: string,
  title?: string,
  year?: string,
  fallbackUrl?: string,
): Promise<void> {
  const params: DoubanAppParams = {
    doubanId,
    mediaType,
    title,
    year,
    fallbackUrl,
  }

  await openApp('douban', params, fallbackUrl)
}

/**
 * 获取APP的下载链接
 * @param appType APP类型
 */
export function getAppDownloadUrl(appType: AppType): string {
  switch (appType) {
    case 'plex':
      return 'https://www.plex.tv/apps/'
    case 'jellyfin':
      return 'https://jellyfin.org/downloads/'
    case 'emby':
      return 'https://emby.media/download.html'
    case 'zspace':
      return 'https://www.zspace.com.cn/'
    case 'trimemedia':
      return 'https://trimemedia.com/download'
    case 'douban':
      return 'https://www.douban.com/doubanapp/'
    default:
      return ''
  }
}

/**
 * 检查是否安装了特定的APP
 * 注意：由于浏览器安全限制，无法直接检测APP是否安装
 * 这个方法主要用于提示用户
 */
export function checkAppInstalled(appType: AppType): boolean {
  // 由于浏览器安全限制，无法直接检测APP是否安装
  // 这里可以根据用户代理或其他信息进行推测
  // 目前返回false，让系统总是尝试跳转
  return false
}
