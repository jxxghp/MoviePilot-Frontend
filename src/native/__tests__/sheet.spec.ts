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
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-native-sheet')
  document.documentElement.removeAttribute('data-native-sheet-preparing')
  document.documentElement.removeAttribute('data-native-sheets')
})

describe('原生 Sheet 与原 Vue 内容交接', () => {
  it('能力标记只在明确接管时启用，打开和归还均等待两次绘制机会才确认', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback))
    const root = dialog('名称识别')
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('页面')!
    expect(document.documentElement.hasAttribute('data-native-sheets')).toBe(false)
    adapter.setActive(true)
    expect(document.documentElement.getAttribute('data-native-sheets')).toBe('active')
    const done = vi.fn()
    const attach = adapter.executeWhenPainted('presentation.attach', { id: sheet.id }).then(done)
    expect(done).not.toHaveBeenCalled()
    frames.shift()!(0)
    await Promise.resolve()
    expect(done).not.toHaveBeenCalled()
    frames.shift()!(16)
    await attach
    expect(done).toHaveBeenCalledExactlyOnceWith(true)
    expect(root.querySelector('input')!.value).toBe('尚未保存')
    const detached = vi.fn()
    const detach = adapter.executeWhenPainted('presentation.detach', { id: sheet.id }).then(detached)
    expect(document.documentElement.hasAttribute('data-native-sheet')).toBe(false)
    expect(detached).not.toHaveBeenCalled()
    frames.shift()!(32)
    frames.shift()!(48)
    await detach
    expect(detached).toHaveBeenCalledExactlyOnceWith(true)
    adapter.setActive(false)
    expect(document.documentElement.hasAttribute('data-native-sheets')).toBe(false)
  })

  it.each(['关闭根', '切换根', '退出宿主'])('绘制期间%s不能迟到确认原弹窗', async operation => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback))
    const root = dialog('父弹窗')
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('页面')!
    const waiting = adapter.executeWhenPainted('presentation.attach', { id: sheet.id })
    if (operation === '关闭根') root.remove()
    if (operation === '切换根') {
      dialog('子弹窗', 2100)
      adapter.read('页面')
    }
    if (operation === '退出宿主') adapter.setActive(false)
    frames.shift()!(0)
    frames.shift()!(16)
    expect(await waiting).toBe(false)
  })

  it('底页准备只响应当前原生请求，不触发业务按钮，接管或取消后立即清理', () => {
    const root = dialog('名称识别')
    const closed = vi.fn()
    root.querySelector('[data-native-dialog-close]')!.addEventListener('click', closed)
    const adapter = new NativeSheetAdapter(document)
    const first = adapter.read('页面')!
    expect(first.backdropReady).toBe(false)
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(false)
    expect(adapter.execute('presentation.prepare', { id: 'stale' })).toBe(false)
    expect(adapter.execute('presentation.prepare', { id: first.id })).toBe(true)
    expect(adapter.read('页面')!.backdropReady).toBe(true)
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(true)
    expect(root.querySelector('input')!.value).toBe('尚未保存')
    expect(closed).not.toHaveBeenCalled()
    adapter.execute('presentation.attach', { id: first.id })
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(false)
    expect(adapter.execute('presentation.prepare', { id: first.id })).toBe(false)
    adapter.reset()
    adapter.execute('presentation.prepare', { id: first.id })
    root.remove()
    expect(adapter.read('页面')).toBeUndefined()
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(false)
  })

  it('准备期间更换弹窗撤销旧层准备，迟到请求不能隐藏新弹窗', () => {
    dialog('父弹窗')
    const adapter = new NativeSheetAdapter(document)
    const first = adapter.read('页面')!
    adapter.execute('presentation.prepare', { id: first.id })
    dialog('子弹窗', 2100)
    const next = adapter.read('页面')!
    expect(next.backdropReady).toBe(false)
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(false)
    expect(adapter.execute('presentation.prepare', { id: first.id })).toBe(false)
    adapter.execute('presentation.prepare', { id: next.id })
    adapter.reset()
    expect(document.documentElement.hasAttribute('data-native-sheet-preparing')).toBe(false)
  })

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

  it('隔离整个背景绘制分支，嵌套关闭时也隔离仍挂载的退出层，归还后不重建正文', () => {
    const page = document.createElement('main')
    page.innerHTML =
      '<input value="原页面输入" /><div class="subscribe-card"><div class="v-progress-linear v-progress-linear--active"></div></div>'
    document.body.append(page)
    const parent = dialog('浏览')
    const adapter = new NativeSheetAdapter(document)
    const first = adapter.read('页面')!
    expect(page.hasAttribute('data-native-sheet-background')).toBe(false)
    adapter.execute('presentation.attach', { id: first.id })
    expect(page.hasAttribute('data-native-sheet-background')).toBe(true)
    expect(parent.closest('[data-native-sheet-background]')).toBeNull()
    const child = dialog('确认下载', 2100)
    const second = adapter.read('页面')!
    adapter.execute('presentation.attach', { id: second.id })
    expect(parent.hasAttribute('data-native-sheet-background')).toBe(true)
    expect(child.closest('[data-native-sheet-background]')).toBeNull()
    // Vue 关闭状态先更新，退出动画/异步卸载的 DOM 仍可能在文档中。
    child.classList.remove('v-overlay--active')
    expect(adapter.read('页面')!.id).toBe(first.id)
    expect(child.hasAttribute('data-native-sheet-background')).toBe(true)
    expect(parent.closest('[data-native-sheet-background]')).toBeNull()
    adapter.execute('presentation.attach', { id: first.id })
    adapter.execute('presentation.detach', { id: first.id })
    expect(document.querySelector('[data-native-sheet-background]')).toBeNull()
    expect(page.querySelector('input')!.value).toBe('原页面输入')
    expect(page.querySelector('.v-progress-linear--active')).not.toBeNull()
  })

  it('自定义弹窗留在页面中时只隔离旁支，弹窗内原有 Teleport 菜单继续交互', () => {
    document.body.innerHTML =
      '<div id="app"><main><input value="页面状态" /></main><aside class="theme-customizer-panel-host" role="dialog" aria-label="主题"><button data-native-dialog-close>关闭</button><input value="主题状态" aria-owns="theme-options" /></aside></div><div class="v-overlay-container"><div id="theme-options" class="v-menu v-overlay--active"><button>选项</button></div><div class="v-dialog">退出中的旧内容</div></div>'
    const adapter = new NativeSheetAdapter(document)
    const first = adapter.read('页面')!
    adapter.execute('presentation.attach', { id: first.id })
    const current = document.querySelector('[data-native-sheet-current]')!
    const menu = document.querySelector('.v-menu')!
    expect(current.closest('[data-native-sheet-background]')).toBeNull()
    expect(menu.closest('[data-native-sheet-background]')).toBeNull()
    expect(document.querySelector('main')!.hasAttribute('data-native-sheet-background')).toBe(true)
    expect(document.querySelector('.v-dialog')!.hasAttribute('data-native-sheet-background')).toBe(true)
    adapter.setActive(false)
    expect(document.querySelector('[data-native-sheet-background]')).toBeNull()
    expect(current.querySelector('input')!.value).toBe('主题状态')
    expect(document.querySelector('main input')!.getAttribute('value')).toBe('页面状态')
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

  it('主题面板声明半屏时保留原生标题和关闭职责，不声明网页全屏', () => {
    const root = document.createElement('aside')
    root.className = 'theme-customizer-panel-host'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', '主题定制')
    root.innerHTML =
      '<header class="theme-customizer-header"><h2 class="theme-customizer-title">主题定制</h2><button data-native-dialog-close>关闭</button></header><button>Blue</button>'
    document.body.append(root)
    const adapter = new NativeSheetAdapter(document)
    expect(adapter.read('页面')).toMatchObject({ title: '主题定制', fullscreen: true, canDismiss: true })
    root.dataset.nativeSheetSize = 'medium'
    expect(adapter.read('页面')).toMatchObject({
      title: '主题定制',
      fullscreen: false,
      canDismiss: true,
      prefersMediumDetent: true,
    })
  })

  it('旧助手没有显式动作声明时仍保留 HTML 菜单的实际锚点', () => {
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

  it('助手显式登记三个动作后接管整行，嵌套会话关闭后恢复当前按钮且不丢草稿', () => {
    const root = document.createElement('aside')
    root.className = 'agent-assistant-panel is-open'
    root.setAttribute('role', 'dialog')
    root.innerHTML =
      '<header class="agent-assistant-header" data-native-sheet-actions><div class="agent-assistant-title">助手</div><button aria-haspopup="dialog" data-native-sheet-action="mdi-history">历史会话</button><button data-native-sheet-action="mdi-account-convert-outline">形象</button><button data-native-sheet-action="mdi-message-plus-outline" disabled>新增会话</button><button data-native-dialog-close>关闭</button></header><textarea>未发送草稿</textarea>'
    document.body.append(root)
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-native-sheet-action]')]
    const history = vi.fn()
    buttons[0].addEventListener('click', history)
    const adapter = new NativeSheetAdapter(document)
    const state = adapter.read('页面')!
    expect(state.actions.map(({ title, icon, enabled }) => ({ title, icon, enabled }))).toEqual([
      { title: '历史会话', icon: 'mdi-history', enabled: true },
      { title: '形象', icon: 'mdi-account-convert-outline', enabled: true },
      { title: '新增会话', icon: 'mdi-message-plus-outline', enabled: false },
    ])
    expect(root.querySelector('[data-native-sheet-header]')).not.toBeNull()
    adapter.execute('presentation.attach', { id: state.id })
    expect(adapter.execute('presentation.action', { id: state.id, actionId: state.actions[0].id })).toBe(true)
    expect(history).toHaveBeenCalledOnce()
    expect(adapter.execute('presentation.action', { id: state.id, actionId: state.actions[2].id })).toBe(false)
    const child = dialog('历史会话', 2100)
    adapter.read('页面')
    expect(adapter.execute('presentation.action', { id: state.id, actionId: state.actions[0].id })).toBe(false)
    child.remove()
    const restored = adapter.read('页面')!
    expect(restored.id).toBe(state.id)
    expect(restored.actions).toEqual(state.actions)
    expect(root.querySelector('textarea')!.value).toBe('未发送草稿')
    adapter.reset()
    expect(root.querySelector('[data-native-sheet-header]')).toBeNull()
  })
})
