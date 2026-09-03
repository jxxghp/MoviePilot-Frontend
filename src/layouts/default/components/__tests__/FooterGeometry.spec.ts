import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('Footer Dock geometry', () => {
  it('keeps the contextual accessory beside the primary Dock without narrowing primary navigation', () => {
    const source = readFileSync(resolve(cwd(), 'src/layouts/default/components/Footer.vue'), 'utf8')

    expect(source).toContain('data-footer-nav-role="primary"')
    expect(source).toContain('data-footer-nav-role="accessory"')
    expect(source).toContain("'footer-nav-container--with-accessory': showDynamicButton")
    expect(source).toMatch(/\.footer-nav-group\s*\{[\s\S]*?position:\s*relative;/)
    expect(source).toMatch(
      /\.dynamic-btn-card\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-block-end:\s*0;[\s\S]*?inset-inline-start:\s*calc\(100% \+ 2px\);/,
    )
    expect(source).not.toContain('@media (width <= 480px)')
    expect(source).not.toContain('inset-block-end: calc(100% + 4px)')
    expect(source).toMatch(
      /\[dir='rtl'\] \.footer-nav-enter-from,[\s\S]*?\[dir='rtl'\] \.footer-nav-leave-to\s*\{[\s\S]*?transform:\s*translateX\(-20px\);/,
    )
  })
})
