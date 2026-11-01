import AgentAssistantPanel from '@/components/agent/AgentAssistantPanel.vue'
import { AGENT_ASSISTANT_LAYER_Z_INDEX } from '@/constants/agentAssistant'
import { NativeLayoutAdapter } from '@/native/layout'
import { NativeSheetAdapter } from '@/native/sheet'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VDialog } from 'vuetify/components'

const nativeLayout = new NativeLayoutAdapter(document, window)
const initialWidth = window.innerWidth
let rootStyle: string | null

function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

/** 保留真实 Vuetify 弹层、按钮和受控开关，只替换与模态交互无关的形象列表。 */
async function renderPanel(backgroundDialog = false, initiallyOpen = false) {
  const host = defineComponent({
    setup() {
      const open = ref(initiallyOpen)
      const pageActions = ref(0)
      return () =>
        h('div', [
          h('main', { 'aria-label': '资源页面' }, [
            h('h1', '资源列表'),
            h('button', { onClick: () => (open.value = true) }, '打开助手'),
            h('button', { onClick: () => pageActions.value++ }, '底层页面操作'),
            h('output', `页面操作次数：${pageActions.value}`),
          ]),
          backgroundDialog ? h(VDialog, { modelValue: true, transition: false }, () => h('div', '已打开的弹窗')) : null,
          h(AgentAssistantPanel, {
            modelValue: open.value,
            'onUpdate:modelValue': (value: boolean) => (open.value = value),
          }),
        ])
    },
  })
  const view = await renderWithProviders(host, {
    global: {
      stubs: {
        AgentPetPicker: { template: '<div>形象选择内容</div>' },
        PerfectScrollbar: { template: '<div><slot /></div>' },
      },
    },
  })
  const opener = screen.getByRole('button', { name: '打开助手' })
  if (!initiallyOpen) {
    opener.focus()
    await fireEvent.click(opener)
  }
  await screen.findByRole('dialog', { name: '智能助手' })
  return { ...view, opener }
}

beforeEach(() => {
  rootStyle = document.documentElement.getAttribute('style')
  // jsdom 不计算页面高度；声明真实页面的滚动容器以验证 Vuetify 的锁与位置恢复。
  document.documentElement.style.overflowY = 'scroll'
  document.documentElement.scrollTop = 180
  resize(390)
})

afterEach(() => {
  cleanup()
  nativeLayout.setActive(false)
  delete window.MoviePilotNative
  resize(initialWidth)
  if (rootStyle === null) document.documentElement.removeAttribute('style')
  else document.documentElement.setAttribute('style', rootStyle)
  document.documentElement.scrollTop = 0
})

