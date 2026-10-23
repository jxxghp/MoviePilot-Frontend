import { describe, expect, it } from 'vitest'
import { NativeHeaderTabs } from '../header'
import { isNativeIdentifier } from '../protocol'

describe('原生页内分类和业务值交接', () => {
  it('中文分类以稳定短标识跨桥，选择后解析回原来的业务值', () => {
    const adapter = new NativeHeaderTabs()
    const items = [
      { tab: '全部', title: '全部' },
      { tab: '电影', title: '电影' },
    ]
    const first = adapter.project('recommend', items, '全部')!
    expect(first.items.every(item => isNativeIdentifier(item.id))).toBe(true)
    expect(adapter.resolve('recommend', first.selectedId)).toBe('全部')
    const second = adapter.project('recommend', [...items].reverse(), '电影')!
    expect(second.items.find(item => item.title === '全部')?.id).toBe(first.selectedId)
    expect(adapter.resolve('recommend', second.selectedId)).toBe('电影')
  })

  it('权限移除的分类和旧 owner 不能通过旧标识选择新项目', () => {
    const adapter = new NativeHeaderTabs()
    const first = adapter.project('page-a', [{ tab: '旧分类', title: '旧分类' }], '旧分类')!
    const second = adapter.project('page-a', [{ tab: '新分类', title: '新分类' }], '新分类')!
    expect(second.selectedId).not.toBe(first.selectedId)
    expect(adapter.resolve('page-a', first.selectedId)).toBeUndefined()
    adapter.project('page-b', [{ tab: '其他页面', title: '其他页面' }], '其他页面')
    expect(adapter.resolve('page-a', second.selectedId)).toBeUndefined()
  })

  it('页面尚未确定默认分类时暂不呈现，业务初始化后再发布实际选择', () => {
    const adapter = new NativeHeaderTabs()
    const items = [{ tab: 'mysub', title: '我的订阅' }]
    expect(adapter.project('subscribe', items, '')).toBeUndefined()
    const actual = adapter.project('subscribe', items, 'mysub')!
    expect(adapter.resolve('subscribe', actual.selectedId)).toBe('mysub')
  })

  it('重复业务值无法形成可确认的原生选择，应当回退', () => {
    const adapter = new NativeHeaderTabs()
    expect(() =>
      adapter.project(
        'page',
        [
          { tab: 'a', title: 'A' },
          { tab: 'a', title: 'B' },
        ],
        'a',
      ),
    ).toThrow()
  })
})
