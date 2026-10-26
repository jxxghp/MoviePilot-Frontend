import { createI18n } from 'vue-i18n'
import zhCN from '@/locales/zh-CN'
import zhTW from '@/locales/zh-TW'
import enUS from '@/locales/en-US'
import cnSource from '@/locales/zh-CN?raw'
import twSource from '@/locales/zh-TW?raw'
import enSource from '@/locales/en-US?raw'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** 枚举真实字典的叶键，避免将生产消息编译后的内部 AST 当作语言命名空间。 */
function keys(source: string): string[] {
  const file = ts.createSourceFile('locale.ts', source, ts.ScriptTarget.Latest, true)
  const exported = file.statements.find(ts.isExportAssignment)
  if (!exported || !ts.isObjectLiteralExpression(exported.expression)) throw new Error('Missing locale dictionary')
  const result: string[] = []
  function visit(object: ts.ObjectLiteralExpression, prefix: string) {
    for (const property of object.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name))
      ) {
        throw new Error('Unsupported locale property')
      }
      const key = `${prefix}${property.name.text}`
      if (ts.isObjectLiteralExpression(property.initializer)) visit(property.initializer, `${key}.`)
      else result.push(key)
    }
  }
  visit(exported.expression, '')
  return result.sort()
}

describe('语言字典与界面消费契约', () => {
  it.each([
    ['zh-TW', twSource],
    ['en-US', enSource],
  ])('%s 覆盖全部中文叶键且无错放命名空间', (_locale, source) => {
    expect(keys(source)).toEqual(keys(cnSource))
  })

  it.each([
    ['zh-CN', zhCN],
    ['zh-TW', zhTW],
    ['en-US', enUS],
  ] as const)('%s 保留帮助中的字面量并提供实际使用的占位文案', (locale, messages) => {
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: false, messages: { [locale]: messages } })
    expect(i18n.global.t('setting.words.customizationDesc')).toContain('{customization}')
    expect(i18n.global.t('dialog.reorganize.episodeFormatPlaceholder')).toContain('{ep}')
    expect(i18n.global.t('dialog.reorganize.episodeFormatHint')).toContain('{ep}')
    for (const key of [
      'notification.slack.oauthTokenPlaceholder',
      'notification.slack.appTokenPlaceholder',
      'notification.slack.channelPlaceholder',
      'notification.vocechat.channelIdPlaceholder',
    ]) {
      expect(i18n.global.te(key)).toBe(true)
      expect(i18n.global.t(key)).not.toBe(key)
    }
  })

  it('英文仪表盘速度标签无需回退到中文', () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', fallbackLocale: false, messages: { 'en-US': enUS } })
    expect(i18n.global.t('dashboard.uploadSpeed')).toBe('Upload speed')
    expect(i18n.global.t('dashboard.downloadSpeed')).toBe('Download speed')
  })
})
