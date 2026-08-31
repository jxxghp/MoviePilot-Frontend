import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('input hint spacing', () => {
  it('keeps wrapped Vuetify messages readable', () => {
    const vuetifyOverrides = readFileSync(resolve(cwd(), 'src/@core/scss/libs/vuetify/_overrides.scss'), 'utf8')
    const messagesRule = vuetifyOverrides.match(/\.v-messages\s*\{(?<rule>[\s\S]*?)\n\}/)?.groups?.rule

    expect(messagesRule).toMatch(/&__message\s*\{[\s\S]*?line-height:\s*1\.4;/)
  })
})
