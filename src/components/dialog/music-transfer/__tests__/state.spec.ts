import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import type { ManualTransferPayload, ManualTransferPreviewData, ManualTransferPreviewItem } from '@/api/types'
import {
  canCorrectMusicGroup,
  groupMusicPreview,
  previewFileScope,
  replaceMusicGroup,
  useMusicTransferCorrection,
} from '../state'

/** 构造来自后端实际范围的文件投影，独立发行可以共享父目录。 */
function row(group: string, path: string, storage = 'local'): ManualTransferPreviewItem {
  return {
    source: path,
    source_storage: storage,
    source_item: { path, storage, name: path, type: 'file' },
    success: true,
    music: {
      status: 'local_tags',
      online_confirmed: false,
      artists: ['Artist'],
      album: 'Same name',
      field_sources: {},
      candidates: [],
      read_status: 'tags',
      file_role: 'audio',
      group_id: group,
      group_directory: '/music',
    },
  }
}

/** 构造后端识别出的歌词或封面配套项。 */
function companion(group: string, path: string, storage = 'local'): ManualTransferPreviewItem {
  const item = row(group, path, storage)
  item.music = { ...item.music!, file_role: 'companion', read_status: 'companion' }
  return item
}

/** 汇总响应保留每项结果，测试范围替换时不依赖组件内部状态。 */
function data(items: ManualTransferPreviewItem[]): ManualTransferPreviewData {
  return { items, summary: { total: items.length, success: items.length, failed: 0 } }
}

describe('music preview file boundaries', () => {
  it('keeps distinct editions and storage namespaces apart even with identical names and parent paths', () => {
    const rows = [row('a', '/music/01.flac'), row('b', '/music/02.flac'), row('a', '/music/01.flac', 'alist')]
    expect(groupMusicPreview(rows).map(group => group.items.length)).toEqual([1, 1, 1])
    expect(previewFileScope(rows)).toHaveLength(3)
    expect(canCorrectMusicGroup(groupMusicPreview(rows)[2])).toBe(false)
  })
  it('rejects directories, duplicate source files, missing identities and contradictory storage', () => {
    const original = row('a', '/music/01.flac')
    const invalid = [
      { ...original, source_item: { ...original.source_item!, type: 'dir' } },
      { ...original, source_item: undefined },
      { ...original, source_storage: 'alist' },
      { ...original, source: '/another/file.flac' },
    ]
    invalid.forEach(item => expect(previewFileScope([item])).toBeUndefined())
    expect(previewFileScope([original, original])).toBeUndefined()
  })
  it('requires affirmative audio readability instead of treating unknown reads as editable', () => {
    for (const read_status of ['unreadable', 'name_only', 'unknown'] as const) {
      const item = row('a', '/music/01.flac')
      item.music!.read_status = read_status
      expect(canCorrectMusicGroup(groupMusicPreview([item])[0])).toBe(false)
    }
    const item = row('a', '/music/01.flac')
    item.music!.read_status = 'stream_only'
    expect(canCorrectMusicGroup(groupMusicPreview([item])[0])).toBe(true)
  })
  it('replaces only the chosen edition while preserving other albums and CUE companions', () => {
    const rows = [row('a', '/music/image.flac'), row('a', '/music/album.cue'), row('b', '/music/other.flac')]
    rows[1].music!.file_role = 'companion'
    const changed = rows.slice(0, 2).map(item => ({ ...item, target: '/library/' + item.source_item!.name }))
    const result = replaceMusicGroup(data(rows), groupMusicPreview(rows)[0], data(changed))
    expect(result?.items).toEqual([...changed, rows[2]])
  })
  it('refuses shortened, expanded or duplicate correction responses without altering the original preview', () => {
    const rows = [row('a', '/music/01.flac'), row('a', '/music/02.flac')]
    const original = ref(data(rows)).value
    const group = groupMusicPreview(rows)[0]
    for (const items of [[rows[0]], [rows[0], rows[0]], [...rows, row('a', '/music/new.flac')]]) {
      expect(replaceMusicGroup(original, group, data(items))).toBeUndefined()
    }
    expect(original.items).toEqual(rows)
  })

  it('requires the same audio files while accepting dropped and added companions', () => {
    const audio = row('a', '/music/01.dsf')
    const cover = companion('a', '/music/folder.jpg')
    const addedLyrics = companion('a-result', '/music/01.lrc')
    const replacementAudio = {
      ...audio,
      target: '/library/Album/01.dsf',
      music: { ...audio.music!, group_id: 'a-result' },
    }
    const result = replaceMusicGroup(
      data([audio, cover]),
      groupMusicPreview([audio, cover])[0],
      data([replacementAudio, addedLyrics]),
    )
    expect(result?.items).toEqual([replacementAudio, addedLyrics])
  })

  it('keeps the selected edition on companions returned with a changed music group', async () => {
    const audio = row('a', '/music/01.dsf')
    const cover = companion('a', '/music/folder.jpg')
    const addedLyrics = companion('a-result', '/music/01.lrc')
    const source = ref(data([audio, cover]))
    const { correct, executionPayloads } = useMusicTransferCorrection(source)
    const selection = { media_source: 'musicbrainz' as const, media_id: 'album-1' }

    await expect(
      correct(groupMusicPreview([audio, cover])[0], selection, async () =>
        data([
          {
            ...audio,
            target: '/library/Album/01.dsf',
            music: { ...audio.music!, group_id: 'a-result' },
          },
          addedLyrics,
        ]),
      ),
    ).resolves.toBe(true)

    const payloads = executionPayloads(items => ({ fileitems: items }) as ManualTransferPayload)
    expect(payloads).toHaveLength(1)
    expect(payloads?.[0]).toMatchObject({
      media_source: 'musicbrainz',
      media_id: 'album-1',
      fileitems: [
        expect.objectContaining({ path: '/music/01.dsf' }),
        expect.objectContaining({ path: '/music/01.lrc' }),
      ],
    })
  })

  it('carries the selected edition across groups when the backend splits an album', async () => {
    const audioA = row('a', '/music/01.dsf')
    const audioB = row('a', '/music/02.dsf')
    const cover = companion('a', '/music/folder.jpg')
    const lyricsA = companion('a-1', '/music/01.lrc')
    const lyricsB = companion('a-2', '/music/02.lrc')
    const source = ref(data([audioA, audioB, cover]))
    const { correct, executionPayloads } = useMusicTransferCorrection(source)
    const selection = { media_source: 'musicbrainz' as const, media_id: 'album-1' }

    await expect(
      correct(groupMusicPreview([audioA, audioB, cover])[0], selection, async () =>
        data([
          {
            ...audioA,
            music: { ...audioA.music!, group_id: 'a-1' },
          },
          lyricsA,
          {
            ...audioB,
            music: { ...audioB.music!, group_id: 'a-2' },
          },
          lyricsB,
        ]),
      ),
    ).resolves.toBe(true)

    const payloads = executionPayloads(items => ({ fileitems: items }) as ManualTransferPayload)
    expect(payloads).toHaveLength(2)
    expect(payloads?.every(payload => payload.media_id === 'album-1')).toBe(true)
    expect(payloads?.map(payload => payload.fileitems?.map(item => item.path))).toEqual([
      ['/music/01.dsf', '/music/01.lrc'],
      ['/music/02.dsf', '/music/02.lrc'],
    ])
  })
})
