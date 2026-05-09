import { reactive } from 'vue'

const downloadedTorrentMap = reactive<Record<string, boolean>>({})

export function markTorrentDownloaded(url?: string | null) {
  if (!url) {
    return
  }

  downloadedTorrentMap[url] = true
}

export { downloadedTorrentMap }
