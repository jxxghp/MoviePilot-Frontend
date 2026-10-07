import { describe, expect, it } from 'vitest'
import type { DownloadDirectory } from '@/api/types'
import {
  buildDownloadDirectoryOptions,
  filterDownloadDirectoryOption,
  toDownloadDirectoryValue,
} from '@/utils/downloadDirectory'

function directory(overrides: Partial<DownloadDirectory>): DownloadDirectory {
  return { storage: 'local', priority: 0, ...overrides }
}

describe('buildDownloadDirectoryOptions', () => {
  it('shows the alias with its path and keeps the raw path as the value', () => {
    expect(buildDownloadDirectoryOptions([directory({ name: '可心影视库', save_path: '/downloads/movies' })])).toEqual([
      { title: '可心影视库 (/downloads/movies)', value: '/downloads/movies' },
    ])
  })

  it('falls back to the bare path when the directory has no alias', () => {
    expect(
      buildDownloadDirectoryOptions([
        directory({ name: '', save_path: 'rclone:/media' }),
        directory({ name: undefined, save_path: '/plain' }),
      ]),
    ).toEqual([
      { title: 'rclone:/media', value: 'rclone:/media' },
      { title: '/plain', value: '/plain' },
    ])
  })

  it('merges aliases that share one path and keeps first-seen order', () => {
    expect(
      buildDownloadDirectoryOptions([
        directory({ name: '目录二', save_path: '/b' }),
        directory({ name: '目录一', save_path: '/a' }),
        directory({ name: '别名一', save_path: '/b' }),
        directory({ name: '目录二', save_path: '/b' }),
      ]),
    ).toEqual([
      { title: '目录二 / 别名一 (/b)', value: '/b' },
      { title: '目录一 (/a)', value: '/a' },
    ])
  })

  it('repeats a shared alias under every path that uses it', () => {
    expect(
      buildDownloadDirectoryOptions([
        directory({ name: '影视', save_path: '/a' }),
        directory({ name: '影视', save_path: 'rclone:/b' }),
      ]),
    ).toEqual([
      { title: '影视 (/a)', value: '/a' },
      { title: '影视 (rclone:/b)', value: 'rclone:/b' },
    ])
  })

  it('treats a whitespace-only alias as no alias', () => {
    expect(buildDownloadDirectoryOptions([directory({ name: '   ', save_path: '/x' })])).toEqual([
      { title: '/x', value: '/x' },
    ])
  })

  it('does not repeat an alias that equals the path', () => {
    expect(
      buildDownloadDirectoryOptions([
        directory({ name: '/downloads', save_path: '/downloads' }),
        directory({ name: '主库', save_path: '/downloads' }),
      ]),
    ).toEqual([{ title: '主库 (/downloads)', value: '/downloads' }])
  })

  it('skips directories without a usable path and trims whitespace', () => {
    expect(
      buildDownloadDirectoryOptions([
        directory({ name: '空目录', save_path: undefined }),
        directory({ name: '空白', save_path: '   ' }),
        directory({ name: ' 有空格 ', save_path: ' /spaced ' }),
      ]),
    ).toEqual([{ title: '有空格 (/spaced)', value: '/spaced' }])
  })

  it('reads download_path when asked to', () => {
    expect(
      buildDownloadDirectoryOptions(
        [directory({ name: '订阅目录', download_path: '/subs', save_path: 'rclone:/subs' })],
        'download_path',
      ),
    ).toEqual([{ title: '订阅目录 (/subs)', value: '/subs' }])
  })
})

describe('toDownloadDirectoryValue', () => {
  it('passes free-typed strings through unchanged', () => {
    expect(toDownloadDirectoryValue('/a/b')).toBe('/a/b')
    expect(toDownloadDirectoryValue('')).toBe('')
  })

  it('unwraps a selected option to its path value', () => {
    expect(toDownloadDirectoryValue({ title: '电影 (/a/b)', value: '/a/b' })).toBe('/a/b')
  })

  it('maps null and undefined to null', () => {
    expect(toDownloadDirectoryValue(null)).toBeNull()
    expect(toDownloadDirectoryValue(undefined)).toBeNull()
  })
})

describe('filterDownloadDirectoryOption', () => {
  const item = { raw: { title: '可心影视库 (/Movies/Kexin)', value: '/Movies/Kexin' } }

  it('matches by alias fragment and by path fragment', () => {
    expect(filterDownloadDirectoryOption('/Movies/Kexin', '可心', item)).toBe(true)
    expect(filterDownloadDirectoryOption('/Movies/Kexin', '/movies', item)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(filterDownloadDirectoryOption('/Movies/Kexin', 'KEXIN', item)).toBe(true)
  })

  it('rejects non-matching queries and missing items', () => {
    expect(filterDownloadDirectoryOption('/Movies/Kexin', '不存在', item)).toBe(false)
    expect(filterDownloadDirectoryOption('/Movies/Kexin', '可心')).toBe(false)
  })
})
