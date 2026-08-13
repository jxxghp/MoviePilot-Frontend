import {
  normalizeNativeSubscribeMedia,
  type NativeSubscribe,
  usePluginNativeSubscribe,
} from '@/composables/usePluginNativeSubscribe'
import type { SeasonSubscribeModes } from '@/composables/useMediaSubscribe'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface CapturedSubscribeOptions {
  isExists: () => boolean
  isSubscribed: Ref<boolean>
  subscribedSeasonModes: Ref<SeasonSubscribeModes>
  subscribedSeasons: Ref<number[]>
}

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  checkSubscribe: vi.fn(),
  handleSubscribe: vi.fn(),
  subscribeOptions: undefined as CapturedSubscribeOptions | undefined,
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

vi.mock('@/composables/useMediaSubscribe', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useMediaSubscribe')>()
  return {
    ...actual,
    useMediaSubscribe: (options: Record<string, unknown>) => {
      mocks.subscribeOptions = options as unknown as CapturedSubscribeOptions
      return {
        checkSubscribe: mocks.checkSubscribe,
        handleSubscribe: mocks.handleSubscribe,
      }
    },
  }
})

/** 在完整应用插件环境中创建原生订阅回调，便于验证权限与响应式状态。 */
async function renderNativeSubscribeHarness(subscribePermission = true) {
  let nativeSubscribe: NativeSubscribe | undefined
  const Harness = defineComponent({
    name: 'PluginNativeSubscribeHarness',
    /** 在组件上下文中创建待测的原生订阅方法。 */
    setup() {
      nativeSubscribe = usePluginNativeSubscribe()
      return () => null
    },
  })

  await renderWithProviders(Harness, {
    initialState: {
      user: {
        permissions: {
          discovery: true,
          manage: false,
          search: true,
          subscribe: subscribePermission,
        },
        superUser: false,
        userName: 'tester',
      },
    },
  })

  return nativeSubscribe as NativeSubscribe
}

describe('native subscribe media normalization', () => {
  it('normalizes the declared media identity and English media types', () => {
    const result = normalizeNativeSubscribeMedia({
      anilist_id: 999,
      media_id: '154587',
      media_source: 'anilist',
      title: '测试剧集',
      type: 'tv',
      year: 2026,
    })

    expect(result).toEqual({
      success: true,
      media: expect.objectContaining({
        media_id: '154587',
        media_source: 'anilist',
        title: '测试剧集',
        type: '电视剧',
        year: '2026',
      }),
    })
    if (result.success) expect(result.media).not.toHaveProperty('anilist_id')
  })

  it('accepts another fixed source identifier', () => {
    const result = normalizeNativeSubscribeMedia({
      media_id: 'subject-42',
      media_source: 'bilibili',
      title: '自定义媒体',
      type: 'movie',
    })

    expect(result).toEqual({
      success: true,
      media: expect.objectContaining({
        media_id: 'subject-42',
        media_source: 'bilibili',
        type: '电影',
      }),
    })
  })

  it('accepts a plugin-defined media source identity', () => {
    const result = normalizeNativeSubscribeMedia({
      media_id: 'custom-42',
      media_source: 'acme.video',
      title: '插件媒体',
      type: 'movie',
    })

    expect(result).toEqual({
      success: true,
      media: expect.objectContaining({
        media_id: 'custom-42',
        media_source: 'acme.video',
        title: '插件媒体',
        type: '电影',
      }),
    })
  })

  it.each([
    [null, 'invalidMedia'],
    [{ title: '缺少类型', tmdb_id: 1 }, 'unsupportedType'],
    [{ title: '', tmdb_id: 1, type: '电影' }, 'missingTitle'],
    [{ title: '缺少ID', type: '电视剧' }, 'missingId'],
    [{ title: '仅有旧来源 ID', tmdb_id: 1, type: '电影' }, 'missingId'],
    [{ media_id: '1', media_source: 'invalid:source', title: '非法来源', type: '电影' }, 'missingId'],
  ])('rejects invalid input %#', (input, reason) => {
    expect(normalizeNativeSubscribeMedia(input)).toEqual({ success: false, reason })
  })
})

describe('plugin native subscribe flow', () => {
  beforeEach(() => {
    mocks.checkSubscribe.mockResolvedValue(false)
    mocks.handleSubscribe.mockResolvedValue(undefined)
    mocks.apiGet.mockResolvedValue([])
    mocks.subscribeOptions = undefined
  })

  it('restores subscribed TV seasons before opening the native season dialog', async () => {
    mocks.apiGet.mockResolvedValue([
      { best_version: 0, media_source: 'themoviedb', media_id: '500', season: 1, type: '电视剧' },
      { best_version: 1, media_source: 'themoviedb', media_id: '500', season: 3, type: '电视剧' },
      { best_version: 0, media_source: 'themoviedb', media_id: '999', season: 2, type: '电视剧' },
    ])
    const nativeSubscribe = await renderNativeSubscribeHarness()

    await expect(
      nativeSubscribe({ media_id: '500', media_source: 'themoviedb', title: '原生选季', type: 'tv' }),
    ).resolves.toEqual({ success: true })

    expect(mocks.apiGet).toHaveBeenCalledWith('subscribe/')
    expect(mocks.subscribeOptions?.subscribedSeasons.value).toEqual([1, 3])
    expect(mocks.subscribeOptions?.subscribedSeasonModes.value).toEqual({ 1: 'normal', 3: 'best_version' })
    expect(mocks.handleSubscribe).toHaveBeenCalledOnce()
  })

  it('restores movie subscribe and exists state before using the native movie flow', async () => {
    mocks.checkSubscribe.mockResolvedValue(true)
    mocks.apiGet.mockResolvedValue({ item: { id: 'library-600' } })
    const nativeSubscribe = await renderNativeSubscribeHarness()

    await expect(
      nativeSubscribe({
        media_source: 'themoviedb',
        media_id: '600',
        title: '原生电影',
        type: '电影',
      }),
    ).resolves.toEqual({ success: true })

    expect(mocks.checkSubscribe).toHaveBeenCalledWith(null)
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/exists', {
      params: expect.objectContaining({
        media_source: 'themoviedb',
        media_id: '600',
        mtype: '电影',
        title: '原生电影',
      }),
    })
    expect(mocks.subscribeOptions?.isSubscribed.value).toBe(true)
    expect(mocks.subscribeOptions?.isExists()).toBe(true)
    expect(mocks.handleSubscribe).toHaveBeenCalledOnce()
  })

  it('returns a structured fallback result for invalid media', async () => {
    const nativeSubscribe = await renderNativeSubscribeHarness()
    const result = await nativeSubscribe({ title: '没有ID', type: '电视剧' })

    expect(result).toMatchObject({ code: 'INVALID_MEDIA', success: false })
    expect(mocks.toastError).toHaveBeenCalledWith('无法打开原生订阅：请提供有效的媒体数据源 ID。')
    expect(mocks.handleSubscribe).not.toHaveBeenCalled()
  })

  it('returns a structured fallback result when the user lacks subscribe permission', async () => {
    const nativeSubscribe = await renderNativeSubscribeHarness(false)
    const result = await nativeSubscribe({
      media_id: '700',
      media_source: 'themoviedb',
      title: '无权限',
      type: '电影',
    })

    expect(result).toEqual({
      code: 'PERMISSION_DENIED',
      message: '当前用户没有订阅权限。',
      success: false,
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(mocks.handleSubscribe).not.toHaveBeenCalled()
  })
})
