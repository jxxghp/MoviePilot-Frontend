import { extractDominantColor } from '@/@core/utils/image'
import { normalizePluginAccentColor } from '@/utils/glassColor'

const GITHUB_OWNER_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

function extractPrimaryAuthorUrl(authorUrl?: string): string {
  const trimmed = authorUrl?.trim() || ''
  if (!trimmed) return ''

  const commaIndex = trimmed.indexOf(',')
  if (commaIndex < 0) return trimmed

  const rest = trimmed.slice(commaIndex + 1).trimStart()
  if (/^https?:\/\//i.test(rest)) {
    return trimmed.slice(0, commaIndex).trim()
  }

  return trimmed
}

function stripTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.codePointAt(end - 1) === 47) {
    end -= 1
  }
  return value.slice(0, end)
}

/**
 * 解析插件作者头像地址，兼容逗号分隔联合署名、GitHub 仓库链接与缺省作者名回退。
 */
export function resolvePluginAuthorAvatar(authorUrl?: string, pluginAuthor?: string): string {
  const primaryAuthorUrl = extractPrimaryAuthorUrl(authorUrl)

  if (primaryAuthorUrl) {
    try {
      const url = new URL(primaryAuthorUrl)
      if (['http:', 'https:'].includes(url.protocol) && url.hostname.toLowerCase() === 'github.com') {
        const rawSegment = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '')
        const firstOwner = rawSegment
          .split(/[,;\s]+/)
          .map(item => item.trim())
          .find(Boolean)
          ?.replace(/\.png$/i, '')
        if (firstOwner && GITHUB_OWNER_PATTERN.test(firstOwner)) {
          return `https://github.com/${firstOwner}.png`
        }
        return ''
      }
    } catch {
      // 非标准地址保持原有拼接回退。
    }

    return /\.(?:png|jpe?g|webp|gif|avif)$/i.test(primaryAuthorUrl)
      ? primaryAuthorUrl
      : `${stripTrailingSlashes(primaryAuthorUrl)}.png`
  }
  const fallbackOwner = pluginAuthor
    ?.split(/[,;/\s]+/)
    .map(item => item.trim())
    .find(Boolean)
  if (fallbackOwner && GITHUB_OWNER_PATTERN.test(fallbackOwner)) {
    return `https://github.com/${fallbackOwner}.png`
  }

  return ''
}

/**
 * 归一化插件作者主页链接，避免联合署名拼接出的 GitHub 路径触发 404。
 */
export function resolvePluginAuthorUrl(authorUrl?: string, pluginAuthor?: string): string {
  const primaryAuthorUrl = extractPrimaryAuthorUrl(authorUrl)

  if (primaryAuthorUrl) {
    try {
      const url = new URL(primaryAuthorUrl)
      if (['http:', 'https:'].includes(url.protocol) && url.hostname.toLowerCase() === 'github.com') {
        const rawSegment = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '')
        if (rawSegment.includes(',')) {
          const firstOwner = rawSegment
            .split(/[,;\s]+/)
            .map(item => item.trim())
            .find(Boolean)
            ?.replace(/\.png$/i, '')
          if (firstOwner && GITHUB_OWNER_PATTERN.test(firstOwner)) {
            return `https://github.com/${firstOwner}`
          }
        }
      }
    } catch {
      // 保留非标准链接交由浏览器默认行为处理。
    }

    return primaryAuthorUrl
  }

  const fallbackOwner = pluginAuthor
    ?.split(/[,;/\s]+/)
    .map(item => item.trim())
    .find(Boolean)
  if (fallbackOwner && GITHUB_OWNER_PATTERN.test(fallbackOwner)) {
    return `https://github.com/${fallbackOwner}`
  }

  return ''
}

/** 管理插件卡 Logo 的可选品牌强调色；无有效提色时由 CSS 环境色接管。 */
export function usePluginCardAccent() {
  const accentRgb = ref<string>()
  const imageRef = ref<{ $el: HTMLElement } | HTMLImageElement | null>(null)
  const accentStyle = computed(() =>
    accentRgb.value
      ? {
          '--plugin-card-accent-rgb': accentRgb.value,
          '--mp-card-accent-rgb': accentRgb.value,
        }
      : undefined,
  )
  let requestGeneration = 0

  async function updateAccentColor() {
    const generation = ++requestGeneration
    const target = imageRef.value
    const imageElement =
      target instanceof HTMLImageElement ? target : (target?.$el?.querySelector('img') as HTMLImageElement | undefined)
    const dominantColor = await extractDominantColor(imageElement)
    if (generation !== requestGeneration) return

    accentRgb.value = dominantColor ? normalizePluginAccentColor(dominantColor)?.rgb : undefined
  }

  function resetAccentColor() {
    requestGeneration += 1
    accentRgb.value = undefined
  }

  return {
    accentRgb,
    accentStyle,
    imageRef,
    resetAccentColor,
    updateAccentColor,
  }
}
