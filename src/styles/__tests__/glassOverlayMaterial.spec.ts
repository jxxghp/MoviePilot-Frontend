import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass overlay material styles', () => {
  it('keeps overlays translucent enough for CSS backdrop compositing in every material', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-overlay-blur: 12px')
    expect(styles).toContain('--glass-overlay-blur: 18px')
    expect(styles).toContain('--glass-overlay-blur: min(var(--glass-blur-raised), 36px)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 30%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 32%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 36%)')
    expect(styles).toContain('calc(0.24 + var(--glass-surface-density, 0.86) * 0.12)')
    expect(styles).not.toContain('calc(0.64 + var(--glass-surface-density, 0.86) * 0.16)')
    expect(styles).not.toContain('background: rgba(3, 7, 18, 62%)')
  })

  it('keeps the fixed navigation backdrop isolated from route content and its scrollbar', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-fixed-shell-backdrop-filter: blur(min(var(--glass-blur-raised), 60px))')
    expect(styles).toMatch(
      /\.layout-vertical-nav\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?&::before\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-fixed-shell-backdrop-filter\);/,
    )
    expect(styles).toMatch(
      /\.layout-vertical-nav \.ps__rail-y\s*\{[\s\S]*?inset-inline-end:\s*0\.5rem !important;/,
    )
  })

  it('uses the shared hover-card contract instead of a Dashboard-specific shadow rule', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('.app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)')
    expect(styles).not.toContain(
      '.dashboard-grid-item-content .app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)',
    )
  })
})
