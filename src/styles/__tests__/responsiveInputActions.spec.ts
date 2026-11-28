import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('mobile responsive input actions', () => {
  it('keeps functional trailing controls without restoring decorative icons', () => {
    const responsiveInputStyles = readFileSync(resolve(cwd(), 'src/styles/_responsive-input.scss'), 'utf8')
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')

    expect(commonStyles).toContain('@include mp-responsive-input.responsive-input;')
    expect(responsiveInputStyles).toMatch(
      /\.app-responsive-input__native \.v-field__clearable,\s*\.app-responsive-input__native\s+\.v-field__append-inner:has\([\s\S]*?\)\s*\{\s*display: inline-flex;/,
    )
    expect(responsiveInputStyles).toContain("[role='button']:not(")
    expect(responsiveInputStyles).toContain('.v-select__menu-icon')
    expect(responsiveInputStyles).toContain('.v-autocomplete__menu-icon')
    expect(responsiveInputStyles).toContain('.v-combobox__menu-icon')
    expect(responsiveInputStyles).not.toContain('app-responsive-input--keep-append-action')
  })
})
