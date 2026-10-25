import { nativeCardMenus } from '@/native/card'
import { afterEach, vi } from 'vitest'

/** jsdom 不排版，只为指定的真实组件根提供可见矩形；其余来源维持不可见。 */
export function readNativeCardMenu(element: Element) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 100, 300, 180))
  nativeCardMenus.setContext({ sessionId: 'component-card-test', routeRevision: 1 })
  nativeCardMenus.synchronize()
  const targets = nativeCardMenus.targets()
  if (targets.length > 1) throw new Error('测试必须明确一张卡片，不能按列表位置选择业务对象')
  const target = targets[0]
  return target ? nativeCardMenus.menus.open(target.ownerId, target.menuId) : undefined
}

afterEach(() => nativeCardMenus.setContext(undefined))
