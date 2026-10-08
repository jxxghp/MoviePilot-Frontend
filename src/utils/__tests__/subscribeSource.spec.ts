import {
  collectSubscribeSourceNames,
  emptySubscribeSourceDirectory,
  getSubscribeSourceColor,
  SELF_SOURCE_COLOR,
  resolveSubscribeSource,
  shouldShowSubscribeSource,
} from '@/utils/subscribeSource'
import { describe, expect, it } from 'vitest'

describe('subscribeSource', () => {
  it('counts distinct trimmed names and ignores empty names', () => {
    const names = collectSubscribeSourceNames([{ username: 'tester' }, { username: ' tester ' }, { username: '' }])

    expect([...names]).toEqual(['tester'])
    expect(shouldShowSubscribeSource(names)).toBe(false)
    expect(shouldShowSubscribeSource(new Set(['tester', 'mom']))).toBe(true)
  })

  it('classifies accounts, installed plugins and external names', () => {
    const directory = emptySubscribeSourceDirectory()
    directory.users.set('mom', { nickname: '妈妈', avatar: 'data:image/png;base64,AA==' })
    directory.users.set('kid', { nickname: ' ', avatar: '' })
    directory.plugins.set('订阅助手增强', './plugin_icon/assistant.png')
    directory.plugins.set('无图标插件', undefined)

    expect(resolveSubscribeSource('mom', directory)).toMatchObject({
      kind: 'user',
      label: '妈妈',
      image: 'data:image/png;base64,AA==',
      initial: '妈',
    })
    // 昵称为空时回退账号名，没有头像时不返回空字符串头像
    expect(resolveSubscribeSource('kid', directory)).toMatchObject({ kind: 'user', label: 'kid', initial: 'K' })
    expect(resolveSubscribeSource('kid', directory)?.image).toBeUndefined()
    expect(resolveSubscribeSource('订阅助手增强', directory)).toMatchObject({
      kind: 'plugin',
      label: '订阅助手增强',
      image: './plugin_icon/assistant.png',
    })
    expect(resolveSubscribeSource('无图标插件', directory)).toMatchObject({ kind: 'plugin' })
    expect(resolveSubscribeSource('无图标插件', directory)?.image).toBeUndefined()
    expect(resolveSubscribeSource('Seerr', directory)).toMatchObject({ kind: 'other', label: 'Seerr', initial: 'S' })
    expect(resolveSubscribeSource('  ', directory)).toBeNull()
  })

  it('uses the theme color for the signed-in user only', () => {
    const directory = emptySubscribeSourceDirectory()
    directory.users.set('tester', {})

    expect(resolveSubscribeSource('tester', directory, 'tester')?.color).toBe(SELF_SOURCE_COLOR)
    expect(resolveSubscribeSource('mom', directory, 'tester')?.color).toBe(getSubscribeSourceColor('mom'))
  })

  it('keeps one color per name and splits initials by code point', () => {
    expect(getSubscribeSourceColor('mom')).toBe(getSubscribeSourceColor('mom'))
    expect(getSubscribeSourceColor('mom')).toMatch(/^hsl\(\d+ 52% 48%\)$/)
    expect(resolveSubscribeSource('🎬bot', emptySubscribeSourceDirectory())?.initial).toBe('🎬')
  })
})
