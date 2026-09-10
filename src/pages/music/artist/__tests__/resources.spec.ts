import MusicArtistResourcesPage from '@/pages/music/artist/resources.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

const inLibraryAlbum = {
  media_source: 'musicbrainz',
  media_id: 'album-1',
  music_type: 'album',
  type: '音乐',
  title: 'Already Here',
  artists: ['Artist'],
  album_type: 'Album',
  year: 2001,
  release_date: '2001-01-01',
}
const downloadableAlbum = {
  media_source: 'musicbrainz',
  media_id: 'album-2',
  music_type: 'album',
  type: '音乐',
  title: 'Need This',
  artists: ['Artist'],
  album_type: 'Album',
  year: 2002,
  release_date: '2002-01-01',
}
const candidateAlbum = {
  media_source: 'musicbrainz',
  media_id: 'album-3',
  music_type: 'album',
  type: '音乐',
  title: 'Needs Review',
  artists: ['Artist'],
  album_type: 'Album',
  year: 2003,
  release_date: '2003-01-01',
}

const collectionResource = {
  meta_info: { type: '音乐', title: 'Artist' },
  torrent_info: {
    site: 14,
    site_name: 'Music PT',
    title: 'Artist [2001-2003] Complete Discography FLAC',
    description: 'Complete studio album collection',
    enclosure: 'https://example.com/collection.torrent',
    category: '音乐',
    seeders: 12,
    size: 1024,
  },
}

function exactResource(title: string) {
  return {
    match_status: 'exact',
    meta_info: { type: '音乐', title },
    media_info: { type: '音乐', music_type: 'album', title },
    torrent_info: { title: `${title} FLAC`, category: '音乐', size: 1 },
  }
}

describe('music artist discography resources', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.confirm.mockReset()
    mocks.confirm.mockResolvedValue(true)
    mocks.apiGet.mockImplementation((path: string, config?: { params?: { album_type?: string } }) => {
      if (path.includes('/albums')) {
        return Promise.resolve(
          config?.params?.album_type === 'album' ? [inLibraryAlbum, downloadableAlbum, candidateAlbum] : [],
        )
      }
      if (path === 'search/title') return Promise.resolve([collectionResource])
      if (path === 'search/media/album-1') return Promise.resolve([exactResource('Already Here')])
      if (path === 'search/media/album-2') return Promise.resolve([exactResource('Need This')])
      if (path === 'search/media/album-3') {
        return Promise.resolve([{ ...exactResource('Needs Review'), match_status: 'candidate' }])
      }
      return Promise.resolve([])
    })
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === 'music/library/status') {
        return Promise.resolve([
          { media_source: 'musicbrainz', media_id: 'album-1', exists: true },
          { media_source: 'musicbrainz', media_id: 'album-2', exists: false },
          { media_source: 'musicbrainz', media_id: 'album-3', exists: false },
        ])
      }
      return Promise.resolve(null)
    })
  })

  it('marks existing releases and only preselects exact missing releases', async () => {
    await renderWithProviders(MusicArtistResourcesPage, {
      initialRoute: '/music/artist/resources?artist=Artist&artist_id=artist-1&media_source=musicbrainz&sites=14',
    })

    expect(await screen.findByText('Already Here')).toBeInTheDocument()
    expect(await screen.findByText('Need This')).toBeInTheDocument()
    expect(await screen.findByText('Needs Review')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('已入库').length).toBeGreaterThan(0))

    const existingCheckbox = screen.getByRole('checkbox', { name: '选择专辑 Already Here' })
    const downloadableCheckbox = screen.getByRole('checkbox', { name: '选择专辑 Need This' })
    const candidateCheckbox = screen.getByRole('checkbox', { name: '选择专辑 Needs Review' })
    expect(existingCheckbox).toBeDisabled()
    expect(existingCheckbox).not.toBeChecked()
    expect(downloadableCheckbox).toBeChecked()
    expect(candidateCheckbox).toBeDisabled()
    expect(candidateCheckbox).not.toBeChecked()

    await fireEvent.click(screen.getByRole('button', { name: /\u6279\u91cf\u4e0b\u8f7d \(1\)/ }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'download/',
        expect.objectContaining({ media_in: expect.objectContaining({ media_id: 'album-2' }) }),
        { feedback: 'silent' },
      ),
    )
    expect(mocks.apiPost).not.toHaveBeenCalledWith(
      'download/',
      expect.objectContaining({ media_in: expect.objectContaining({ media_id: 'album-1' }) }),
      expect.anything(),
    )
  })

  it('offers one artist collection download and assigns the dedicated source category', async () => {
    await renderWithProviders(MusicArtistResourcesPage, {
      initialRoute: '/music/artist/resources?artist=Artist&artist_id=artist-1&media_source=musicbrainz&sites=14',
    })

    expect(await screen.findByText('Artist [2001-2003] Complete Discography FLAC')).toBeInTheDocument()
    expect(screen.getByText('预计覆盖 3/3 个官方作品')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '下载大合集' }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'download/artist-collection',
        expect.objectContaining({
          artist_name: 'Artist',
          artist_id: 'artist-1',
          media_source: 'musicbrainz',
          torrent_in: collectionResource.torrent_info,
        }),
        { feedback: 'silent' },
      ),
    )
  })
})
