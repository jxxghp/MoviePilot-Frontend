import { reactive } from 'vue'

const downloadedSubtitleMap = reactive<Record<string, boolean>>({})

export function markSubtitleDownloaded(url?: string | null) {
  if (!url) {
    return
  }

  downloadedSubtitleMap[url] = true
}

export { downloadedSubtitleMap }
