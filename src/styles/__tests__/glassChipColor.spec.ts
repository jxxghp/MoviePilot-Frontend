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
})
