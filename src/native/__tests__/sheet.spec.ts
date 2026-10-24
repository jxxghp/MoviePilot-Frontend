import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeSheetAdapter } from '../sheet'

/** 用实际按钮验证只转移展示职责，既有监听器与输入值始终保留。 */
function dialog(title: string, z = 2000) {
  const root = document.createElement('div')
  root.className = 'v-overlay--active v-dialog'
  root.style.zIndex = String(z)
  root.innerHTML = `<div class="v-overlay__content"><div class="v-card"><div class="v-card-item"><div class="v-card-title"></div><button data-native-dialog-close>关闭</button><button aria-label="刷新">刷新</button></div><input value="尚未保存" /></div></div>`
  root.querySelector('.v-card-title')!.textContent = title
  document.body.append(root)
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-native-sheet')
})

describe('原生 Sheet 与原 Vue 内容交接', () => {
  it('工具栏和声明式自定义标题使用同一原生栏，原按钮仍是唯一动作来源', () => {
    const root = dialog('旧标题')
    root.innerHTML =
      '<div class="v-overlay__content"><div class="v-card"><header class="v-toolbar"><h2 class="v-toolbar-title">工作流</h2><button data-native-dialog-close>关闭</button><button aria-label="导入">导入</button></header></div></div>'
    const adapter = new NativeSheetAdapter(document)
    expect(adapter.read('页面')).toMatchObject({ title: '工作流', canDismiss: true, actions: [{ title: '导入' }] })
    root.innerHTML =
      '<div data-native-dialog-header><h3 data-native-dialog-title>分类</h3><button data-native-dialog-close>取消</button><button aria-label="保存">保存</button></div>'
    expect(adapter.read('页面')).toMatchObject({ title: '分类', canDismiss: true, actions: [{ title: '保存' }] })
  })

  it('协商接管前不改变网页；接管后只发出原按钮事件并保留表单', () => {
    const root = dialog('名称识别')
    const closed = vi.fn(),
      refreshed = vi.fn()
    root.querySelector('[data-native-dialog-close]')!.addEventListener('click', closed)
    root.querySelector('[aria-label="刷新"]')!.addEventListener('click', refreshed)
    const adapter = new NativeSheetAdapter(document)
    const state = adapter.read('页面')!
    expect(state.title).toBe('名称识别')
    expect(state.canDismiss).toBe(true)
    expect(document.documentElement.hasAttribute('data-native-sheet')).toBe(false)
    expect(adapter.execute('presentation.attach', { id: state.id })).toBe(true)
    expect(root.hasAttribute('data-native-sheet-current')).toBe(true)
    expect(adapter.execute('presentation.action', { id: state.id, actionId: state.actions[0].id })).toBe(true)
    expect(adapter.execute('presentation.dismiss', { id: state.id })).toBe(true)
    expect(refreshed).toHaveBeenCalledOnce()
    expect(closed).toHaveBeenCalledOnce()
    expect(root.querySelector('input')!.value).toBe('尚未保存')
    expect(adapter.execute('presentation.detach', { id: state.id })).toBe(true)
    expect(document.documentElement.hasAttribute('data-native-sheet')).toBe(false)
    expect(root.querySelector('[data-native-sheet-header]')).toBeNull()
  })

  it('嵌套弹窗拒绝旧层关闭，关闭子层后恢复父层内容和身份', () => {
    const parent = dialog('父弹窗')
    const adapter = new NativeSheetAdapter(document)
    const first = adapter.read('页面')!
    adapter.execute('presentation.attach', { id: first.id })
    const child = dialog('子弹窗', 2100)
    const second = adapter.read('页面')!
    expect(second.id).not.toBe(first.id)
    expect(adapter.execute('presentation.dismiss', { id: first.id })).toBe(false)
    expect(child.hasAttribute('data-native-sheet-current')).toBe(true)
    child.remove()
    expect(adapter.read('页面')!.id).toBe(first.id)
    expect(parent.hasAttribute('data-native-sheet-current')).toBe(true)
  })

  it('按钮替换、禁用和不可关闭弹窗不会绕过当前业务状态', () => {
    const root = dialog('持久进度')
    const adapter = new NativeSheetAdapter(document)
    const old = adapter.read('页面')!
    root.querySelector('[data-native-dialog-close]')!.remove()
    root.querySelector('[aria-label="刷新"]')!.outerHTML = '<button aria-label="保存">保存</button>'
    const current = adapter.read('页面')!
    expect(current.canDismiss).toBe(false)
    expect(adapter.execute('presentation.dismiss', { id: current.id })).toBe(false)
    expect(adapter.execute('presentation.action', { id: current.id, actionId: old.actions[0].id })).toBe(false)
    root.querySelector('button')!.disabled = true
    expect(adapter.execute('presentation.action', { id: current.id, actionId: current.actions[0].id })).toBe(false)
    root.remove()
    adapter.read('页面')
    expect(adapter.execute('presentation.attach', { id: current.id })).toBe(false)
  })

  it('助手只接管打开的面板，保留菜单的实际锚点并移走标题和关闭按钮', () => {
    const root = document.createElement('aside')
    root.className = 'agent-assistant-panel'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', '助手')
    root.innerHTML =
      '<header class="agent-assistant-header"><div class="agent-assistant-title">助手</div><button aria-haspopup="menu" aria-label="历史">历史</button><button data-native-dialog-close>关闭</button></header><textarea>草稿</textarea>'
    document.body.append(root)
    const adapter = new NativeSheetAdapter(document)
    expect(adapter.read('页面')).toBeUndefined()
    root.classList.add('is-open')
    const state = adapter.read('页面')!
    expect(state).toMatchObject({ title: '助手', fullscreen: true, canDismiss: true, actions: [] })
    expect(root.querySelector('[data-native-sheet-header]')).toBeNull()
    expect(root.querySelector('[data-native-sheet-heading]')).not.toBeNull()
    adapter.execute('presentation.attach', { id: state.id })
    expect(root.querySelector('[aria-haspopup="menu"]')).not.toBeNull()
    expect(root.querySelector('textarea')!.value).toBe('草稿')
  })
})
