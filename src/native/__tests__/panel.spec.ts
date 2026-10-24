import { describe, expect, it, vi } from 'vitest'
import { dispatchNativePanel, nativePanelId, projectNativePanel } from '../panel'
import type { NativePanelSource } from '../registry'

describe('原生面板声明与当前业务回调隔离', () => {
  it('只序列化有界展示数据，不把回调或控制字符交给原生', () => {
    const invoke = vi.fn()
    const { panel, callbacks } = projectNativePanel({
      title: '消息中心',
      sections: [
        {
          id: 'messages',
          items: Array.from({ length: 200 }, (_, index) => ({
            id: `message-${index}`,
            title: '通知\n标题',
            subtitle: '长正文'.repeat(3000),
            invoke,
          })),
        },
      ],
    })
    expect(JSON.stringify(panel)).not.toContain('invoke')
    expect(JSON.stringify(panel)).not.toContain('\\n')
    expect(new TextEncoder().encode(JSON.stringify(panel)).length).toBeLessThan(28000)
    expect(callbacks.size).toBeLessThan(96)
    expect(panel.sections[0].items[0].title).toBe('通知 标题')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('最新权限投影会撤销旧行，禁用项目和未知事件不能执行', () => {
    const invoke = vi.fn()
    const source: NativePanelSource = {
      title: '捷径',
      sections: [{ id: 'tools', items: [{ id: 'tool', title: '工具', invoke }] }],
    }
    const old = projectNativePanel(source)
    expect(dispatchNativePanel(old, { panelEvent: 'select', itemId: 'tool' })).toBe(true)
    source.sections[0].items = [{ id: 'tool', title: '工具', enabled: false, invoke }]
    const disabled = projectNativePanel(source)
    expect(dispatchNativePanel(disabled, { panelEvent: 'select', itemId: 'tool' })).toBe(false)
    source.sections[0].items = []
    expect(dispatchNativePanel(projectNativePanel(source), { panelEvent: 'select', itemId: 'tool' })).toBe(false)
    expect(dispatchNativePanel(old, { panelEvent: 'eval', itemId: 'tool' })).toBe(false)
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('搜索、打开和翻页使用业务组件提供的方法，拒绝超长输入与加载中重复翻页', () => {
    const onQuery = vi.fn(),
      onOpen = vi.fn(),
      onLoadMore = vi.fn()
    const source: NativePanelSource = { title: '搜索', sections: [], hasMore: true, onQuery, onOpen, onLoadMore }
    const current = projectNativePanel(source)
    expect(dispatchNativePanel(current, { panelEvent: 'open' })).toBe(true)
    expect(dispatchNativePanel(current, { panelEvent: 'query', value: '电影' })).toBe(true)
    expect(dispatchNativePanel(current, { panelEvent: 'query', value: 'x'.repeat(257) })).toBe(false)
    expect(dispatchNativePanel(current, { panelEvent: 'more' })).toBe(true)
    expect(dispatchNativePanel(projectNativePanel({ ...source, loading: true }), { panelEvent: 'more' })).toBe(false)
    expect(onQuery).toHaveBeenCalledExactlyOnceWith('电影')
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('嵌套菜单共享标识空间，中文业务标识不会成为原生命令文本', () => {
    const id = nativePanelId('message', '含中文和空格的通知')
    expect(id).toMatch(/^[\x21-\x7e]{1,128}$/)
    expect(nativePanelId('message', '含中文和空格的通知')).toBe(id)
    const { panel } = projectNativePanel({
      title: '用户',
      sections: [
        {
          id: 'settings',
          items: [
            {
              id: 'theme',
              title: '主题',
              children: [
                { id: 'glass', title: '玻璃设置' },
                { id: 'glass', title: '重复' },
              ],
            },
          ],
        },
      ],
    })
    expect(panel.sections[0].items[0].children).toHaveLength(1)
  })

  it('海报保留原 HTTP 图片资源，拒绝脚本、本机文件及含用户密码的地址', () => {
    const urls = [
      'https://image.example/poster.jpg',
      'javascript:alert(1)',
      'file:///tmp/a',
      'https://user:pass@example/a',
    ]
    const { panel } = projectNativePanel({
      title: '通知',
      sections: [{ id: 'media', items: urls.map((image, i) => ({ id: `image-${i}`, title: '通知', image })) }],
    })
    expect(panel.sections[0].items.map(item => item.image)).toEqual([urls[0], undefined, undefined, undefined])
  })
})
