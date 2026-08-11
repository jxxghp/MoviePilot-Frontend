import MusicRecognitionCachePanel from '@/components/cache/MusicRecognitionCachePanel.vue'
import type { MusicRecognitionCacheItem } from '@/api/types'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

const cacheKey = '[音乐]晴天-周杰伦-叶惠美-2003'

const musicItems: MusicRecognitionCacheItem[] = [
  {
    key: cacheKey,
    media_id: 'rec-1',
    title: '晴天',
    artists: ['周杰伦'],
    album: '叶惠美',
    year: 2003,
    music_type: 'recording',
    cover_url: '',
  },
  {
    key: '[音乐]未知曲目--None-None',
    media_id: '',
    title: '未知曲目',
    artists: [],
    album: '',
    year: '',
    music_type: 'recording',
    cover_url: '',
  },
]

interface MusicPanelProps {
  items?: MusicRecognitionCacheItem[]
  loading?: boolean
  selectedItems?: string[]
}

function renderMusicPanel(props: MusicPanelProps = {}) {
  return renderWithProviders(MusicRecognitionCachePanel, {
    props: {
      items: musicItems,
      loading: false,
      selectedItems: [],
      ...props,
    },
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          RECOGNIZE_SOURCE: 'musicbrainz',
          TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        },
      },
    },
  })
}

describe('MusicRecognitionCachePanel table section', () => {
  it('renders music cache items provided through props', async () => {
    await renderMusicPanel()

    expect(await screen.findByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('周杰伦')).toBeInTheDocument()
    expect(screen.getByText('未知曲目')).toBeInTheDocument()
    expect(screen.getByText('MusicBrainz ID')).toBeInTheDocument()
    expect(screen.getByText('已识别')).toBeInTheDocument()
    expect(screen.getByText('未识别')).toBeInTheDocument()
  })

  it('shows empty hint when no items are provided', async () => {
    await renderMusicPanel({ items: [] })

    expect(await screen.findByText('暂无 MusicBrainz 识别缓存')).toBeInTheDocument()
  })

  it('emits delete with the cache key when a row delete button is clicked', async () => {
    const { emitted } = await renderMusicPanel()
    await screen.findByText('晴天')

    const user = userEvent.setup()
    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    await user.click(deleteButtons[0])

    expect(emitted('delete')).toBeTruthy()
    expect(emitted('delete')?.[0]).toEqual([cacheKey])
  })
})
