import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import CommunityMedalDialog from '@/components/dialog/CommunityMedalDialog.vue'
import {
  COMMUNITY_AUTH_CHANGED_EVENT,
  useCommunityContribution,
  type CommunityProfile,
} from '@/composables/useCommunityContribution'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import UserProfile from '@/layouts/default/components/UserProfile.vue'
import { markMedalSeen, unseenMedalKeys } from '@/utils/communityMedals'
import { writeCommunityProfileCache } from '@/utils/communityProfileCache'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), artMissing: false }))
vi.mock('@/api', () => ({ default: { get: mocks.get, post: mocks.post } }))
// 仓库里已有正式渲染图；需要验证缺图后备时把登记结果置空。
vi.mock('@/utils/communityMedalArt', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/communityMedalArt')>()
  return {
    ...actual,
    medalArt: (...args: Parameters<typeof actual.medalArt>) => (mocks.artMissing ? null : actual.medalArt(...args)),
  }
})

/** 持有编剧、布景与掌灯三枚勋章的已核验账号，编剧的两类证据有重叠，布景有 7 个插件。 */
function profile(overrides: Partial<CommunityProfile> = {}): CommunityProfile {
  return {
    state: 'ready',
    login: 'artist',
    user_id: 42,
    medals: [
      {
        key: 'code',
        tier: 3,
        specialty: 'frontend',
        at: '2025-04-02',
        basis: 'reached',
        facts: {
          total: 50,
          repositories: [
            { repository: 'MoviePilot-Frontend', area: 'frontend', commits: 50, merged_prs: 20 },
            { repository: 'Untrusted/Elsewhere', area: 'backend', commits: 3, merged_prs: 1 },
          ],
        },
      },
      {
        key: 'plugin',
        tier: 2,
        at: '2026-10-16',
        basis: 'recognized',
        facts: {
          installs: 79000,
          plugins: Array.from({ length: 7 }, (_, index) => ({
            id: 'p' + index,
            name: '示例插件 ' + (index + 1),
            market: 'example/plugins',
            installs: 20000 - index * 1000,
          })),
        },
      },
      { key: 'helper', at: '2025-06-18', years: [2025, 2026] },
    ],
    generated_at: '2026-10-16T00:00:00Z',
    checked_at: 1_792_000_000,
    stale: false,
    ...overrides,
  }
}

/** 超级管理员且实例开启社区勋章的初始状态。 */
function adminState(enabled: boolean | null = true) {
  // null 表示全局设置还没加载（store 默认空对象）。
  return {
    user: { superUser: true, userID: 1 },
    globalSettings: { data: enabled === null ? {} : { COMMUNITY_MEDALS_ENABLED: enabled } },
  }
}

beforeEach(() => {
  mocks.artMissing = false
  mocks.get.mockReset()
  mocks.post.mockReset()
  mocks.post.mockResolvedValue({})
  mocks.get.mockImplementation((url: string) => Promise.resolve(url === 'github/community' ? profile() : {}))
})

