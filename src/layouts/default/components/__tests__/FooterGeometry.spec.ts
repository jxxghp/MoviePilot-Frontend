import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('Footer Dock geometry', () => {
  it('reserves the measured Dock height after the App content', () => {
    const source = readFileSync(resolve(cwd(), 'src/@layouts/styles/_default-layout.scss'), 'utf8')

    expect(source).toContain('padding-block-end: calc(1.5rem + var(--layout-footer-dock-height, 0px));')
  })

  it('keeps the contextual accessory beside the primary Dock without narrowing primary navigation', () => {
    const source = readFileSync(resolve(cwd(), 'src/layouts/default/components/Footer.vue'), 'utf8')

    expect(source).toContain('data-footer-nav-role="primary"')
    expect(source).toContain('data-footer-nav-role="accessory"')
    expect(source).toContain("'footer-nav-container--with-accessory': showDynamicButton")
    expect(source).toMatch(
      /\.footer-nav-container--with-accessory\s*\{[\s\S]*?--footer-nav-accessory-space:\s*60px;[\s\S]*?padding-inline-end:\s*calc\(var\(--footer-nav-accessory-space\) \+ 2px\);/,
    )
    expect(source).toMatch(/\.footer-nav-group\s*\{[\s\S]*?position:\s*relative;/)
    expect(source).toMatch(
      /\.dynamic-btn-card\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?block-size:\s*48px;[\s\S]*?inset-block:\s*0;[\s\S]*?inset-inline-start:\s*calc\(100% \+ 2px\);[\s\S]*?margin-block:\s*auto !important;/,
    )
    expect(source).not.toContain('@media (width <= 480px)')
    expect(source).not.toContain('inset-block-end: calc(100% + 4px)')
    expect(source).toMatch(
      /\[dir='rtl'\] \.footer-nav-enter-from,[\s\S]*?\[dir='rtl'\] \.footer-nav-leave-to\s*\{[\s\S]*?transform:\s*translateX\(-20px\);/,
    )
  })
})
