import type { Plugin } from '@/api/types'
import PluginAppCard from '@/components/cards/PluginAppCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCardAccentColor', () => ({
  getCardAccentRgbFromImage: vi.fn().mockResolvedValue('40, 169, 225'),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试市场卡片评分',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  installed: false,
}

describe('PluginAppCard rating badge', () => {
  it('shows the top-right score only after the plugin has ratings', async () => {
    const unrated = await renderWithProviders(PluginAppCard, {
      props: { plugin: { ...plugin, average_rating: 0, rating_count: 0 } },
    })
    expect(unrated.container.querySelector('.plugin-app-card__rating')).toBeNull()
    expect(unrated.container.querySelector('.plugin-app-card__title--with-rating')).toBeNull()
    unrated.unmount()

    const rated = await renderWithProviders(PluginAppCard, {
      props: { plugin: { ...plugin, average_rating: 4.3, rating_count: 12 } },
    })
    const badge = rated.container.querySelector('.plugin-app-card__rating')
    expect(badge).toHaveTextContent('4.3')
    expect(rated.container.querySelector('.plugin-app-card__title--with-rating')).not.toBeNull()
  })
})
