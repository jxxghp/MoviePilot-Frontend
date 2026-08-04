import type { SubscribeShare } from '@/api/types'
import ForkSubscribeDialog from '@/components/dialog/ForkSubscribeDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSubscribeShare } from '@tests/support/factories/subscribe'
import {
  deleteSubscribeShareHandler,
  followSubscriberHandler,
  followSubscribersSettingHandler,
  forkSubscribeHandler,
  unfollowSubscriberHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: {
    push: (...args: unknown[]) => mocks.routerPush(...args),
  },
}))

vi.mock('@/api/nprogress', () => ({
  doneNProgress: vi.fn(),
  startNProgress: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, '关闭')
  },
})

const PosterStub = defineComponent({
  name: 'VImg',
  emits: ['click'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          'aria-label': '查看媒体详情',
          type: 'button',
          onClick: () => emit('click'),
        },
        '查看媒体详情',
      )
  },
})

interface MediaIdentifiers {
  anilistid?: number
  bangumiid?: number
  doubanid?: string
  tmdbid?: number
}

const mediaDetailCases: Array<[string, MediaIdentifiers, string]> = [
  ['TMDB', { tmdbid: 6301 }, 'tmdb:6301'],
  ['Douban', { doubanid: 'db-6302', tmdbid: undefined }, 'douban:db-6302'],
  ['Bangumi', { bangumiid: 6303, doubanid: undefined, tmdbid: undefined }, 'bangumi:6303'],
  ['AniList', { anilistid: 6304, bangumiid: undefined, tmdbid: undefined }, 'anilist:6304'],
]

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog(media: SubscribeShare = createSubscribeShare(), settings: Record<string, unknown> = {}) {
  const events = {
    close: vi.fn(),
    delete: vi.fn(),
    fork: vi.fn(),
  }
  const result = await renderWithProviders(ForkSubscribeDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
      stubs: {
        VImg: PosterStub,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          SUBSCRIBE_SHARE_MANAGE: false,
          USER_UNIQUE_ID: 'current-user',
          ...settings,
        },
      },
    },
    props: {
      media,
      modelValue: true,
      onClose: events.close,
      onDelete: events.delete,
      onFork: events.fork,
    },
  })
  await flushPromises()
  await flushPromises()

  return { ...result, events, media }
}

