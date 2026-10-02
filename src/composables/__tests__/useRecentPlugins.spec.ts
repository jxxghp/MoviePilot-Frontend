import { useRecentPlugins } from '@/composables/useRecentPlugins'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useRecentPlugins pinned plugins', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adds newly pinned plugins first and removes them when toggled again', () => {
    const { getPinnedPluginIds, togglePinnedPlugin } = useRecentPlugins()

    expect(togglePinnedPlugin('plugin-a')).toEqual(['plugin-a'])
    expect(togglePinnedPlugin('plugin-b')).toEqual(['plugin-b', 'plugin-a'])
    expect(getPinnedPluginIds()).toEqual(['plugin-b', 'plugin-a'])

    expect(togglePinnedPlugin('plugin-b')).toEqual(['plugin-a'])
    expect(getPinnedPluginIds()).toEqual(['plugin-a'])
  })

  it('keeps at most six pinned plugin IDs', () => {
    const { getPinnedPluginIds, togglePinnedPlugin } = useRecentPlugins()

    for (let index = 1; index <= 7; index += 1) {
      togglePinnedPlugin(`plugin-${index}`)
    }

    expect(getPinnedPluginIds()).toEqual(['plugin-7', 'plugin-6', 'plugin-5', 'plugin-4', 'plugin-3', 'plugin-2'])
  })

  it('ignores malformed pinned storage values', () => {
    localStorage.setItem('moviepilot_pinned_plugins', JSON.stringify(['plugin-a', null, 3, '']))

    expect(useRecentPlugins().getPinnedPluginIds()).toEqual(['plugin-a'])
  })
})
