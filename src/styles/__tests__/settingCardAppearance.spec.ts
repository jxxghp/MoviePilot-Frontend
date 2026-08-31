import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('setting card appearance', () => {
  it('does not render an accent strip on colorful setting cards', () => {
    const styleFiles = ['src/styles/common.scss', 'src/styles/themes/glass.scss', 'src/styles/themes/transparent.scss']
    const styles = styleFiles.map(file => readFileSync(resolve(cwd(), file), 'utf8')).join('\n')

    expect(styles).not.toContain('.app-card-colorful::before')
    expect(styles).not.toContain('--app-card-stripe-opacity')
  })
})
