import { getNameTail } from '@/components/filebrowser/tailEllipsis'
import { describe, expect, it } from 'vitest'

describe('getNameTail', () => {
  it('keeps the last two dot segments so subtitles and release groups stay distinguishable', () => {
    expect(getNameTail('Show.S01E01.1080p.WEB-DL.chs&eng.ass')).toBe('.chs&eng.ass')
    expect(getNameTail('Show.S01E01.2160p.WEB-DL.H265-GROUP.mkv')).toBe('.H265-GROUP.mkv')
  })

  it('does not split a decimal number such as an audio channel layout', () => {
    expect(getNameTail('Movie.2023.2160p.DTS-HD.MA.5.1-GROUP.mkv')).toBe('.5.1-GROUP.mkv')
    expect(getNameTail('Show.S01E238.2160p.WEB-DL.H.265.AAC2.0-HHWEB.mp4')).toBe('.AAC2.0-HHWEB.mp4')
  })

  it('falls back to the extension alone when the two-segment tail would be too long', () => {
    expect(getNameTail('Show.S01E01.WEB-DL.H265.AAC-ADWebGroupName.mkv')).toBe('.mkv')
  })

  it('returns no tail for names without a usable extension', () => {
    expect(getNameTail('README')).toBe('')
    expect(getNameTail('.gitignore')).toBe('')
    expect(getNameTail('archive.averyveryverylongextension')).toBe('')
  })
})
