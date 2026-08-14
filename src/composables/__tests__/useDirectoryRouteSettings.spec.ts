import { useDirectoryRouteSettings } from '@/composables/useDirectoryRouteSettings'
import type { CategoryConfig, DirectoryRouteSettings } from '@/api/types'
import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

const sequentialSettings: DirectoryRouteSettings = {
  directories: [{ name: '电视剧', priority: 0, storage: 'local', transfer_type: '' }],
  match_mode: 'sequential',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

const scopes: EffectScope[] = []

function createSettingsState() {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useDirectoryRouteSettings())!
}

describe('useDirectoryRouteSettings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
  })

  afterEach(() => {
    scopes.splice(0).forEach(scope => scope.stop())
  })

  it('loads and saves directories with the match mode as one contract', async () => {
    mocks.apiGet.mockResolvedValue(structuredClone(sequentialSettings))
    mocks.apiPost.mockImplementation((_endpoint: string, payload: DirectoryRouteSettings) => structuredClone(payload))
    const state = createSettingsState()

    await state.loadRouteSettings()
    state.directoryMatchMode.value = 'specificity'
    const saved = await state.saveRouteSettings()

    expect(saved).toBe('saved')
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/route/settings',
      { directories: sequentialSettings.directories, match_mode: 'specificity' },
      { feedback: 'silent' },
    )
  })

  it('does not expose an editable placeholder after the initial load fails', async () => {
    mocks.apiGet.mockRejectedValue(new Error('offline'))
    const state = createSettingsState()

    await state.loadRouteSettings()

    expect(state.routeSettingsLoaded.value).toBe(false)
    expect(await state.saveRouteSettings()).toBe('failed')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('rejects an older load response that arrives after a newer load', async () => {
    const older = deferred<DirectoryRouteSettings>()
    const newer = deferred<DirectoryRouteSettings>()
    mocks.apiGet.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const state = createSettingsState()

    const olderLoad = state.loadRouteSettings()
    const newerLoad = state.loadRouteSettings()
    newer.resolve({ ...structuredClone(sequentialSettings), match_mode: 'specificity' })
    await newerLoad
    older.resolve(structuredClone(sequentialSettings))
    await olderLoad

    expect(state.directoryMatchMode.value).toBe('specificity')
  })

  it('preserves edits made while a silent refresh is pending', async () => {
    mocks.apiGet.mockResolvedValueOnce(structuredClone(sequentialSettings))
    const state = createSettingsState()
    await state.loadRouteSettings()

    const refresh = deferred<DirectoryRouteSettings>()
    mocks.apiGet.mockReturnValueOnce(refresh.promise)
    const refreshPromise = state.loadRouteSettings()
    state.directoryMatchMode.value = 'specificity'
    refresh.resolve(structuredClone(sequentialSettings))
    await refreshPromise

    expect(state.directoryMatchMode.value).toBe('specificity')
  })

  it('invalidates refreshes started while a save is pending', async () => {
    mocks.apiGet.mockResolvedValueOnce(structuredClone(sequentialSettings))
    const state = createSettingsState()
    await state.loadRouteSettings()
    state.directoryMatchMode.value = 'specificity'

    const save = deferred<DirectoryRouteSettings>()
    mocks.apiPost.mockReturnValueOnce(save.promise)
    const savePromise = state.saveRouteSettings()
    const refresh = deferred<DirectoryRouteSettings>()
    mocks.apiGet.mockReturnValueOnce(refresh.promise)
    const refreshPromise = state.loadRouteSettings()

    save.resolve({ ...structuredClone(sequentialSettings), match_mode: 'specificity' })
    expect(await savePromise).toBe('saved')
    refresh.resolve(structuredClone(sequentialSettings))
    await refreshPromise

    expect(state.directoryMatchMode.value).toBe('specificity')
  })

  it('keeps a newer edit when an older save completes', async () => {
    mocks.apiGet.mockResolvedValueOnce(structuredClone(sequentialSettings))
    const state = createSettingsState()
    await state.loadRouteSettings()
    state.directoryMatchMode.value = 'specificity'

    const save = deferred<DirectoryRouteSettings>()
    mocks.apiPost.mockReturnValueOnce(save.promise)
    const savePromise = state.saveRouteSettings()
    state.directoryMatchMode.value = 'sequential'
    save.resolve({ ...structuredClone(sequentialSettings), match_mode: 'specificity' })
    expect(await savePromise).toBe('outdated')

    mocks.apiGet.mockResolvedValueOnce({ ...structuredClone(sequentialSettings), match_mode: 'specificity' })
    await state.loadRouteSettings()
    expect(state.directoryMatchMode.value).toBe('sequential')
  })

  it('serializes saves and unlocks after a failed atomic request', async () => {
    mocks.apiGet.mockResolvedValueOnce(structuredClone(sequentialSettings))
    const state = createSettingsState()
    await state.loadRouteSettings()

    const pendingSave = deferred<DirectoryRouteSettings>()
    mocks.apiPost.mockReturnValueOnce(pendingSave.promise)
    const firstSave = state.saveRouteSettings()
    expect(await state.saveRouteSettings()).toBe('failed')
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    pendingSave.reject(new Error('offline'))
    expect(await firstSave).toBe('failed')
    expect(state.savingRouteSettings.value).toBe(false)

    mocks.apiPost.mockResolvedValueOnce(structuredClone(sequentialSettings))
    expect(await state.saveRouteSettings()).toBe('saved')
    expect(mocks.apiPost).toHaveBeenCalledTimes(2)
  })

  it('preserves a category draft when an older refresh arrives', async () => {
    const initial: CategoryConfig = { movie: {}, tv: { 综艺: { genre_ids: '10764' } } }
    mocks.apiGet.mockResolvedValueOnce(structuredClone(initial))
    const state = createSettingsState()
    await state.loadCategoryConfig()

    const refresh = deferred<CategoryConfig>()
    mocks.apiGet.mockReturnValueOnce(refresh.promise)
    const refreshPromise = state.loadCategoryConfig()
    const draft: CategoryConfig = { movie: {}, tv: { 动漫: { genre_ids: '16' } } }
    state.setCategoryDraft(draft)
    refresh.resolve(structuredClone(initial))
    await refreshPromise

    expect(state.categoryConfig.value).toEqual(draft)
  })

  it('invalidates an in-flight category load after a save succeeds', async () => {
    const staleLoad = deferred<CategoryConfig>()
    mocks.apiGet.mockReturnValueOnce(staleLoad.promise)
    const state = createSettingsState()
    const loadPromise = state.loadCategoryConfig()
    const saved: CategoryConfig = { movie: { 动画: { genre_ids: '16' } }, tv: {} }

    state.markCategorySaved(saved)
    staleLoad.resolve({ movie: {}, tv: {} })
    await loadPromise

    expect(state.categoryConfigLoaded.value).toBe(true)
    expect(state.categoryConfig.value).toEqual(saved)
  })
})
