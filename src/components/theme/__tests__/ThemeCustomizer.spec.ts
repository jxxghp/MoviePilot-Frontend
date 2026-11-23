import ThemeCustomizer from '../ThemeCustomizer.vue'
import { NativeLayoutAdapter, nativeChromeActive } from '@/native/layout'
import { renderWithProviders } from '@tests/support/render'
import { clearSharedDialogs, useSharedDialog } from '@/composables/useSharedDialog'
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
  clearSharedDialogs()
  persistPartialThemeCustomizerSettings({
    glassAppearance: 'clear',
    glassEnabled: false,
    glassQuality: 'css',
  })
})
afterEach(() => {
  clearSharedDialogs()
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

  it('开启玻璃特效后联动显示材质外观、渲染画质与高级调节入口，并在关闭或原生接管时隐藏', async () => {
    const user = userEvent.setup()
    const { container, getByLabelText, getByRole } = await renderWithProviders(ThemeCustomizer)
    const toggle = getByLabelText('启用玻璃特效')

    expect(container.querySelector('.theme-customizer-glass-panel')).toBeNull()

    await fireEvent.click(toggle)
    await waitFor(() => expect(readThemeCustomizerSettings().glassEnabled).toBe(true))
    expect(container.querySelector('.theme-customizer-glass-panel')).not.toBeNull()

    const clearBtn = container.querySelector<HTMLButtonElement>('[data-glass-appearance="clear"]')!
    const tintedBtn = container.querySelector<HTMLButtonElement>('[data-glass-appearance="tinted"]')!
    const frostedBtn = container.querySelector<HTMLButtonElement>('[data-glass-appearance="frosted"]')!
    expect(clearBtn.getAttribute('aria-pressed')).toBe('true')
    expect(tintedBtn.getAttribute('aria-pressed')).toBe('false')
    expect(frostedBtn.getAttribute('aria-pressed')).toBe('false')

    await fireEvent.click(tintedBtn)
    await waitFor(() => expect(readThemeCustomizerSettings().glassAppearance).toBe('tinted'))
    expect(tintedBtn.getAttribute('aria-pressed')).toBe('true')
    expect(clearBtn.getAttribute('aria-pressed')).toBe('false')

    frostedBtn.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(readThemeCustomizerSettings().glassAppearance).toBe('frosted'))
    expect(frostedBtn.getAttribute('aria-pressed')).toBe('true')

    const cssBtn = container.querySelector<HTMLButtonElement>('[data-glass-quality="css"]')!
    const balancedBtn = container.querySelector<HTMLButtonElement>('[data-glass-quality="balanced"]')!
    const highBtn = container.querySelector<HTMLButtonElement>('[data-glass-quality="high"]')!
    expect(cssBtn.getAttribute('aria-pressed')).toBe('true')

    await fireEvent.click(balancedBtn)
    await waitFor(() => expect(readThemeCustomizerSettings().glassQuality).toBe('balanced'))
    expect(balancedBtn.getAttribute('aria-pressed')).toBe('true')
    expect(cssBtn.getAttribute('aria-pressed')).toBe('false')

    await fireEvent.click(highBtn)
    await waitFor(() => expect(readThemeCustomizerSettings().glassQuality).toBe('high'))
    expect(highBtn.getAttribute('aria-pressed')).toBe('true')

    const tuningBtn = getByRole('button', { name: '玻璃设置' })
    await fireEvent.click(tuningBtn)
    expect(useSharedDialog().dialogs.value).toHaveLength(1)

    await fireEvent.click(toggle)
    await waitFor(() => expect(readThemeCustomizerSettings().glassEnabled).toBe(false))
    expect(container.querySelector('.theme-customizer-glass-panel')).toBeNull()

    await fireEvent.click(toggle)
    await waitFor(() => expect(container.querySelector('.theme-customizer-glass-panel')).not.toBeNull())

    nativeLayout.setActive(true)
    await waitFor(() => expect(container.querySelector('.theme-customizer-glass-panel')).toBeNull())
    expect(container.querySelector('.theme-customizer-glass-toggle')).toBeNull()
  })
})
