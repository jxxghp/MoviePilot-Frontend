import PersonDetailView from '@/views/discover/PersonDetailView.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

const MediaCardListViewStub = defineComponent({
  name: 'MediaCardListView',
  props: {
    apipath: String,
  },
  setup(props) {
    return () => h('output', { 'aria-label': '人物作品', 'data-api-path': props.apipath })
  },
})

describe('PersonDetailView', () => {
  beforeEach(() => {
    mocks.apiGet.mockResolvedValue({
      id: 95075,
      source: 'anilist',
      name: '种崎敦美',
      original_name: 'Atsumi Tanezaki',
      images: { large: 'https://img.example/actor.jpg' },
      biography: '日本声优',
      birthday: '1990-09-27',
      place_of_birth: '大分县',
      also_known_as: ['Atsumi Tanezaki'],
    })
  })

  it('loads AniList staff detail and links to the AniList filmography endpoint', async () => {
    await renderWithProviders(PersonDetailView, {
      props: {
        personid: '95075',
        source: 'anilist',
      },
      global: {
        stubs: {
          MediaCardListView: MediaCardListViewStub,
          VImg: defineComponent({
            props: { src: String },
            setup: props => () => h('img', { src: props.src }),
          }),
        },
      },
    })

    expect(await screen.findByRole('heading', { name: '种崎敦美' })).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('anilist/person/95075')
    await waitFor(() => {
      expect(screen.getByLabelText('人物作品')).toHaveAttribute('data-api-path', 'anilist/person/credits/95075')
    })
    expect(screen.getByRole('link', { name: /参演作品/ })).toHaveAttribute(
      'href',
      '/browse/anilist/person/credits/95075?title=参演作品',
    )
  })

  it('safely renders the AniList biography as Markdown', async () => {
    mocks.apiGet.mockResolvedValue({
      id: 95075,
      source: 'anilist',
      name: '种崎敦美',
      biography: '**日本声优**\n\n[官方网站](https://example.com)\n\n<script>alert(1)</script>',
    })

    const { container } = await renderWithProviders(PersonDetailView, {
      props: {
        personid: '95075',
        source: 'anilist',
      },
      global: {
        stubs: {
          MediaCardListView: MediaCardListViewStub,
        },
      },
    })

    expect(await screen.findByText('日本声优')).toHaveProperty('tagName', 'STRONG')
    expect(screen.getByRole('link', { name: '官方网站' })).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByRole('link', { name: '官方网站' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('.person-biography script')).not.toBeInTheDocument()
  })
})
