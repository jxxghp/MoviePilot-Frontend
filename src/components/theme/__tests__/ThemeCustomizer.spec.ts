import ThemeCustomizer from '../ThemeCustomizer.vue'
import { NativeLayoutAdapter } from '@/native/layout'
import { persistPartialThemeCustomizerSettings, readThemeCustomizerSettings } from '@/composables/useThemeCustomizer'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/themeSettingsPersistence', () => ({
  THEME_CUSTOMIZER_REMOTE_KEY: 'ThemeCustomizerSettings',
  writeRemoteUserConfig: vi.fn().mockResolvedValue(true),
  readRemoteUserConfig: vi.fn().mockResolvedValue(null),
}))

const nativeLayout = new NativeLayoutAdapter(document, window)
afterEach(() => nativeLayout.setActive(false))
beforeEach(() => {
  persistPartialThemeCustomizerSettings({ glassEnabled: false })
})

describe('主题设置的原生与网页边界', () => {
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
