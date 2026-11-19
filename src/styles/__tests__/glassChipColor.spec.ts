import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'
import postcss, { type Rule } from 'postcss'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

const root = cwd()
const glassPath = resolve(root, 'src/styles/themes/glass.scss')
const css = compileString(readFileSync(glassPath, 'utf8'), {
  url: new URL(pathToFileURL(glassPath).href),
  loadPaths: [resolve(root, 'node_modules')],
  importers: [
    {
      findFileUrl: url => {
        if (url === '@configured-variables')
          return new URL(pathToFileURL(resolve(root, 'src/styles/variables/_template.scss')).href)
        return url.startsWith('@layouts/') || url.startsWith('@core/')
          ? new URL(pathToFileURL(resolve(root, 'src', url)).href)
          : null
      },
    },
  ],
  logger: { warn: () => undefined, debug: () => undefined },
}).css
const foregroundOverrides: Rule[] = []
postcss.parse(css).walkRules(rule => {
  rule.walkDecls('color', declaration => {
    if (declaration.important && declaration.value === 'rgb(var(--v-theme-on-surface))') {
      foregroundOverrides.push(rule)
    }
  })
})

/** 用编译后的主题选择器检查 Chip，覆盖 CSS 优先级造成的语义色丢失。 */
function matchedForegroundOverrides(variant: string, color: string, scheme = 'light', theme = 'glass') {
  const fixture = document.implementation.createHTMLDocument('glass chip colors')
  fixture.documentElement.dataset.theme = theme
  fixture.documentElement.dataset.glassColorScheme = scheme
  fixture.body.dataset.theme = theme
  const chip = fixture.createElement('span')
  chip.className = `v-chip v-chip--variant-${variant} ${color}`
  fixture.body.append(chip)

  return foregroundOverrides.filter(rule => chip.matches(rule.selector)).map(rule => rule.selector)
}

describe('glass chip colors', () => {
  it.each(['primary', 'secondary', 'success', 'info', 'warning', 'error', 'red', ''])(
    'preserves the foreground that also tints the %s tonal chip underlay',
    color => {
      expect(matchedForegroundOverrides('tonal', color ? `text-${color}` : '')).toEqual([])
    },
  )

  it.each(['outlined', 'text', 'plain'])('preserves semantic colors for %s chips', variant => {
    expect(matchedForegroundOverrides(variant, 'text-success')).toEqual([])
  })

  it.each(['elevated', 'flat'])('keeps readable foregrounds on translucent %s chip fills', variant => {
    expect(matchedForegroundOverrides(variant, 'bg-success')).not.toHaveLength(0)
  })

  it.each(['tonal', 'elevated', 'flat'])('keeps %s foreground corrections scoped to light glass', variant => {
    expect(matchedForegroundOverrides(variant, 'bg-success', 'dark')).toEqual([])
    expect(matchedForegroundOverrides(variant, 'bg-success', 'light', 'plain')).toEqual([])
  })

  it.each(['primary', 'secondary', 'success', 'info', 'warning', 'error'])(
    'keeps light glass %s buttons and FABs on high-contrast on-color text instead of black on-surface',
    color => {
      const fixture = document.implementation.createHTMLDocument('glass button colors')
      fixture.documentElement.dataset.theme = 'glass'
      fixture.documentElement.dataset.glassColorScheme = 'light'
      fixture.body.dataset.theme = 'glass'
      const fabWrap = fixture.createElement('div')
      fabWrap.className = 'compact-fab compact-fab--primary'
      const button = fixture.createElement('button')
      button.className = `v-btn v-btn--elevated bg-${color}`
      fabWrap.append(button)
      fixture.body.append(fabWrap)

      expect(foregroundOverrides.filter(rule => button.matches(rule.selector))).toEqual([])
      expect(css).toContain(`--v-theme-on-${color}`)
    },
  )

  it('keeps light glass active vertical nav links on on-primary text instead of black on-surface', () => {
    const fixture = document.implementation.createHTMLDocument('glass nav active')
    fixture.documentElement.dataset.theme = 'glass'
    fixture.documentElement.dataset.glassColorScheme = 'light'
    fixture.body.dataset.theme = 'glass'
    const nav = fixture.createElement('aside')
    nav.className = 'layout-vertical-nav'
    const item = fixture.createElement('li')
    item.className = 'nav-link'
    const link = fixture.createElement('a')
    link.className = 'router-link-exact-active'
    item.append(link)
    nav.append(item)
    fixture.body.append(nav)

    expect(foregroundOverrides.filter(rule => link.matches(rule.selector))).toEqual([])
    expect(css).toContain('--glass-nav-active-background: linear-gradient(')
  })

  it('excludes flat no-blur and nested dialog cards from heavy glass link hover shadows and defines light hover shadow', () => {
    expect(css).toContain(
      '--glass-shadow-hover: 0 14px 32px rgba(0, 0, 0, 10%), inset 0 1px 0 rgba(255, 255, 255, 78%)',
    )
    expect(css).toContain('.v-card--link:not(.no-blur, :is(.v-card, .v-sheet) .v-card):hover')
  })

  it('keeps dark glass --mp-muted translucent instead of being overridden by the dark plain hex fallback', () => {
    const tokensPath = resolve(root, 'src/styles/tokens.scss')
    const tokensCss = compileString(readFileSync(tokensPath, 'utf8'), {
      url: new URL(pathToFileURL(tokensPath).href),
    }).css
    const mutedRules: Array<{ selector: string; value: string }> = []
    postcss.parse(tokensCss).walkRules(rule => {
      rule.walkDecls('--mp-muted', decl => {
        mutedRules.push({ selector: rule.selector, value: decl.value })
      })
    })

    const darkFallbackIndex = mutedRules.findIndex(item => item.value === '#131b2b')
    const glassMutedIndex = mutedRules.findIndex(item => item.value === 'rgba(255, 255, 255, 0.055)')
    expect(darkFallbackIndex).toBeGreaterThanOrEqual(0)
    expect(glassMutedIndex).toBeGreaterThan(darkFallbackIndex)
    expect(mutedRules[darkFallbackIndex].selector).toContain(':where(')
    expect(mutedRules[glassMutedIndex].selector).toContain('[data-theme=')
  })

  it('defines cool-slate light glass overrides for tables, ace selection, logging stripes, and frosted overlays', () => {
    expect(css).toContain('--glass-chip-base-opacity: 16%')
    expect(css).toContain('--logging-record-bg-even: rgba(15, 23, 42, 3.8%)')
    expect(css).toContain('--permission-editor-muted-border: 1px solid rgba(60, 60, 67, 12%)')
    expect(css).toContain('background-color: rgba(15, 23, 42, 0.045)')
  })
})
