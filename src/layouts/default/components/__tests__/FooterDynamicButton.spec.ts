import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('Footer dynamic Dock continuity', () => {
  const footerSource = readFileSync(resolve(cwd(), 'src/layouts/default/components/Footer.vue'), 'utf8')
  const glassSource = readFileSync(resolve(cwd(), 'src/styles/themes/_glass-v3.scss'), 'utf8')

  it('keeps the accessory card mounted and removes hidden commands from interaction', () => {
    expect(footerSource).toContain('key="dynamic-btn"')
    expect(footerSource).not.toMatch(/<VCard\s+v-if="showDynamicButton"/u)
    expect(footerSource).toContain("'footer-nav-card--collapsed': !isAccessoryVisible")
    expect(footerSource).not.toContain('<TransitionGroup')
    expect(footerSource).toContain(':disabled="!showDynamicButton"')
    expect(footerSource).toContain(':tabindex="showDynamicButton ? undefined : -1"')
    expect(footerSource).toContain('visibleDynamicButtonMenuItems.value.includes(item)')
    expect(footerSource).toContain('ownsRegisterBridge && ownsUnregisterBridge')
  })

  it('animates only Dock accessory width and keeps the glass 320px-capable layout fluid', () => {
    expect(footerSource).toContain('flex-basis var(--mp-motion-duration-overlay, 160ms)')
    expect(footerSource).toContain('max-inline-size var(--mp-motion-duration-overlay, 160ms)')
    expect(glassSource).toContain('inline-size: min(100%, 26rem);')
    expect(glassSource).toContain('.footer-nav-card.dynamic-btn-card.footer-nav-card--collapsed')
  })
})
