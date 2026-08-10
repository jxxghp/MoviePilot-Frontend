import { usePluginCardAccent } from '@/composables/usePluginCardAccent'
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
    expect(accent.accentStyle.value).toEqual({ '--plugin-card-accent-rgb': accent.accentRgb.value })
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
})
