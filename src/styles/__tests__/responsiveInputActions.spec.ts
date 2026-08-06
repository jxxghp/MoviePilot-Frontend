import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('mobile responsive input actions', () => {
  it('keeps functional trailing controls without restoring decorative icons', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')

    expect(commonStyles).toMatch(
      /\.app-responsive-input__native \.v-field__clearable,\s*\.app-responsive-input__native\s+\.v-field__append-inner:has\([\s\S]*?\)\s*\{\s*display: inline-flex;/,
    )
    expect(commonStyles).toContain("[role='button']:not(")
    expect(commonStyles).toContain('.v-select__menu-icon')
    expect(commonStyles).toContain('.v-autocomplete__menu-icon')
    expect(commonStyles).toContain('.v-combobox__menu-icon')
    expect(commonStyles).not.toContain('app-responsive-input--keep-append-action')
  })
})
