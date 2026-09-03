import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('system update prompt material styles', () => {
  it('keeps the fixed prompt on shared overlay geometry tokens', () => {
    const component = readFileSync(resolve(cwd(), 'src/components/system/SystemUpdatePrompt.vue'), 'utf8')

    expect(component).toContain('<VCard')
    expect(component).toContain('position: fixed')
    expect(component).toContain('border: var(--app-overlay-border)')
    expect(component).toContain('border-radius: var(--app-overlay-radius) !important')
    expect(component).toContain('box-shadow: var(--app-overlay-shadow)')
    expect(component).not.toContain('box-shadow: var(--app-overlay-shadow) !important')
    expect(component).not.toContain('elevation="12"')
    expect(component).not.toContain('border-radius: 8px')
  })

  it('reuses the glass overlay material for the update prompt', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const overlayRule = styles.match(
      /:where\(\.Vue-Toastification__toast, \.agent-assistant-fab__bubble, \.system-update-prompt\)\s*\{(?<declarations>[\s\S]*?)\n {2}\}/u,
    )?.groups?.declarations

    expect(overlayRule).toBeDefined()
    expect(overlayRule).toContain('backdrop-filter: var(--glass-overlay-backdrop-filter) !important')
    expect(overlayRule).toContain('background-color: var(--glass-overlay-surface) !important')
    expect(overlayRule).toContain('background-image: var(--glass-sheen) !important')
    expect(overlayRule).toContain('box-shadow: var(--glass-shadow-raised) !important')
  })

  it('keeps transparent prompt material aligned across blur modes', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/transparent.scss'), 'utf8')
    const promptRules = styles.match(
      /\.system-update-prompt\s*\{[\s\S]*?backdrop-filter: blur\(var\(--transparent-blur\)\) !important;[\s\S]*?background-color: rgba\(var\(--v-theme-surface\), var\(--transparent-opacity-heavy\)\) !important;[\s\S]*?\}/g,
    )

    expect(promptRules).toHaveLength(1)
    expect(styles).toMatch(
      /\.agent-assistant-panel,\s*\.agent-assistant-fab__bubble,\s*\.system-update-prompt,[\s\S]*?backdrop-filter: none !important;/,
    )
  })
})
