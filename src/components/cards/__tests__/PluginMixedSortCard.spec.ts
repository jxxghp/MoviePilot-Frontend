import type { Plugin, PluginSourceTransition } from '@/api/types'
import PluginMixedSortCard from '@/components/cards/PluginMixedSortCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/cards/PluginCard.vue', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'PluginCardStub',
      props: {
        plugin: { type: Object, required: true },
      },
      emits: ['source-transition'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              onClick: () =>
                emit('source-transition', props.plugin, {
                  action: 'change',
                  expected_revision: 7,
                  repo_url: 'https://github.com/example/target',
                }),
              type: 'button',
            },
            '更换仓库',
          )
      },
    }),
  }
})

const plugin: Plugin = {
  id: 'DemoPlugin',
  installed: true,
  plugin_author: 'MoviePilot',
  plugin_name: '演示插件',
  plugin_version: '1.0.0',
}

const transition: PluginSourceTransition = {
  action: 'change',
  expected_revision: 7,
  repo_url: 'https://github.com/example/target',
}

describe('PluginMixedSortCard', () => {
  it('forwards repository transitions from the plugin card', async () => {
    const { emitted } = await renderWithProviders(PluginMixedSortCard, {
      props: {
        item: {
          data: plugin,
          id: plugin.id,
          order: 0,
          type: 'plugin',
        },
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: '更换仓库' }))

    expect(emitted().sourceTransition).toContainEqual([plugin, transition])
  })
})
