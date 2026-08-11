import { isMusicMediaSource, isValidMediaSourceId } from '@/utils/mediaId'
import { describe, expect, it } from 'vitest'

describe('media source identity utils', () => {
  it.each(['musicbrainz', 'theaudiodb', 'doubanmusic'] as const)('recognizes %s as a music source', source => {
    expect(isMusicMediaSource(source)).toBe(true)
  })

  it('uses UUIDs for MusicBrainz and numeric IDs for alternate music sources', () => {
    expect(isValidMediaSourceId('977e6978-139d-425c-bb98-6b0c62d1e45e', 'musicbrainz')).toBe(true)
    expect(isValidMediaSourceId('32793500', 'theaudiodb')).toBe(true)
    expect(isValidMediaSourceId('1401853', 'doubanmusic')).toBe(true)
    expect(isValidMediaSourceId('1401853:3', 'doubanmusic')).toBe(true)
    expect(isValidMediaSourceId('1401853:track', 'doubanmusic')).toBe(false)
    expect(isValidMediaSourceId('not-a-number', 'theaudiodb')).toBe(false)
  })
})
