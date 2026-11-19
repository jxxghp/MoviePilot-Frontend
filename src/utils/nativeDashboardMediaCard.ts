import type { MediaServerPlayItem } from '@/api/types'
import { nativeCardAction, type NativeCardMenuBinding } from '@/native/card'
import { openMediaServerItem } from '@/utils/appDeepLink'
import { canUseNativeMediaPlayback, playMediaServerLibraryItem } from '@/utils/mediaPlayback'

/** 继续观看条目由仪表板按实际请求的服务器补齐来源名称。 */
export interface DashboardMediaServerItem extends MediaServerPlayItem {
  dashboardServer?: string
}

/** 创建仪表板海报共用的本地播放与媒体服务器打开菜单。 */
export function createNativeDashboardMediaCardMenu(
  getMedia: () => DashboardMediaServerItem | undefined,
  getServer: () => string | undefined,
  labels: { play: string; mediaServer: string; openInServer(server: string): string },
): NativeCardMenuBinding {
  const media = getMedia()
  const itemId = media?.item_id || media?.id
  const server = getServer() || media?.dashboardServer || media?.server
  const key = itemId ? `${server || media?.server_type || 'media'}:${itemId}` : media?.link
  return {
    key,
    title: media?.title,
    available: () => {
      const current = getMedia()
      return Boolean(current && (current.link || ((current.item_id || current.id) && (getServer() || current.server))))
    },
    items: () => {
      const current = getMedia()
      const currentItemId = current?.item_id || current?.id
      const currentServer = getServer() || current?.dashboardServer || current?.server
      const serverType = current?.server_type?.toLowerCase()
      const serverLabel =
        {
          plex: 'Plex',
          jellyfin: 'Jellyfin',
          emby: 'Emby',
          zspace: '极影视',
          trimemedia: '飞牛影视',
          ugreen: 'UGREEN',
          mediavault: 'MediaVault',
        }[serverType || ''] ||
        currentServer ||
        current?.server_type ||
        labels.mediaServer
      return [
        nativeCardAction('play', {
          title: labels.play,
          icon: 'mdi-play',
          visible: canUseNativeMediaPlayback() && Boolean(currentItemId && currentServer),
          invoke: () => {
            if (currentItemId && currentServer && current?.title) {
              playMediaServerLibraryItem(String(currentItemId), current.title, currentServer)
            }
          },
        }),
        nativeCardAction('open-server', {
          title: labels.openInServer(serverLabel),
          icon: 'mdi-open-in-new',
          visible: Boolean(current?.link),
          invoke: () => (current ? openMediaServerItem(current) : undefined),
        }),
      ]
    },
  }
}
