import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('text-moviepilot theme color', () => {
  it('derives its gradient from the active Vuetify primary color', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')
    const textMoviePilotRule = commonStyles.match(/\.text-moviepilot\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule

    expect(textMoviePilotRule).toContain('var(--v-theme-primary)')
    expect(textMoviePilotRule).not.toMatch(/#818cf8|#c084fc/i)
  })
})
