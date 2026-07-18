import SitePage from '@/pages/site.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const SiteCardListViewStub = defineComponent({
  name: 'SiteCardListView',
  setup: () => () => h('section', { 'aria-label': '站点列表视图' }, '站点列表'),
})

describe('site page', () => {
  it('renders the site list view as the page content', async () => {
    await renderWithProviders(SitePage, {
      initialRoute: '/site',
      global: {
        stubs: { SiteCardListView: SiteCardListViewStub },
      },
    })

    expect(screen.getByRole('region', { name: '站点列表视图' })).toBeInTheDocument()
  })
})
