import type { NativePanel, NativePanelItem } from './protocol'
import type { NativePanelEntry, NativePanelSource } from './registry'

/** 对业务标识生成短 ASCII 标识，不把通知正文或任意 URL 当成原生命令。 */
export function nativePanelId(prefix: string, value: unknown): string {
  let hash = 2166136261
  for (const character of String(value)) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619)
  return `${prefix}-${(hash >>> 0).toString(16)}`
}

/** 限制跨进程展示文案的大小，并移除 UIKit 不需要的控制字符。 */
function text(value: string | undefined, bytes = 512): string | undefined {
  if (!value) return undefined
  const encoder = new TextEncoder()
  let result = ''
  let size = 0
  for (const character of value.replace(/[\p{Cc}\p{Cf}]/gu, ' ')) {
    size += encoder.encode(character).length
    if (size > bytes) break
    result += character
  }
  return result || undefined
}

/** 保留网页原有图片地址，仅允许无用户信息的 HTTP(S) 资源。 */
function imageReference(value: string | undefined): string | undefined {
  if (!value || /[\p{Cc}\p{Cf}]/u.test(value)) return undefined
  try {
    const url = new URL(value, document.baseURI)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    return new TextEncoder().encode(url.href).length <= 4096 ? url.href : undefined
  } catch {
    return undefined
  }
}

/** 转换为有界 JSON；连续列表的旧行回调仍须来自当前业务组件及本次展示会话。 */
export function projectNativePanel(source: NativePanelSource) {
  const callbacks = new Map<string, NativePanelEntry>()
  let remaining = 96
  let budget = 24000
  /** 递归菜单最多三层，通知和搜索结果不会撑破整个桥接消息上限。 */
  function items(entries: NativePanelEntry[], depth: number): NativePanelItem[] {
    const result: NativePanelItem[] = []
    for (const entry of entries) {
      if (remaining <= 0 || budget <= 0) break
      if (!/^[\x21-\x7e]{1,128}$/.test(entry.id) || callbacks.has(entry.id)) continue
      const title = text(entry.title)
      if (!title) continue
      remaining--
      callbacks.set(entry.id, entry)
      const row: NativePanelItem = {
        id: entry.id,
        title,
        ...(text(entry.subtitle, 2048) ? { subtitle: text(entry.subtitle, 2048) } : {}),
        ...(entry.icon ? { icon: text(entry.icon) } : {}),
        ...(imageReference(entry.image) ? { image: imageReference(entry.image) } : {}),
        enabled: entry.enabled !== false,
        selected: entry.selected === true,
        destructive: entry.destructive === true,
        keepOpen: entry.keepOpen === true,
        ...(depth > 0 && entry.primary === true && !entry.children?.length && entry.keepOpen !== true
          ? { primary: true }
          : {}),
      }
      budget -= new TextEncoder().encode(JSON.stringify(row)).length
      if (entry.children?.length && depth < 2) row.children = items(entry.children, depth + 1)
      result.push(row)
    }
    return result
  }
  const panel: NativePanel = {
    title: text(source.title) || 'MoviePilot',
    ...(source.layout === 'grid' ? { layout: 'grid' } : {}),
    ...(source.width === 'full' ? { width: 'full' } : {}),
    ...(text(source.subtitle) ? { subtitle: text(source.subtitle) } : {}),
    ...(source.profile && text(source.profile.name)
      ? {
          profile: {
            name: text(source.profile.name)!,
            ...(text(source.profile.detail) ? { detail: text(source.profile.detail) } : {}),
            ...(profileImage(source.profile.image) ? { image: profileImage(source.profile.image) } : {}),
          },
        }
      : {}),
    ...(source.search
      ? {
          search: {
            text: text(source.search.text, 1024) || '',
            placeholder: text(source.search.placeholder) || '搜索',
          },
        }
      : {}),
    sections: source.sections.slice(0, 16).map(section => ({
      id: section.id,
      ...(text(section.title) ? { title: text(section.title) } : {}),
      items: items(section.items, 0),
    })),
    loading: source.loading === true,
    hasMore: source.hasMore === true,
    ...(source.feed ? { feed: source.feed } : {}),
    ...(text(source.loadError) ? { loadError: text(source.loadError) } : {}),
    ...(text(source.emptyText) ? { emptyText: text(source.emptyText) } : {}),
  }
  if (source.feed) {
    for (const entry of source.retainedItems ?? []) {
      if (/^[\x21-\x7e]{1,128}$/.test(entry.id) && !callbacks.has(entry.id)) callbacks.set(entry.id, entry)
    }
  }
  return { panel, callbacks, source }
}

/** 头像除原 HTTP 资源外只接受 App 生成的小型 JPEG，拒绝任意内联文档和超大载荷。 */
function profileImage(value: string | undefined): string | undefined {
  if (value && value.length <= 8192 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/u.test(value)) return value
  return imageReference(value)
}

/** 命令始终匹配最新面板的可见行，过期、禁用或未知项目不能调用旧闭包。 */
export function dispatchNativePanel(
  current: ReturnType<typeof projectNativePanel>,
  payload: Record<string, unknown>,
): boolean {
  if (
    current.panel.feed &&
    ['more', 'select'].includes(String(payload.panelEvent)) &&
    payload.value !== current.panel.feed.id
  )
    return false
  switch (payload.panelEvent) {
    case 'open':
      void current.source.onOpen?.()
      return true
    case 'query':
      if (typeof payload.value !== 'string' || payload.value.length > 256 || !current.source.onQuery) return false
      current.source.onQuery(payload.value)
      return true
    case 'more':
      if (!current.panel.hasMore || current.panel.loading || !current.source.onLoadMore) return false
      void current.source.onLoadMore()
      return true
    case 'select': {
      if (typeof payload.itemId !== 'string') return false
      const entry = current.callbacks.get(payload.itemId)
      if (!entry || entry.enabled === false || !entry.invoke) return false
      void entry.invoke()
      return true
    }
    default:
      return false
  }
}
