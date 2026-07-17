import logoSvg from '@images/logo.svg?raw'
import { applyThemeLogoPalette, createThemeLogoPalette } from '@/utils/themeLogo'
import { describe, expect, it } from 'vitest'

describe('theme logo palette', () => {
  it('reproduces the source artwork when its original primary color is selected', () => {
    const result = applyThemeLogoPalette(logoSvg, createThemeLogoPalette('#8D51F9'))

    expect(result).toBe(logoSvg)
  })

  it('replaces every original logo color without flattening its gradient structure', () => {
    const palette = createThemeLogoPalette('#00BCD4')
    const result = applyThemeLogoPalette(logoSvg, palette)
    const originalColors = [
      'rgb(141,81,249)',
      'rgb(165,118,255)',
      'rgb(211,187,255)',
      'rgb(116,50,223)',
      'rgb(110,38,217)',
      'rgb(104,0,197)',
      'rgb(91,0,197)',
    ]

    expect(result.match(/<(?:linear|radial)Gradient/g)).toHaveLength(6)
    expect(result.match(/<path/g)).toHaveLength(12)
    expect(result).toContain('stop-opacity:1')
    expect(result).toContain(palette.primary)
    expect(result).toContain(palette.highlight)
    expect(result).toContain(palette.deepest)
    originalColors.forEach(color => expect(result).not.toContain(color))
  })

  it.each(['#000000', '#808080', '#FFFFFF'])('keeps visible facet contrast for neutral theme color %s', primary => {
    const palette = createThemeLogoPalette(primary)
    const distinctColors = new Set(Object.values(palette))

    expect(distinctColors.size).toBeGreaterThanOrEqual(5)
    expect(palette.primary).not.toBe(palette.highlight)
    expect(palette.primary).not.toBe(palette.deepest)
  })
})
