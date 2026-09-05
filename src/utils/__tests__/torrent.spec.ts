import type { Context } from '@/api/types'
import { buildTorrentDownloadProps, getTorrentTitle } from '@/utils/torrent'
import { describe, expect, it } from 'vitest'

/** 构造携带旧目标信息的未确认音乐缓存，验证下载边界不会采信它。 */
function candidate(): Context {
  return {
    match_status: 'candidate',
    match_reason: 'artist_unverified',
    meta_info: { type: '音乐', title: '晴天', name: '叶惠美', album: '叶惠美' },
    media_info: {
      type: '音乐',
      title: '旧目标',
      title_year: '旧目标 (2003)',
      media_id: 'target',
      media_source: 'musicbrainz',
    },
    torrent_info: {
      title: 'Jay Chou - 晴天 FLAC',
      category: '音乐',
      media_id: 'source-hint',
      media_source: 'musicbrainz',
    },
  } as Context
}

describe('torrent presentation and manual confirmation', () => {
  it('keeps resource title and removes unverified identities without changing the cache', () => {
    const context = candidate()
    expect(getTorrentTitle(context)).toBe('晴天')
    const props = buildTorrentDownloadProps(context, 'album')
    expect(props.title).toBe('晴天')
    expect(props.media).toBeUndefined()
    expect(props.torrent?.media_id).toBeUndefined()
    expect(props.torrent?.media_source).toBeUndefined()
    expect(props.musicType).toBe('album')
    expect(context.torrent_info.media_id).toBe('source-hint')
    expect(context.media_info.media_id).toBe('target')
  })

  it('keeps related albums distinct from partial album tracks', () => {
    const context = candidate()
    context.match_reason = 'related_album'
    expect(buildTorrentDownloadProps(context, 'recording').musicType).toBe('album')
    context.match_reason = 'partial_album'
    expect(buildTorrentDownloadProps(context, 'album').musicType).toBe('recording')
  })

  it('preserves the selected identity for confirmed resources', () => {
    const context = candidate()
    context.match_status = 'exact'
    const props = buildTorrentDownloadProps(context)
    expect(props.title).toBe('旧目标 (2003)')
    expect(props.media).toBe(context.media_info)
    expect(props.torrent).toBe(context.torrent_info)
  })
})
