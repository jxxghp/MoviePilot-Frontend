import type { selectVibrantSwatch } from '@/@core/utils/image'
import {
  resolvePluginAuthorAvatar,
  resolvePluginAuthorUrl,
  usePluginCardAccent,
} from '@/composables/usePluginCardAccent'
import { normalizePluginAccentColor } from '@/utils/glassColor'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  extractDominantColor: vi.fn(),
}))

vi.mock('@/@core/utils/image', () => ({
  extractDominantColor: mocks.extractDominantColor,
}))

function createImageHost() {
  const host = document.createElement('div')
  host.append(document.createElement('img'))

  return host
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

describe('usePluginCardAccent', () => {
  beforeEach(() => {
    mocks.extractDominantColor.mockReset()
  })

  it('publishes a normalized nullable accent for the plugin card CSS variable', async () => {
    mocks.extractDominantColor.mockResolvedValue('#ff0000')
    const accent = usePluginCardAccent()
    accent.imageRef.value = { $el: createImageHost() }

    await accent.updateAccentColor()

    expect(accent.accentRgb.value).toBe(normalizePluginAccentColor('#ff0000')?.rgb)
    expect(accent.accentStyle.value).toEqual({
      '--plugin-card-accent-rgb': accent.accentRgb.value,
      '--mp-card-accent-rgb': accent.accentRgb.value,
    })
  })

  it('leaves the accent unset when extraction fails and can clear a previous value', async () => {
    const accent = usePluginCardAccent()
    accent.imageRef.value = { $el: createImageHost() }
    mocks.extractDominantColor.mockResolvedValueOnce('#00ff00')
    await accent.updateAccentColor()
    expect(accent.accentRgb.value).toBeDefined()

    accent.resetAccentColor()
    expect(accent.accentRgb.value).toBeUndefined()
    expect(accent.accentStyle.value).toBeUndefined()

    mocks.extractDominantColor.mockResolvedValueOnce(undefined)
    await accent.updateAccentColor()
    expect(accent.accentRgb.value).toBeUndefined()
  })

  it('ignores an older extraction that resolves after the current logo', async () => {
    const older = deferred<string | undefined>()
    const current = deferred<string | undefined>()
    mocks.extractDominantColor.mockReturnValueOnce(older.promise).mockReturnValueOnce(current.promise)
    const accent = usePluginCardAccent()
    accent.imageRef.value = { $el: createImageHost() }

    const olderUpdate = accent.updateAccentColor()
    const currentUpdate = accent.updateAccentColor()
    current.resolve('#00ff00')
    await currentUpdate
    expect(accent.accentRgb.value).toBe(normalizePluginAccentColor('#00ff00')?.rgb)

    older.resolve('#ff0000')
    await olderUpdate
    expect(accent.accentRgb.value).toBe(normalizePluginAccentColor('#00ff00')?.rgb)
  })

  it('keeps the CSS fallback after reset when an extraction resolves late', async () => {
    const pending = deferred<string | undefined>()
    mocks.extractDominantColor.mockReturnValueOnce(pending.promise)
    const accent = usePluginCardAccent()
    accent.imageRef.value = { $el: createImageHost() }

    const update = accent.updateAccentColor()
    accent.resetAccentColor()
    pending.resolve('#ff0000')
    await update

    expect(accent.accentRgb.value).toBeUndefined()
    expect(accent.accentStyle.value).toBeUndefined()
  })

  it('resolves co-author GitHub avatars and normalizes comma-joined profile links', () => {
    expect(resolvePluginAuthorAvatar('https://github.com/InfinityPacer,Kurisu', 'InfinityPacer,Kurisu')).toBe(
      'https://github.com/InfinityPacer.png',
    )
    expect(resolvePluginAuthorUrl('https://github.com/lightolly,jxxghp', 'lightolly,jxxghp')).toBe(
      'https://github.com/lightolly',
    )
    expect(resolvePluginAuthorAvatar(undefined, 'lightolly,jxxghp')).toBe('https://github.com/lightolly.png')
    expect(resolvePluginAuthorAvatar(undefined, '本地作者')).toBe('')
  })

  it('prefers vivid brand swatches over near-white circles, near-black fills, and grey edges', async () => {
    const actualImageModule = await vi.importActual<{ selectVibrantSwatch: typeof selectVibrantSwatch }>(
      '@/@core/utils/image',
    )

    expect(
      actualImageModule.selectVibrantSwatch([
        [250, 251, 252],
        [214, 218, 216],
        [42, 179, 108],
      ]),
    ).toEqual([42, 179, 108])

    expect(
      actualImageModule.selectVibrantSwatch([
        [12, 14, 16],
        [59, 130, 246],
      ]),
    ).toEqual([59, 130, 246])

    expect(
      actualImageModule.selectVibrantSwatch([
        [250, 250, 250],
        [164, 166, 168],
        [10, 10, 10],
      ]),
    ).toBeUndefined()
  })
})
