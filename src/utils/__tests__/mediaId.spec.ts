import {
  isMusicMediaSource,
  isValidMediaSourceId,
  parseMediaDataSources,
  setMediaSourceCatalog,
  supportsMediaSourceType,
} from '@/utils/mediaId'
import { describe, expect, it } from 'vitest'

describe('media source identity utils', () => {
  it.each(['musicbrainz', 'theaudiodb', 'doubanmusic'] as const)('recognizes %s as a music source', source => {
    expect(isMusicMediaSource(source)).toBe(true)
  })

  it('recognizes a plugin-registered music source', () => {
    setMediaSourceCatalog([
      {
        name: 'Acme Music',
        media_source: 'acme.music',
        media_types: ['音乐'],
      },
    ])
    expect(isMusicMediaSource('acme.music')).toBe(true)
    setMediaSourceCatalog([])
  })

  it('keeps a source with mixed video and music capabilities in both lists', () => {
    const source = {
      media_types: ['电影', '电视剧', '音乐'],
    }
    expect(supportsMediaSourceType(source, 'media')).toBe(true)
    expect(supportsMediaSourceType(source, 'music')).toBe(true)
  })

  it('accepts API-style media type keys for plugin sources', () => {
    expect(supportsMediaSourceType({ media_types: ['movie', 'music'] }, 'media')).toBe(true)
    expect(supportsMediaSourceType({ media_types: ['movie', 'music'] }, 'music')).toBe(true)
  })

  it.each([
    ['themoviedb', ['themoviedb']],
    [' musicbrainz, theaudiodb,unknown,musicbrainz ', ['musicbrainz', 'theaudiodb', 'unknown']],
    [' Acme.Video,invalid:source,acme.video ', ['acme.video']],
    [
      ['douban', 'anilist,bangumi', null, 'douban'],
      ['douban', 'anilist', 'bangumi'],
    ],
    [undefined, []],
  ])('normalizes route media sources from %j', (value, expected) => {
    expect(parseMediaDataSources(value)).toEqual(expected)
  })

  it('validates source-specific IDs without assuming every provider uses numeric IDs', () => {
    expect(isValidMediaSourceId('', 'themoviedb')).toBe(true)
    expect(isValidMediaSourceId('   ', 'douban')).toBe(true)
    expect(isValidMediaSourceId(0, 'themoviedb')).toBe(false)
    expect(isValidMediaSourceId('0', 'bilibili')).toBe(false)
    expect(isValidMediaSourceId('977e6978-139d-425c-bb98-6b0c62d1e45e', 'musicbrainz')).toBe(true)
    expect(isValidMediaSourceId('not-a-uuid', 'musicbrainz')).toBe(false)
    expect(isValidMediaSourceId('32793500', 'theaudiodb')).toBe(true)
    expect(isValidMediaSourceId('1401853', 'doubanmusic')).toBe(true)
    expect(isValidMediaSourceId('1401853:3', 'doubanmusic')).toBe(true)
    expect(isValidMediaSourceId('1401853:track', 'doubanmusic')).toBe(false)
    expect(isValidMediaSourceId('album-32793500', 'theaudiodb')).toBe(true)
    expect(isValidMediaSourceId('tt0111161', 'imdb')).toBe(true)
    expect(isValidMediaSourceId('0111161', 'imdb')).toBe(false)
    expect(isValidMediaSourceId('BV1xx411c7mD', 'bilibili')).toBe(true)
  })
})
