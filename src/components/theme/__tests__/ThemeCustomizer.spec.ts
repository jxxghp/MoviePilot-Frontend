import ThemeCustomizer from '../ThemeCustomizer.vue'
import { NativeLayoutAdapter } from '@/native/layout'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it } from 'vitest'

const nativeLayout = new NativeLayoutAdapter(document, window)
afterEach(() => nativeLayout.setActive(false))

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
    expect(container.textContent).toContain('浅色')
    expect(container.textContent).toContain('深色')
    expect(container.textContent).toContain('跟随系统')
    expect(container.querySelector('aside')?.dataset.nativeSheetSize).toBe('medium')
    getByLabelText('关闭').click()
    expect(emitted().close).toHaveLength(1)
  })
})