describe('ForkSubscribeDialog follow behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('loads the followed users and shows the current action', async () => {
    const media = createSubscribeShare({ share_uid: 'followed-user' })
    const requested = vi.fn()
    server.use(followSubscribersSettingHandler(['followed-user'], 200, requested))

    await renderDialog(media)

    expect(await screen.findByRole('button', { name: '取消关注' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关注' })).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()
  })

  it('places long recognition words in a full-width metadata row', async () => {
    server.use(followSubscribersSettingHandler([]))
    const { media } = await renderDialog(
      createSubscribeShare({
        custom_words: '#九门2026\n【ADWeb】\n^The.Mystic.Nine => 九门.The.Mystic.Nine',
      }),
    )

    const row = document.querySelector('.subscribe-share-detail__recognition')

    expect(row).toBeInTheDocument()
    expect(row?.querySelector(':scope > dt')).toHaveTextContent('识别词：')
    expect(row?.querySelector(':scope > dd')).toHaveTextContent(media.custom_words!.replaceAll('\n', ' '))
  })

  it('follows a share user and refreshes the action from the server setting', async () => {
    const media = createSubscribeShare({ share_uid: 'new-follow-user' })
    const users: string[] = []
    const writeRequest = vi.fn((url: URL) => {
      users.push(url.searchParams.get('share_uid') || '')
    })
    server.use(followSubscribersSettingHandler(users), followSubscriberHandler({ success: true }, 200, writeRequest))
    const user = userEvent.setup()
    await renderDialog(media)

    await user.click(await screen.findByRole('button', { name: '关注' }))

    expect(await screen.findByRole('button', { name: '取消关注' })).toBeInTheDocument()
    expect(writeRequest).toHaveBeenCalledOnce()
    expect(writeRequest.mock.calls[0][0].pathname).toBe('/api/v1/subscribe/follow')
    expect(writeRequest.mock.calls[0][0].searchParams.get('share_uid')).toBe('new-follow-user')
  })

  it('unfollows a share user and refreshes the action from the server setting', async () => {
    const media = createSubscribeShare({ share_uid: 'old-follow-user' })
    const users = ['old-follow-user']
    const writeRequest = vi.fn((url: URL) => {
      users.splice(users.indexOf(url.searchParams.get('share_uid') || ''), 1)
    })
    server.use(followSubscribersSettingHandler(users), unfollowSubscriberHandler({ success: true }, 200, writeRequest))
    const user = userEvent.setup()
    await renderDialog(media)

    await user.click(await screen.findByRole('button', { name: '取消关注' }))

    expect(await screen.findByRole('button', { name: '关注' })).toBeInTheDocument()
    expect(writeRequest).toHaveBeenCalledOnce()
    expect(writeRequest.mock.calls[0][0].pathname).toBe('/api/v1/subscribe/follow')
    expect(writeRequest.mock.calls[0][0].searchParams.get('share_uid')).toBe('old-follow-user')
  })

  it('does not show follow actions when the share has no UID', async () => {
    const media = createSubscribeShare({ share_uid: undefined })
    server.use(followSubscribersSettingHandler([]))

    await renderDialog(media)
    await waitFor(() => expect(screen.getByRole('button', { name: '订阅' })).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: '关注' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消关注' })).not.toBeInTheDocument()
  })

  it('shows visible feedback when the followed-user list request fails', async () => {
    server.use(followSubscribersSettingHandler([], 500))

    await renderDialog(createSubscribeShare())

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
  })

  it('keeps the follow action and shows feedback when the follow request fails', async () => {
    const media = createSubscribeShare({ share_uid: 'failed-follow-user' })
    server.use(followSubscribersSettingHandler([]), followSubscriberHandler({ success: true }, 500))
    const user = userEvent.setup()
    await renderDialog(media)

    await user.click(await screen.findByRole('button', { name: '关注' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(screen.getByRole('button', { name: '关注' })).toBeInTheDocument()
  })

  it('keeps the unfollow action and shows feedback when the unfollow request fails', async () => {
    const media = createSubscribeShare({ share_uid: 'failed-unfollow-user' })
    server.use(
      followSubscribersSettingHandler(['failed-unfollow-user']),
      unfollowSubscriberHandler({ success: true }, 500),
    )
    const user = userEvent.setup()
    await renderDialog(media)

    await user.click(await screen.findByRole('button', { name: '取消关注' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求失败，请稍后重试'))
    expect(screen.getByRole('button', { name: '取消关注' })).toBeInTheDocument()
  })
})

describe('ForkSubscribeDialog fork, delete, and navigation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('keeps the fork button pending and emits the created subscription ID on success', async () => {
    const media = createSubscribeShare({ id: 6101, share_title: '待复用分享' })
    const deferred = createDeferred()
    const forkPayload = vi.fn(() => deferred.promise)
    server.use(
      followSubscribersSettingHandler([]),
      forkSubscribeHandler({ data: { id: 7101 }, success: true }, 200, forkPayload),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog(media)
    const forkButton = screen.getByRole('button', { name: '订阅' })

    await user.click(forkButton)
    await waitFor(() => expect(forkPayload).toHaveBeenCalledOnce())
    expect(forkButton).toBeDisabled()
    expect(events.fork).not.toHaveBeenCalled()

    deferred.resolve()
    await waitFor(() => expect(events.fork).toHaveBeenCalledWith(7101))
    expect(forkPayload).toHaveBeenCalledWith(media)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('添加待复用分享成功！')
  })

  it('reports a fork business failure and does not emit', async () => {
    server.use(followSubscribersSettingHandler([]), forkSubscribeHandler({ message: '订阅已存在', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog(createSubscribeShare({ share_title: '冲突分享' }))

    await user.click(screen.getByRole('button', { name: '订阅' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('添加冲突分享失败：订阅已存在！'))
    expect(events.fork).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '订阅' })).not.toBeDisabled()
  })

  it('reports an HTTP fork failure, restores the action, and does not emit', async () => {
    server.use(followSubscribersSettingHandler([]), forkSubscribeHandler({ success: true }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog(createSubscribeShare())

    await user.click(screen.getByRole('button', { name: '订阅' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('请求失败')))
    expect(events.fork).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '订阅' })).not.toBeDisabled()
  })

  it.each([
    ['the owner', 'owned-share', false, true],
    ['a share manager', 'other-user', true, true],
    ['another ordinary user', 'other-user', false, false],
  ])('shows delete permission for %s', async (_case, shareUid, canManage, visible) => {
    server.use(followSubscribersSettingHandler([]))

    await renderDialog(createSubscribeShare({ share_uid: shareUid }), {
      SUBSCRIBE_SHARE_MANAGE: canManage,
      USER_UNIQUE_ID: 'owned-share',
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '订阅' })).toBeInTheDocument())

    if (visible) expect(screen.getByRole('button', { name: '取消分享' })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: '取消分享' })).not.toBeInTheDocument()
  })

  it('deletes the exact share and emits success without relying on response data.id', async () => {
    const media = createSubscribeShare({ id: 6201, share_uid: 'owned-share' })
    const deferred = createDeferred()
    const deleteRequest = vi.fn((_url: URL) => deferred.promise)
    server.use(
      followSubscribersSettingHandler([]),
      deleteSubscribeShareHandler(6201, { success: true }, 200, deleteRequest),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog(media, { USER_UNIQUE_ID: 'owned-share' })
    const deleteButton = screen.getByRole('button', { name: '取消分享' })

    await user.click(deleteButton)
    await waitFor(() => expect(deleteRequest).toHaveBeenCalledOnce())
    expect(deleteButton).toBeDisabled()
    expect(deleteRequest.mock.calls[0][0].pathname).toBe('/api/v1/subscribe/share/6201')

    deferred.resolve()
    await waitFor(() => expect(events.delete).toHaveBeenCalledOnce())
    expect(events.delete).toHaveBeenCalledWith()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已取消订阅！')
  })

  it('reports a delete business failure and does not emit', async () => {
    const media = createSubscribeShare({ id: 6202, share_uid: 'owned-share' })
    server.use(
      followSubscribersSettingHandler([]),
      deleteSubscribeShareHandler(6202, { message: '没有删除权限', success: false }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog(media, { USER_UNIQUE_ID: 'owned-share' })

    await user.click(screen.getByRole('button', { name: '取消分享' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('取消订阅失败：没有删除权限！'))
    expect(events.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '取消分享' })).not.toBeDisabled()
  })

  it('reports an HTTP delete failure, restores the action, and does not emit', async () => {
    const media = createSubscribeShare({ id: 6203, share_uid: 'owned-share' })
    server.use(followSubscribersSettingHandler([]), deleteSubscribeShareHandler(6203, { success: true }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog(media, { USER_UNIQUE_ID: 'owned-share' })

    await user.click(screen.getByRole('button', { name: '取消分享' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('请求失败')))
    expect(events.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '取消分享' })).not.toBeDisabled()
  })

  it('emits close from the dialog close control', async () => {
    server.use(followSubscribersSettingHandler([]))
    const user = userEvent.setup()
    const { events } = await renderDialog(createSubscribeShare())

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(events.close).toHaveBeenCalledOnce()
  })

  it.each(mediaDetailCases)(
    'routes %s shares to their media details',
    async (_source, identifiers, expectedMediaId) => {
      const media: SubscribeShare = {
        ...createSubscribeShare({
          anilistid: identifiers.anilistid,
          doubanid: identifiers.doubanid,
          tmdbid: identifiers.tmdbid,
        }),
        bangumiid: identifiers.bangumiid,
      }
      server.use(followSubscribersSettingHandler([]))
      const user = userEvent.setup()
      await renderDialog(media)

      await user.click(screen.getByRole('button', { name: '查看媒体详情' }))

      expect(mocks.routerPush).toHaveBeenCalledWith({
        path: '/media',
        query: {
          mediaid: expectedMediaId,
          title: media.name,
          type: media.type,
          year: media.year,
        },
      })
    },
  )
})