describe('AgentAssistantPanel modal presentation', () => {
  it('removes the closed fullscreen surface so the background main can be used and reopened', async () => {
    const { opener } = await renderPanel(false, true)
    const dialog = screen.getByRole('dialog', { name: '智能助手' })
    const page = screen.getByRole('main', { name: '资源页面' })
    const content = dialog.querySelector('.agent-assistant-shell')
    await fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))

    await waitFor(() => expect(dialog).not.toBeVisible())
    expect(page).toBeVisible()
    expect(within(page).getByRole('heading', { name: '资源列表' })).toBeVisible()
    expect(document.querySelector('.agent-assistant-modal.v-overlay--active')).not.toBeInTheDocument()
    expect(dialog.querySelector('.v-overlay__scrim')).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    await fireEvent.click(within(page).getByRole('button', { name: '底层页面操作' }))
    expect(within(page).getByText('页面操作次数：1')).toBeVisible()

    await fireEvent.click(opener)
    const reopened = await screen.findByRole('dialog', { name: '智能助手' })
    expect(reopened).toBeVisible()
    expect(reopened.querySelector('.agent-assistant-shell')).toBe(content)
  })

  it('locks the mobile page, keeps focus inside, and restores focus and scroll when closed', async () => {
    const { opener } = await renderPanel()
    const dialog = screen.getByRole('dialog', { name: '智能助手' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).not.toHaveClass('agent-assistant-panel')
    expect(dialog.querySelector('.agent-assistant-panel')).toBeInTheDocument()
    expect(dialog.querySelector('.v-overlay__scrim')).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement).toHaveClass('v-overlay-scroll-blocked'))
    expect(document.documentElement.style.getPropertyValue('--v-body-scroll-y')).toBe('-180px')

    const input = within(dialog).getByRole('textbox')
    await waitFor(() => {
      input.focus()
      screen.getByRole('button', { name: '底层页面操作' }).focus()
      expect(dialog.contains(document.activeElement)).toBe(true)
    })
    // 模拟滚动锁样式将视口归零，解除锁应使用保存的位置，而非关闭时的值。
    document.documentElement.scrollTop = 0
    await fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    expect(document.documentElement.scrollTop).toBe(180)
    expect(document.documentElement.style.getPropertyValue('--v-body-scroll-y')).toBe('')
    expect(opener).toHaveFocus()
  })

  it('closes a nested history menu and the pet view before closing the mobile assistant', async () => {
    await renderPanel()
    const dialog = screen.getByRole('dialog', { name: '智能助手' })
    await waitFor(() => expect(document.documentElement).toHaveClass('v-overlay-scroll-blocked'))
    await fireEvent.click(within(dialog).getByRole('button', { name: '历史会话' }))
    await waitFor(() => expect(document.querySelector('.v-menu.v-overlay--active')).toBeInTheDocument())
    await waitFor(async () => {
      const menu = document.querySelector('.v-menu.v-overlay--active')
      if (menu) await fireEvent.keyDown(menu, { key: 'Escape' })
      expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeInTheDocument()
    })
    expect(dialog).toBeVisible()
    expect(dialog).not.toHaveAttribute('aria-hidden', 'true')
    expect(document.documentElement).toHaveClass('v-overlay-scroll-blocked')

    const pickerToggle = within(dialog).getByRole('button', { name: '更换形象' })
    await fireEvent.click(pickerToggle)
    expect(pickerToggle).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.keyDown(pickerToggle, { key: 'Escape' })
    expect(pickerToggle).toHaveAttribute('aria-pressed', 'false')
    expect(dialog).toBeVisible()
    expect(dialog).not.toHaveAttribute('aria-hidden', 'true')
    await fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('removes the page lock when an open assistant unmounts', async () => {
    const view = await renderPanel()
    await waitFor(() => expect(document.documentElement).toHaveClass('v-overlay-scroll-blocked'))
    document.documentElement.scrollTop = 0
    view.unmount()
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    expect(document.documentElement.scrollTop).toBe(180)
    expect(document.querySelector('.agent-assistant-modal.v-overlay')).not.toBeInTheDocument()
  })

  it('keeps the assistant above its entry even when another dialog already owns the overlay stack', async () => {
    await renderPanel(true)
    const dialog = screen.getByRole('dialog', { name: '智能助手' })
    expect(Number(dialog.style.zIndex)).toBeGreaterThan(AGENT_ASSISTANT_LAYER_Z_INDEX.entry)
  })

  it('fits the inner conversation to the visual viewport while a mobile keyboard is visible', async () => {
    const viewport = Object.assign(new EventTarget(), { width: 390, height: 700, scale: 1 })
    vi.stubGlobal('visualViewport', viewport)
    await renderPanel()
    const panel = screen.getByRole('dialog', { name: '智能助手' }).querySelector<HTMLElement>('.agent-assistant-panel')!
    expect(panel.style.getPropertyValue('--agent-assistant-content-height')).toBe('700px')
    viewport.height = 350
    viewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(panel.style.getPropertyValue('--agent-assistant-content-height')).toBe('350px'))
    viewport.height = 700
    viewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(panel.style.getPropertyValue('--agent-assistant-content-height')).toBe('700px'))
  })

  it('keeps the desktop sidebar non-modal and leaves the page focusable', async () => {
    resize(1440)
    await renderPanel()
    const panel = screen.getByRole('dialog', { name: '智能助手' })
    expect(panel).toHaveClass('agent-assistant-panel')
    expect(panel).not.toHaveAttribute('aria-modal', 'true')
    expect(panel.style.getPropertyValue('--agent-assistant-content-height')).toBe('')
    expect(document.querySelector('.agent-assistant-modal.v-overlay')).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    const background = screen.getByRole('button', { name: '底层页面操作' })
    background.focus()
    expect(background).toHaveFocus()
  })

  it('releases the mobile lock when an open assistant becomes a desktop sidebar', async () => {
    await renderPanel()
    await waitFor(() => expect(document.documentElement).toHaveClass('v-overlay-scroll-blocked'))
    document.documentElement.scrollTop = 0
    resize(1440)
    await waitFor(() => expect(document.querySelector('.agent-assistant-modal.v-overlay')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: '智能助手' })).toHaveClass('agent-assistant-panel', 'is-open')
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    expect(document.documentElement.scrollTop).toBe(180)
    const background = screen.getByRole('button', { name: '底层页面操作' })
    background.focus()
    expect(background).toHaveFocus()
  })

  it('preserves the native Sheet content root without adding a web modal or scroll lock', async () => {
    window.MoviePilotNative = { transportVersion: 1, panelsVersion: 1, sheetsVersion: 1, postMessage: vi.fn() }
    nativeLayout.setActive(true)
    await renderPanel()
    const panel = screen.getByRole('dialog', { name: '智能助手' })
    expect(panel).toHaveClass('agent-assistant-panel', 'is-open')
    expect(panel.style.getPropertyValue('--agent-assistant-content-height')).toBe('')
    expect(document.querySelector('.agent-assistant-modal.v-overlay')).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('v-overlay-scroll-blocked')
    const sheets = new NativeSheetAdapter(document)
    expect(sheets.read('fallback')).toMatchObject({ title: '智能助手', fullscreen: true })
    sheets.reset()
  })
})
