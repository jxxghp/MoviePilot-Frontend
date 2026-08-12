import {
  buildMusicAlbumRoute,
  buildMusicArtistRoute,
  buildMusicDetailRoute,
  buildMusicResourceRoute,
  formatMusicDuration,
  getMusicArtistLinks,
  getMusicArtistSubtitle,
  getMusicKey,
} from '@/utils/music'
import { describe, expect, it } from 'vitest'

describe('music utils', () => {
  it('routes a recording to the music detail page', () => {
    expect(buildMusicDetailRoute({ media_source: 'musicbrainz', media_id: 'recording-1', title: '晴天' })).toEqual({
      path: '/music/detail',
      query: { media_source: 'musicbrainz', media_id: 'recording-1', title: '晴天' },
    })
  })

  it('routes an album entity to the album page', () => {
    expect(
      buildMusicDetailRoute({
        media_source: 'musicbrainz',
        media_id: 'release-group-1',
        music_type: 'album',
        title: '叶惠美',
      }),
    ).toEqual({
      path: '/music/album',
      query: { media_source: 'musicbrainz', media_id: 'release-group-1', title: '叶惠美' },
    })
  })

  it('routes an artist entity to the artist page', () => {
    expect(
      buildMusicDetailRoute({
        media_source: 'musicbrainz',
        media_id: 'artist-1',
        music_type: 'artist',
        name: 'Queen',
      }),
    ).toEqual({
      path: '/music/artist',
      query: { media_source: 'musicbrainz', media_id: 'artist-1', title: 'Queen' },
    })
  })

  it('falls back to the search page without a standard identity', () => {
    expect(buildMusicDetailRoute({ title: '晴天' })).toEqual({
      path: '/music',
      query: { query: '晴天' },
    })
  })

  it('builds album and artist routes with an explicit source', () => {
    expect(buildMusicAlbumRoute('release-group-1', '叶惠美', 'musicbrainz')).toEqual({
      path: '/music/album',
      query: { media_source: 'musicbrainz', media_id: 'release-group-1', title: '叶惠美' },
    })
    expect(buildMusicArtistRoute('artist-1', 'Queen', 'musicbrainz')).toEqual({
      path: '/music/artist',
      query: { media_source: 'musicbrainz', media_id: 'artist-1', title: 'Queen' },
    })
  })

  it('builds the site resource route from the metadata identity', () => {
    expect(
      buildMusicResourceRoute(
        {
          media_source: 'musicbrainz',
          media_id: 'recording-1',
          title: '晴天',
          year: '2003',
        } as never,
        [11, 12],
      ),
    ).toMatchObject({
      path: '/resource',
      query: {
        media_id: 'recording-1',
        media_source: 'musicbrainz',
        music_type: 'recording',
        sites: '11,12',
        type: '音乐',
      },
    })
  })

  it('does not build a resource route for an artist browsing entity', () => {
    expect(
      buildMusicResourceRoute({
        media_source: 'musicbrainz',
        media_id: 'artist-1',
        music_type: 'artist',
        title: 'Queen',
      } as never),
    ).toBeUndefined()
  })

  it('keeps the entity type inside the list key so albums and tracks never collide', () => {
    const track = getMusicKey({ media_source: 'musicbrainz', media_id: 'same-id' })
    const album = getMusicKey({ media_source: 'musicbrainz', media_id: 'same-id', music_type: 'album' })

    expect(track).not.toEqual(album)
  })

  it('pairs artist names with their standard ids by position', () => {
    expect(getMusicArtistLinks({ artists: ['A', 'B'], artist_ids: ['', 'artist-b'] })).toEqual([
      { name: 'A' },
      { name: 'B', id: 'artist-b' },
    ])
  })

  it('falls back to the joined artist text when the list is missing', () => {
    expect(getMusicArtistLinks({ artist: 'A / B' })).toEqual([{ name: 'A / B' }])
  })

  it('formats durations with and without hours', () => {
    expect(formatMusicDuration(269)).toBe('4:29')
    expect(formatMusicDuration(5)).toBe('0:05')
    expect(formatMusicDuration(3725)).toBe('1:02:05')
    expect(formatMusicDuration(undefined)).toBe('')
  })

  it('joins the artist relation, type and disambiguation into a subtitle', () => {
    expect(
      getMusicArtistSubtitle({
        relation: 'member of band',
        artist_type: 'Person',
        disambiguation: 'guitarist',
      }),
    ).toBe('member of band · Person · guitarist')
  })
})
