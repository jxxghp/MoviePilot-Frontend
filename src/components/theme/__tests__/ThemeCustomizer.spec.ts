import ThemeCustomizer from '../ThemeCustomizer.vue'
import { NativeLayoutAdapter, nativeChromeActive } from '@/native/layout'
import { renderWithProviders } from '@tests/support/render'
import {
  persistPartialThemeCustomizerSettings,
  readThemeCustomizerSettings,
  getDefaultGlassCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { fireEvent, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { computed } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pwa = vi.hoisted(() => ({ appMode: false }))
vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: computed(() => pwa.appMode || nativeChromeActive.value) }),
}))
vi.mock('@/utils/themeSettingsPersistence', () => ({
  readRemoteUserConfig: vi.fn().mockResolvedValue(null),
  writeRemoteUserConfig: vi.fn().mockResolvedValue(true),
  THEME_CUSTOMIZER_REMOTE_KEY: 'ThemeCustomizerSettings',
}))

const nativeLayout = new NativeLayoutAdapter(document, window)
beforeEach(() => {
  persistPartialThemeCustomizerSettings({ glassEnabled: false })
})
afterEach(() => {
  nativeLayout.setActive(false)
  pwa.appMode = false
})

describe('主题设置的原生与网页边界', () => {
  it('PWA恢复默认清除全部玻璃覆盖且保留桌面布局偏好', async () => {
    pwa.appMode = true
    persistPartialThemeCustomizerSettings({
      layout: 'horizontal',
      theme: 'dark',
      primaryColor: '#FFB400',
      radius: 'large',
      glassUIStyle: 'clear',
      glassDynamicsMode: 'off',
      glassTransparencyStrength: 91,
      glassPresetOverrides: {
        'clear:css:natural': {
          deformation: 91,
          flow: 91,
          reflection: 91,
          transmission: 91,
          translation: 91,
          transparency: 91,
        },
      },
    })
    const { getByLabelText, container } = await renderWithProviders(ThemeCustomizer)
    await fireEvent.click(getByLabelText('重置主题定制'))
    await waitFor(() =>
      expect(readThemeCustomizerSettings()).toMatchObject({
        ...getDefaultGlassCustomizerSettings('css'),
        glassEnabled: true,
        layout: 'horizontal',
        theme: 'auto',
        radius: 'default',
      }),
    )
    expect(container.querySelector('.v-badge__badge')?.getAttribute('style')).toContain('display: none')
  })

  it('颜色和圆角选项可以聚焦并使用键盘激活且暴露选择状态', async () => {
    const user = userEvent.setup()
    const { container } = await renderWithProviders(ThemeCustomizer)
    const color = container.querySelectorAll<HTMLElement>('.theme-customizer-color-option')[1]
    color.focus()
    expect(document.activeElement).toBe(color)
    await user.keyboard('{Enter}')
    await waitFor(() => expect(color.getAttribute('aria-pressed')).toBe('true'))
    const radius = container.querySelector<HTMLElement>(
      '.theme-customizer-preview-grid--radius .theme-customizer-preview-option',
    )!
    radius.focus()
    expect(document.activeElement).toBe(radius)
    await user.keyboard(' ')
    await waitFor(() => expect(readThemeCustomizerSettings().radius).toBe('none'))
    expect(radius.getAttribute('aria-pressed')).toBe('true')
    const horizontal = container.querySelector<HTMLElement>('.theme-customizer-mini-layout--horizontal')!.parentElement!
    horizontal.focus()
    expect(document.activeElement).toBe(horizontal)
    await user.keyboard('{Enter}')
    await waitFor(() => expect(readThemeCustomizerSettings().layout).toBe('horizontal'))
    expect(horizontal.getAttribute('aria-pressed')).toBe('true')
    const input = container.querySelector<HTMLInputElement>('input[type="color"]')!
    const open = vi.spyOn(input, 'click')
    const picker = container.querySelector<HTMLElement>('.theme-customizer-color-option--picker')!
    picker.focus()
    await user.keyboard('{Enter}')
    expect(open).toHaveBeenCalledOnce()
  })

  it('App模式同样提供自定义色调入口且支持手输缩写色值', async () => {
    pwa.appMode = true
    const user = userEvent.setup()
    const { container, getByLabelText } = await renderWithProviders(ThemeCustomizer)
    expect(container.querySelector('.theme-customizer-color-option--picker')).not.toBeNull()
    expect(container.querySelector('input[type="color"]')).not.toBeNull()
    const hex = getByLabelText('自定义色值') as HTMLInputElement
    await user.clear(hex)
    await user.type(hex, '#f80{enter}')
    await waitFor(() => expect(readThemeCustomizerSettings().primaryColor).toBe('#FF8800'))
  })

  it('非法手输色值只提示且不写入设置', async () => {
    const user = userEvent.setup()
    const { getByLabelText, findByText } = await renderWithProviders(ThemeCustomizer)
    const before = readThemeCustomizerSettings().primaryColor
    const hex = getByLabelText('自定义色值') as HTMLInputElement
    await user.clear(hex)
    await user.type(hex, '#12{enter}')
    expect(await findByText('请输入 6 位十六进制色值，例如 #1AC6FF')).not.toBeNull()
    expect(hex.getAttribute('aria-invalid')).toBe('true')
    expect(readThemeCustomizerSettings().primaryColor).toBe(before)
  })

  it('切换预设色调后自定义输入框同步当前色值', async () => {
    const { container, getByLabelText } = await renderWithProviders(ThemeCustomizer)
    const hex = getByLabelText('自定义色值') as HTMLInputElement
    await fireEvent.click(container.querySelectorAll<HTMLElement>('.theme-customizer-color-option')[2])
    await waitFor(() => expect(hex.value).toBe('#1976D2'))
  })

  it('网页保留主题、圆角和布局控件', async () => {
    const { container } = await renderWithProviders(ThemeCustomizer)
    expect(container.querySelector('.theme-customizer-option-grid--theme')).not.toBeNull()
    expect(container.querySelector('.theme-customizer-preview-grid--radius')).not.toBeNull()
    expect(container.querySelector('.theme-customizer-mini-layout--horizontal')).not.toBeNull()
    expect(container.querySelector('[data-native-sheet-size]')).toBeNull()
  })

  it('协商接管后提供明暗与主色，以半屏呈现并保留原关闭事件', async () => {
    nativeLayout.setActive(true)
    const { container, getByLabelText, emitted } = await renderWithProviders(ThemeCustomizer)
    expect(container.querySelectorAll('.theme-customizer-option-grid--theme button')).toHaveLength(3)
    expect(container.querySelector('.theme-customizer-preview-grid--radius')).toBeNull()
    expect(container.querySelector('.theme-customizer-mini-layout--horizontal')).toBeNull()
    expect(container.querySelector('.theme-customizer-color-grid')).not.toBeNull()
    expect(container.querySelector('.theme-customizer-glass-toggle')).toBeNull()
    expect(container.textContent).toContain('浅色')
    expect(container.textContent).toContain('深色')
    expect(container.textContent).toContain('跟随系统')
    expect(container.querySelector('aside')?.dataset.nativeSheetSize).toBe('medium')
    getByLabelText('关闭').click()
    expect(emitted().close).toHaveLength(1)
  })

  it('网页通过主题区域的开关保存玻璃选择', async () => {
    const { getByLabelText } = await renderWithProviders(ThemeCustomizer)
    const toggle = getByLabelText('启用玻璃特效')
    expect(toggle).not.toBeChecked()
    await fireEvent.click(toggle)
    await waitFor(() => expect(readThemeCustomizerSettings().glassEnabled).toBe(true))
    expect(toggle).toBeChecked()
    await fireEvent.click(toggle)
    await waitFor(() => expect(readThemeCustomizerSettings().glassEnabled).toBe(false))
    expect(toggle).not.toBeChecked()
  })
})
