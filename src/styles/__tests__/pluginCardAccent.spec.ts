import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('plugin card accent styles', () => {
  it('uses a nullable icon accent before the dynamic material and theme fallbacks', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')
    const ruleStart = commonStyles.indexOf('.plugin-card__banner')
    const ruleEnd = commonStyles.indexOf('.grid-downloading-card', ruleStart)
    const bannerRule = commonStyles.slice(ruleStart, ruleEnd)

    expect(ruleStart).toBeGreaterThanOrEqual(0)
    expect(ruleEnd).toBeGreaterThan(ruleStart)
    expect(bannerRule).toContain('--plugin-card-effective-accent-rgb: var(')
    expect(bannerRule).toContain('--plugin-card-accent-rgb,')
    expect(bannerRule).toContain('var(--glass-material-accent-rgb, var(--v-theme-primary))')
    expect(bannerRule).not.toContain('40, 169, 225')
  })

  it('limits tinted theme mixing to six percent', () => {
    const glassStyles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const tintedBannerRule = glassStyles.match(
      /&\[data-glass-appearance='tinted'\] \.plugin-card__banner\s*\{(?<declarations>[\s\S]*?)\n {2}\}/u,
    )?.groups?.declarations

    expect(glassStyles.match(/rgba\(var\(--plugin-card-effective-accent-rgb\)/g)).toHaveLength(9)
    expect(glassStyles.match(/rgba\(var\(--plugin-card-effective-accent-rgb\)[\s\S]*?\) 94%/g)).toHaveLength(2)
    expect(tintedBannerRule?.match(/rgba\(var\(--glass-material-accent-rgb\)[\s\S]*?\)\s*\)/g)).toHaveLength(2)
    expect(glassStyles).not.toContain('var(--plugin-card-accent-rgb, 40, 169, 225)')
  })
})
