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

  it.each(['elevated', 'flat'])(
    'keeps readable on-surface foregrounds on 34%% translucent %s bg-* chips in both light and dark glass',
    variant => {
      expect(matchedForegroundOverrides(variant, 'bg-success', 'light')).not.toHaveLength(0)
      expect(matchedForegroundOverrides(variant, 'bg-success', 'dark')).not.toHaveLength(0)
      expect(matchedForegroundOverrides(variant, 'bg-success', 'light', 'plain')).toEqual([])
    },
  )

  it('does not override solid custom chips without bg-* classes (poster badges, torrent tags, selected filter chips)', () => {
    expect(matchedForegroundOverrides('elevated', 'media-card-badge media-card-badge--tv', 'light')).toEqual([])
    expect(matchedForegroundOverrides('flat', 'filter-chip v-chip--selected', 'light')).toEqual([])
    expect(matchedForegroundOverrides('flat', 'chip-season', 'light')).toEqual([])
  })

  it.each(['primary', 'success', 'info', 'warning', 'error'])(
    'uses high-contrast on-surface foreground on 46%%-48%% dark glass %s buttons',
    color => {
      const fixture = document.implementation.createHTMLDocument('dark glass button colors')
      fixture.documentElement.dataset.theme = 'glass'
      fixture.documentElement.dataset.glassColorScheme = 'dark'
      fixture.body.dataset.theme = 'glass'
      const button = fixture.createElement('button')
      button.className = `v-btn v-btn--elevated bg-${color}`
      fixture.body.append(button)

      expect(foregroundOverrides.filter(rule => button.matches(rule.selector))).not.toHaveLength(0)
    },
  )

  it('uses high-contrast on-surface foreground on dark glass active vertical nav links', () => {
    const fixture = document.implementation.createHTMLDocument('dark glass nav active')
    fixture.documentElement.dataset.theme = 'glass'
    fixture.documentElement.dataset.glassColorScheme = 'dark'
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

    expect(foregroundOverrides.filter(rule => link.matches(rule.selector))).not.toHaveLength(0)
  })

  it('uses on-surface foreground on dark glass ConfirmDialog tonal cancel buttons and keeps single primary FAB on on-primary', () => {
    const fixture = document.implementation.createHTMLDocument('dark glass dialog and fab')
    fixture.documentElement.dataset.theme = 'glass'
    fixture.documentElement.dataset.glassColorScheme = 'dark'
    fixture.body.dataset.theme = 'glass'
    const actions = fixture.createElement('div')
    actions.className = 'app-confirm-dialog-actions'
    const cancelBtn = fixture.createElement('button')
    cancelBtn.className = 'v-btn v-btn--variant-tonal text-secondary'
    actions.append(cancelBtn)
    fixture.body.append(actions)

    expect(foregroundOverrides.filter(rule => cancelBtn.matches(rule.selector))).not.toHaveLength(0)
    expect(css).toContain('.compact-fab-stack:not(:has(> :nth-child(2))) .compact-fab--primary .v-btn.bg-primary')
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

  it('defines cool-slate light glass overrides for chips, permission editor, and tokenized tables', () => {
    expect(css).toContain('--glass-chip-base-opacity: 16%')
    expect(css).toContain('--permission-editor-muted-border: 1px solid rgba(60, 60, 67, 12%)')
    expect(css).toContain('background-color: var(--mp-muted)')
    expect(css).toContain('background-color: var(--mp-list-row-hover)')
    expect(css).not.toContain('--logging-record-bg-even')
  })
})