describe('Community medal showcase', () => {
  it('opens on the first unseen medal and clears chip dots as medals are viewed', async () => {
    markMedalSeen(42, { key: 'code', tier: 3 })
    await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    expect(await screen.findByRole('heading', { name: '布景' })).toBeVisible()
    expect(screen.getByText('致敬为 MoviePilot 开发插件的作者。')).toBeVisible()
    expect(screen.getByText('共建')).toBeVisible()
    expect(unseenMedalKeys(42, profile().medals)).toEqual(['helper'])
    const switcher = screen.getByRole('group', { name: '我的勋章' })
    const dot = (name: string) => within(switcher).getByRole('button', { name }).querySelector('.medal-showcase__dot')
    expect(dot('布景')).toBeNull()
    expect(dot('掌灯')).not.toBeNull()
    expect(within(switcher).getByRole('button', { name: '掌灯' }).querySelector('svg.medal-emblem')).not.toBeNull()
    await fireEvent.click(within(switcher).getByRole('button', { name: '掌灯' }))
    expect(await screen.findByRole('heading', { name: '掌灯' })).toBeVisible()
    expect(screen.getByText('2025.06.18')).toBeVisible()
    expect(unseenMedalKeys(42, profile().medals)).toEqual([])
    expect(dot('掌灯')).toBeNull()
  })

  it('introduces the seven medals when none is held yet', async () => {
    await renderWithProviders(CommunityMedalDialog, { props: { profile: profile({ medals: [] }) } })
    expect(await screen.findByText(/共七枚/)).toBeVisible()
    for (const name of ['编剧', '布景', '主创', '掌灯', '守夜', '试映', '启幕']) {
      expect(screen.getByText(name)).toBeVisible()
    }
    expect(screen.getByText('致敬守护 MoviePilot 安全的人。')).toBeVisible()
    expect(screen.queryByRole('button', { name: '详情' })).not.toBeInTheDocument()
  })

  it('guides an unconfigured instance to set up a GitHub token inside the showcase', async () => {
    mocks.post.mockResolvedValue({
      session_id: 's1',
      verification_uri: 'https://github.com/login/device',
      user_code: 'ABCD-1234',
      expires_in: 900,
      interval_seconds: 5,
    })
    vi.spyOn(window, 'open').mockReturnValue(null)
    await renderWithProviders(CommunityMedalDialog, {
      props: { profile: profile({ state: 'unconfigured', login: null, user_id: null, medals: [] }) },
    })
    expect(await screen.findByText('配置 GitHub Token 后，即可查看你获得的社区勋章')).toBeVisible()
    expect(screen.queryByRole('button', { name: '翻转勋章' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '配置 GitHub Token' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('github/auth/start', undefined, expect.anything()))
    expect(await screen.findByText('ABCD-1234')).toBeVisible()
  })

  it('shows the held tier front and the shared back from the art set without WebGL', async () => {
    await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    await fireEvent.click(await screen.findByRole('button', { name: '编剧' }))
    const card = screen.getByRole('button', { name: '翻转勋章' })
    const sources = [...card.querySelectorAll('img')].map(image => image.getAttribute('src'))
    expect(sources[0]).toContain('code-front-t3')
    expect(sources[1]).toContain('code-back')
  })

  it('engraves the back and falls back to a page-drawn medal without art or WebGL', async () => {
    mocks.artMissing = true
    await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    await fireEvent.click(await screen.findByRole('button', { name: '编剧' }))
    expect(screen.getByText('卓越 · 界面共建者', { selector: 'p.medal-card__line' })).toBeInTheDocument()
    expect(screen.getByText('授予 @artist', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByText('达成 2025.04.02', { selector: 'p' })).toBeInTheDocument()
    const card = screen.getByRole('button', { name: '翻转勋章' })
    await fireEvent.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    expect(card.querySelectorAll('svg.medal-face')).toHaveLength(2)
  })

  it('keeps only wear, save and details as actions and emits wear and close', async () => {
    const view = await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    await fireEvent.click(await screen.findByRole('button', { name: '布景' }))
    for (const name of ['佩戴', '保存图片', '详情']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    expect(screen.queryByRole('link', { name: /社区荣誉/ })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '佩戴' }))
    expect(view.emitted()['update:wornMedal']).toEqual([['plugin']])
    await fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0])
    expect(view.emitted().close).toHaveLength(1)
  })

  it('shows rules, tier progress and whitelisted evidence links for code in the details sheet', async () => {
    const view = await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    await fireEvent.click(await screen.findByRole('button', { name: '编剧' }))
    await fireEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findByText(/向 MoviePilot 官方仓库提交并被采纳的贡献累计满/)).toBeVisible()
    expect(screen.queryByText(/按署名插件累计安装量认定/)).not.toBeInTheDocument()
    expect(screen.getByText('距核心还差 150 次贡献')).toBeVisible()
    const link = screen.getByRole('link', { name: '已合并 PR 20' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/jxxghp/MoviePilot-Frontend/pulls?q=is%3Apr%20is%3Amerged%20author%3Aartist',
    )
    expect(screen.queryByRole('link', { name: '已合并 PR 1' })).not.toBeInTheDocument()
    expect(screen.getByText('已合并 PR 1')).toBeVisible()
    await fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(view.emitted().refresh).toHaveLength(1)
  })

  it('lists the top five plugins and expands the rest inside the details sheet', async () => {
    await renderWithProviders(CommunityMedalDialog, { props: { profile: profile() } })
    await fireEvent.click(await screen.findByRole('button', { name: '布景' }))
    await fireEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findByText('示例插件 1')).toBeVisible()
    expect(screen.getByText('距卓越还差 2.1 万次安装')).toBeVisible()
    expect(screen.queryByText('示例插件 6')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '查看全部 7 个' }))
    expect(await screen.findByText('示例插件 7')).toBeVisible()
  })

  it('opens on the worn medal when nothing is unseen', async () => {
    for (const medal of profile().medals) markMedalSeen(42, medal)
    await renderWithProviders(CommunityMedalDialog, {
      props: { profile: profile(), wornMedal: 'helper', focusMedal: 'helper' },
    })
    expect(await screen.findByRole('heading', { name: '掌灯' })).toBeVisible()
  })

  it('keeps the verified medals and warns when the list is stale', async () => {
    await renderWithProviders(CommunityMedalDialog, {
      props: { profile: profile({ stale: true }), failed: true, wornMedal: 'code' },
    })
    expect(await screen.findByText(/当前显示的是上次的结果/)).toBeVisible()
  })
})

