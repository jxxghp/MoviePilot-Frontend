import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass overlay material styles', () => {
  it('keeps overlays translucent enough for CSS backdrop compositing in every material', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('calc(0.1 + var(--glass-surface-density, 0.62) * 0.22)')
    expect(styles).toContain('--glass-overlay-blur: 3px')
    expect(styles).toContain('--glass-overlay-saturate: 115%')
    expect(styles).toContain('--glass-overlay-blur: 12px')
    expect(styles).toContain('--glass-overlay-saturate: 120%')
    expect(styles).toContain('--glass-overlay-blur: min(var(--glass-blur-raised), 36px)')
    expect(styles).toContain('--glass-overlay-saturate: 135%')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 30%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 32%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 36%)')
    expect(styles).toContain('calc(0.24 + var(--glass-surface-density, 0.86) * 0.12)')
    expect(styles).not.toContain('calc(0.64 + var(--glass-surface-density, 0.86) * 0.16)')
    expect(styles).not.toContain('background: rgba(3, 7, 18, 62%)')
  })

  it('composites glass dialogs at their final geometry instead of resampling a scaled backdrop', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /\.v-overlay__content\.mp-dialog-transition-enter-active[\s\S]*?transition:\s*opacity 120ms var\(--mp-motion-ease-standard\);/,
    )
    expect(styles).toMatch(
      /\.v-overlay__content\.mp-dialog-transition-enter-from[\s\S]*?filter:\s*none;[\s\S]*?transform:\s*none;/,
    )
  })

  it('keeps the fixed navigation backdrop isolated from route content and its scrollbar', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-fixed-shell-backdrop-filter: blur(min(var(--glass-blur-raised), 60px))')
    expect(styles).toMatch(
      /\.layout-vertical-nav\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?backdrop-filter:\s*none;[\s\S]*?&::before\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-fixed-shell-backdrop-filter\);/,
    )
    expect(styles).toMatch(/\.layout-vertical-nav \.ps__rail-y\s*\{[\s\S]*?inset-inline-end:\s*0\.5rem !important;/)
  })

  it('shares the same light frost when glass navbars overlap scrolled content', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-navbar-scrolled-backdrop-filter: blur(3px) saturate(115%)')
    expect(styles).toMatch(
      /:is\(\[data-glass-appearance='clear'\], \[data-glass-appearance='tinted'\]\)[\s\S]*?\.layout-wrapper\.window-scrolled\.layout-navbar-fixed \.layout-navbar,[\s\S]*?backdrop-filter:\s*var\(--glass-navbar-scrolled-backdrop-filter\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\][\s\S]*?\.layout-wrapper\.window-scrolled\.layout-navbar-fixed \.layout-navbar,[\s\S]*?\.layout-horizontal-nav-scrolled[\s\S]*?backdrop-filter:\s*var\(--glass-navbar-scrolled-backdrop-filter\)\s*!important;/,
    )
  })

  it('uses the shared hover-card contract instead of a Dashboard-specific shadow rule', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('.app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)')
    expect(styles).not.toContain(
      '.dashboard-grid-item-content .app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)',
    )
  })

  it('hands the CSS fallback to an already rendered canvas without a second opacity transition', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const layerRuleStart = styles.indexOf('.glass-optical-layer {')
    const layerRuleEnd = styles.indexOf('.glass-optical-layer--fixed', layerRuleStart)
    const layerRule = styles.slice(layerRuleStart, layerRuleEnd)

    expect(layerRuleStart).toBeGreaterThanOrEqual(0)
    expect(layerRuleEnd).toBeGreaterThan(layerRuleStart)
    expect(layerRule).toContain('opacity: 0')
    expect(layerRule).not.toMatch(/transition\s*:/)
    expect(styles).toMatch(/\[data-glass-renderer-state='ready'\]\s*\.glass-optical-layer\s*\{\s*opacity:\s*1;/)
  })

  it('keeps the native scroll backplate stable while suspending only GPU dynamics', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-native-surface-backdrop-filter')
    expect(styles).toContain('blur(calc(16px * var(--glass-frost-blur-scale, 1))) saturate(162%)')
    expect(styles).toContain('blur(calc(10px * var(--glass-frost-blur-scale, 1))) saturate(154%)')
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\][\s\S]*?\[data-glass-renderer-state='ready'\]\s*\{[\s\S]*?--glass-surface-backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\);/,
    )
    expect(styles).toMatch(
      /\[data-glass-scroll-presentation='native'\][\s\S]*?\.glass-optical-layer--scroll\s*\{\s*opacity:\s*0\s*!important;/,
    )
    expect(styles).toMatch(
      /\[data-glass-renderer-state='ready'\][\s\S]*?\.app-hover-lift-card:not\(\.media-card--image-loaded\)[\s\S]*?backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\.settings-section-card\.app-grouped-list\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\.file-browser-toolbar\.v-toolbar\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).not.toMatch(
      /\[data-glass-scroll-presentation='native'\][\s\S]*?:where\([\s\S]*?--glass-native-surface-backdrop-filter/,
    )
  })
})
