import { configureAceEditorPadding } from '@/utils/aceEditor'
import { describe, expect, it, vi } from 'vitest'

describe('Ace editor configuration', () => {
  it('applies the shared content padding and scroll margin', () => {
    const setPadding = vi.fn()
    const setScrollMargin = vi.fn()
    const editor = {
      renderer: { setPadding, setScrollMargin },
    } as unknown as Parameters<typeof configureAceEditorPadding>[0]

    configureAceEditorPadding(editor)

    expect(setPadding).toHaveBeenCalledWith(12)
    expect(setScrollMargin).toHaveBeenCalledWith(8, 8, 0, 0)
  })
})