describe('Community medal entry', () => {
  it('配置授权后后台核验期间保持展台打开，完成后自动展示新身份勋章', async () => {
    let phase = 'unconfigured'
    mocks.get.mockImplementation((url: string) => {
      if (url !== 'github/community') return Promise.resolve({})
      if (phase === 'unconfigured')
        return Promise.resolve(profile({ state: 'unconfigured', login: null, user_id: null, medals: [] }))
      if (phase === 'warming')
        return Promise.resolve(
          profile({ state: 'unavailable', login: null, user_id: null, medals: [], refreshing: true }),
        )
      return Promise.resolve(profile({ medals: [{ key: 'helper' }] }))
    })
    const Harness = defineComponent({ setup: () => () => h('div', [h(UserProfile), h(SharedDialogHost)]) })
    await renderWithProviders(Harness, { initialState: adminState() })
    await fireEvent.click(await screen.findByRole('button', { name: '社区勋章' }))
    expect(await screen.findByText('配置 GitHub Token 后，即可查看你获得的社区勋章')).toBeVisible()
    phase = 'warming'
    window.dispatchEvent(new Event(COMMUNITY_AUTH_CHANGED_EVENT))
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith(
        'github/community',
        expect.objectContaining({ params: { refresh: true } }),
      ),
    )
    expect(screen.getByText('配置 GitHub Token 后，即可查看你获得的社区勋章')).toBeVisible()
    phase = 'ready'
    expect(await screen.findByRole('heading', { name: '掌灯' }, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByText('配置 GitHub Token 后，即可查看你获得的社区勋章')).not.toBeInTheDocument()
  })

  it('全局开关尚在后台预热时显示占位，并在查询确认开放后自动显示勋章', async () => {
    vi.useFakeTimers()
    let queried = false
    mocks.get.mockImplementation((url: string) => {
      if (url !== 'github/community') return Promise.resolve({})
      if (queried) return Promise.resolve(profile())
      queried = true
      return Promise.resolve(profile({ state: 'unavailable', user_id: null, medals: [], refreshing: true }))
    })
    await renderWithProviders(UserProfile, {
      initialState: {
        ...adminState(false),
        globalSettings: { data: { COMMUNITY_MEDALS_ENABLED: false, COMMUNITY_MEDALS_REFRESHING: true } },
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('status', { name: '社区勋章 · 加载中' })).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(1500)
    expect(screen.getByRole('button', { name: /社区勋章/ })).toBeVisible()
  })

  it('慢请求返回前立即恢复缓存用户佩戴的勋章，复核不让顶栏闪回线框', async () => {
    localStorage.setItem('community-medal-worn:1:42', 'helper')
    writeCommunityProfileCache('1', profile({ checked_at: Math.floor(Date.now() / 1000) }))
    let resolve!: (value: CommunityProfile) => void
    mocks.get.mockImplementation((url: string) =>
      url === 'github/community'
        ? new Promise<CommunityProfile>(done => {
            resolve = done
          })
        : Promise.resolve({}),
    )
    await renderWithProviders(UserProfile, { initialState: adminState() })
    const worn = screen.getByRole('button', { name: /掌灯勋章/ })
    expect(worn.querySelector('img')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /加载中/ })).not.toBeInTheDocument()
    resolve(profile())
    await waitFor(() => expect(screen.getByRole('button', { name: /掌灯勋章/ })).toBe(worn))
  })

  it.each([
    ['held', profile().medals, true],
    ['none', [], false],
    ['unknown only', [{ key: 'future-medal', at: '2030' }], false],
  ] as const)(
    'shows the menu entry for a verified account, with a dot only for unseen medals: %s',
    async (_, medals, unseen) => {
      mocks.get.mockImplementation((url: string) =>
        Promise.resolve(url === 'github/community' ? profile({ medals: medals as CommunityProfile['medals'] }) : {}),
      )
      await renderWithProviders(UserProfile, { initialState: adminState() })
      await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('github/community', expect.anything()))
      await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
      await screen.findByText('关于 MoviePilot')
      const entry = await screen.findByText('社区勋章')
      const menuText = entry.closest('.v-list')!.textContent!
      expect(menuText.indexOf('社区勋章')).toBeLessThan(menuText.indexOf('关于'))
      if (unseen) expect(screen.getByRole('status', { name: '新勋章' })).toBeInTheDocument()
      else expect(screen.queryByRole('status', { name: '新勋章' })).not.toBeInTheDocument()
    },
  )

  it('wears the chosen held medal beside the avatar', async () => {
    localStorage.setItem('community-medal-worn:1:42', 'helper')
    await renderWithProviders(UserProfile, { initialState: adminState() })
    expect(await screen.findByRole('button', { name: /掌灯勋章/ })).toBeVisible()
  })

  it('does not wear a medal that is no longer held', async () => {
    localStorage.setItem('community-medal-worn:1:42', 'security')
    await renderWithProviders(UserProfile, { initialState: adminState() })
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('github/community', expect.anything()))
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('社区勋章')
    expect(screen.queryByRole('button', { name: /守夜勋章/ })).not.toBeInTheDocument()
  })

  it.each([
    ['switched off', false],
    ['settings not loaded', null],
  ] as const)('does not query or show medals when the instance switch is %s', async (_, enabled) => {
    localStorage.setItem('community-medal-worn:1:none', 'helper')
    await renderWithProviders(UserProfile, { initialState: adminState(enabled) })
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('关于 MoviePilot')
    expect(mocks.get).not.toHaveBeenCalledWith('github/community', expect.anything())
    expect(screen.queryByText('社区勋章')).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '新勋章' })).not.toBeInTheDocument()
  })

  it('hides the entry, worn medal and unseen dot when the instance reports disabled', async () => {
    localStorage.setItem('community-medal-worn:1:42', 'helper')
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve(url === 'github/community' ? profile({ state: 'disabled' }) : {}),
    )
    await renderWithProviders(UserProfile, { initialState: adminState() })
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('github/community', expect.anything()))
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('关于 MoviePilot')
    expect(screen.queryByText('社区勋章')).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '新勋章' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /掌灯勋章/ })).not.toBeInTheDocument()
  })

  it('shows the entry without an unseen dot or worn medal while the token is not configured', async () => {
    localStorage.setItem('community-medal-worn:1:none', 'helper')
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve(
        url === 'github/community' ? profile({ state: 'unconfigured', login: null, user_id: null, medals: [] }) : {},
      ),
    )
    await renderWithProviders(UserProfile, { initialState: adminState() })
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('github/community', expect.anything()))
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    expect(await screen.findByText('社区勋章')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: '新勋章' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /掌灯勋章/ })).not.toBeInTheDocument()
  })

  it('does not query or inherit the instance token for a normal user', async () => {
    await renderWithProviders(UserProfile, { initialState: { ...adminState(), user: { superUser: false, userID: 2 } } })
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('个人信息')
    expect(mocks.get).not.toHaveBeenCalledWith('github/community', expect.anything())
    expect(screen.queryByText('社区勋章')).not.toBeInTheDocument()
  })

  it('ignores an old account response after an identity reset', async () => {
    let resolve!: (value: CommunityProfile) => void
    mocks.get.mockReturnValue(
      new Promise<CommunityProfile>(done => {
        resolve = done
      }),
    )
    const enabled = ref(true)
    const identity = ref('1')
    let community!: ReturnType<typeof useCommunityContribution>
    const Harness = defineComponent({
      setup() {
        community = useCommunityContribution(enabled, identity)
        return () => null
      },
    })
    await renderWithProviders(Harness)
    enabled.value = false
    await waitFor(() => expect(community.eligible.value).toBe(false))
    resolve(profile())
    await Promise.resolve()
    expect(community.profile.value).toBeNull()
  })
})
