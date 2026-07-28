import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('plugin card accent styles', () => {
  it('inherits the icon-derived accent instead of shadowing it on the banner', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')
    const ruleStart = commonStyles.indexOf('.plugin-card__banner')
    const ruleEnd = commonStyles.indexOf('.grid-downloading-card', ruleStart)
    const bannerRule = commonStyles.slice(ruleStart, ruleEnd)

    expect(ruleStart).toBeGreaterThanOrEqual(0)
    expect(ruleEnd).toBeGreaterThan(ruleStart)
    expect(bannerRule).not.toMatch(/--plugin-card-accent-rgb\s*:/)
    expect(bannerRule).toContain('var(--plugin-card-accent-rgb, 40, 169, 225)')
  })
})
