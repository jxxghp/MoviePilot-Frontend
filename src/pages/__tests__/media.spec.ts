import MediaPage from '@/pages/media.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const MediaDetailViewStub = defineComponent({
  name: 'MediaDetailView',
  props: {
    mediaId: String,
    mediaSource: String,
    title: String,
    type: String,
    year: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': '媒体详情参数' }, JSON.stringify(props))
  },
})

async function renderPage(query: Record<string, string | string[] | null>) {
  return renderWithProviders(MediaPage, {
    initialRoute: { path: '/media', query },
    global: {
      stubs: {
        MediaDetailView: MediaDetailViewStub,
      },
    },
  })
}

function projectedProps() {
  return JSON.parse(screen.getByRole('status', { name: '媒体详情参数' }).textContent || '{}') as Record<string, unknown>
}

describe('media page', () => {
  it('projects route query values as strings to the detail view', async () => {
    await renderPage({
      media_id: ['101', 'ignored'],
      media_source: 'themoviedb',
      title: '测试电影',
      type: '电影',
      year: '2026',
    })

    expect(projectedProps()).toEqual({
      mediaId: '101,ignored',
      mediaSource: 'themoviedb',
      title: '测试电影',
      type: '电影',
      year: '2026',
    })
  })

  it('keeps missing query values undefined', async () => {
    await renderPage({})

    expect(projectedProps()).toEqual({})
  })

  it('keeps a plugin media source at the route boundary', async () => {
    await renderPage({ media_id: '101', media_source: 'custom-source', type: '电影' })

    expect(projectedProps()).toEqual({ mediaId: '101', mediaSource: 'custom-source', type: '电影' })
  })
})
