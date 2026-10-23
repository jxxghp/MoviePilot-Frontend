import type { NativeSnapshot } from './protocol'

/** 将业务分类值映射为当前 owner 的稳定短标识，中文和任意业务值都留在网页内。 */
export class NativeHeaderTabs {
  private owner: string | undefined
  private sequence = 0
  private identifiers = new Map<string, string>()

  /** 同 owner 重排保留标识；移除后不复用旧标识，避免旧菜单点击另一个分类。 */
  project(ownerId: string, items: Array<{ tab: string; title: string }>, selected: string) {
    if (!items.length || items.length > 32 || new Set(items.map(item => item.tab)).size !== items.length)
      throw new Error('unsupported_header_registration')
    // 旧页面在 mounted 中设置默认分类；此前暂不呈现选择器，不能替业务抢选或终止整个接管。
    if (!items.some(item => item.tab === selected)) return undefined
    if (this.owner !== ownerId) {
      this.owner = ownerId
      this.sequence = 0
      this.identifiers.clear()
    }
    const current = new Set(items.map(item => item.tab))
    for (const value of this.identifiers.keys()) if (!current.has(value)) this.identifiers.delete(value)
    for (const item of items)
      if (!this.identifiers.has(item.tab)) this.identifiers.set(item.tab, `tab-${++this.sequence}`)
    return {
      ownerId,
      selectedId: this.identifiers.get(selected)!,
      items: items.map(item => ({ id: this.identifiers.get(item.tab)!, title: item.title })),
    } satisfies NonNullable<NativeSnapshot['headerTabs']>
  }

  /** 只解析当前 owner 的现存标识，过期或已失去权限的分类不能执行。 */
  resolve(ownerId: string, id: string) {
    if (ownerId !== this.owner) return undefined
    return [...this.identifiers].find(([, identifier]) => identifier === id)?.[0]
  }
}
