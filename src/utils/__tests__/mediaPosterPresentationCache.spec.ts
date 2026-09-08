import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearMediaPosterPresentationCache,
  forgetMediaPosterReveal,
  rememberMediaPosterReveal,
  wasMediaPosterRevealed,
} from '../mediaPosterPresentationCache'

describe('media poster presentation cache', () => {
  beforeEach(clearMediaPosterPresentationCache)

  it('records only explicitly completed nonempty sources', () => {
    expect(wasMediaPosterRevealed('/poster.jpg')).toBe(false)
    rememberMediaPosterReveal('')
    expect(wasMediaPosterRevealed('')).toBe(false)
    rememberMediaPosterReveal('/poster.jpg')
    expect(wasMediaPosterRevealed('/poster.jpg')).toBe(true)
    expect(wasMediaPosterRevealed('/other.jpg')).toBe(false)
  })

  it('forgets a failed source without changing other sources', () => {
    rememberMediaPosterReveal('/a.jpg')
    rememberMediaPosterReveal('/b.jpg')
    forgetMediaPosterReveal('/a.jpg')
    expect(wasMediaPosterRevealed('/a.jpg')).toBe(false)
    expect(wasMediaPosterRevealed('/b.jpg')).toBe(true)
  })

  it('bounds the retained metadata and keeps recently reused sources', () => {
    for (let i = 0; i < 512; i++) rememberMediaPosterReveal(`/poster-${i}.jpg`)
    expect(wasMediaPosterRevealed('/poster-0.jpg')).toBe(true)
    rememberMediaPosterReveal('/poster-512.jpg')
    expect(wasMediaPosterRevealed('/poster-1.jpg')).toBe(false)
    expect(wasMediaPosterRevealed('/poster-0.jpg')).toBe(true)
    clearMediaPosterPresentationCache()
    expect(wasMediaPosterRevealed('/poster-0.jpg')).toBe(false)
  })
})
