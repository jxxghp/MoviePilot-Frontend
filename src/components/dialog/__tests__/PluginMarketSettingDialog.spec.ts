import { readFileSync } from 'node:fs'
import { cwd } from 'node:process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync(resolve(cwd(), 'src/components/dialog/PluginMarketSettingDialog.vue'), 'utf8')

function getStyleRule(selector: string) {
  const ruleStart = dialogSource.indexOf(`${selector} {`)
  const ruleEnd = dialogSource.indexOf('\n}', ruleStart)

  expect(ruleStart).toBeGreaterThanOrEqual(0)
  expect(ruleEnd).toBeGreaterThan(ruleStart)

  return dialogSource.slice(ruleStart, ruleEnd)
}

describe('PluginMarketSettingDialog theme surfaces', () => {
  it('uses shared theme tokens for the view switch and editor containers', () => {
    const modeSwitchRule = getStyleRule('.plugin-market-mode-switch')
    const listWrapRule = getStyleRule('.plugin-market-list-wrap')
    const textareaRule = getStyleRule('.plugin-market-textarea-field')

    expect(modeSwitchRule).toContain('border: var(--app-grouped-list-border)')
    expect(modeSwitchRule).toContain('backdrop-filter: var(--app-grouped-list-backdrop-filter)')
    expect(modeSwitchRule).toContain('background: var(--app-grouped-list-background)')
    expect(dialogSource).toContain('background: var(--app-grouped-list-hover-background)')
    expect(dialogSource).toContain('background: var(--app-grouped-list-active-background)')
    expect(listWrapRule).toContain('border-radius: var(--app-grouped-list-radius)')
    expect(listWrapRule).toContain('background: var(--app-grouped-list-background)')
    expect(textareaRule).toContain('background: var(--app-grouped-list-background)')
  })

  it('uses plugin-source wording instead of exposing the Wiki implementation detail', () => {
    expect(dialogSource).toContain("t('dialog.pluginMarketSetting.syncSources')")
    expect(dialogSource).not.toContain("t('dialog.pluginMarketSetting.syncWiki')")
  })
})
