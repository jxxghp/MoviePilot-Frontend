import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass card focus styles', () => {
  it('does not propagate descendant input focus to glass card contours', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/_glass-v3.scss'), 'utf8')
    const focusStart = styles.indexOf('      // 只给自身获得可见焦点的卡片提供轮廓')
    const focusEnd = styles.indexOf('      .dashboard-grid-content-measure > .v-card :is(', focusStart)
    const focusRule = styles.slice(focusStart, focusEnd)

    expect(focusStart).toBeGreaterThanOrEqual(0)
    expect(focusEnd).toBeGreaterThan(focusStart)
    expect(focusRule.match(/:focus-visible/g)).toHaveLength(3)
    expect(focusRule).not.toContain(':focus-within')
    expect(focusRule).toContain('outline: 2px solid rgba(var(--v-theme-primary), 0.65)')
    expect(focusRule).toContain('outline-offset: 2px')
  })

  it('keeps native input and interactive control focus indicators', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(/\.v-field--focused\s*\{/u)
    expect(styles).toContain('0 0 0 3px rgba(var(--v-theme-primary), 14%)')
    expect(styles).toMatch(/:where\(\.v-btn, \.v-card--link, \[role='button'\]\):focus-visible\s*\{/u)
    expect(styles).toContain('0 0 0 3px rgba(var(--v-theme-primary), 18%)')
  })
})
