import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import CommunityContributionDialog from '@/components/dialog/CommunityContributionDialog.vue'
import { useCommunityContribution, type CommunityProfile } from '@/composables/useCommunityContribution'
import UserProfile from '@/layouts/default/components/UserProfile.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get } }))

/** 使用两类证据重叠的前端贡献快照，验证展示不重复计数。 */
function profile(overrides: Partial<CommunityProfile> = {}): CommunityProfile {
  return {
    state: 'ready',
    login: 'artist',
    user_id: 42,
    tier: 'gold',
    specialty: 'frontend',
    total: 50,
    repositories: [{ repository: 'MoviePilot-Frontend', area: 'frontend', commits: 50, merged_prs: 20 }],
    checked_at: 1_792_000_000,
    stale: false,
    ...overrides,
  }
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.get.mockImplementation((url: string) => Promise.resolve(url === 'github/community' ? profile() : {}))
})

describe('Community contribution card', () => {
  it('opens evidence and level details, emits refresh and avatar preference, and closes', async () => {
    const view = await renderWithProviders(CommunityContributionDialog, { props: { profile: profile() } })
    expect(await screen.findByText('卓越 · 界面共建者')).toBeVisible()
    expect(screen.queryByText('GitHub 身份已验证')).not.toBeInTheDocument()
    expect(screen.getByText('卓越 · 界面共建者')).toHaveAttribute('data-tier', 'gold')
    expect(screen.getByText('50')).toBeVisible()
    expect(screen.queryByText('MoviePilot-Frontend')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '查看贡献记录' }))
    const link = await screen.findByRole('link', { name: /已合并 PR 20/ })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/jxxghp/MoviePilot-Frontend/pulls?q=is%3Apr%20is%3Amerged%20author%3Aartist',
    )
    await fireEvent.click(screen.getByRole('button', { name: '等级说明' }))
    expect(await screen.findByText('核心')).toBeVisible()
    await fireEvent.click(screen.getByRole('button', { name: '刷新贡献' }))
    expect(view.emitted().refresh).toHaveLength(1)
    await fireEvent.click(screen.getByRole('checkbox', { name: '在顶部头像旁显示勋章' }))
    expect(view.emitted()['update:showAvatarBadge']).toEqual([[true]])
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(view.emitted().close).toHaveLength(1)
  })

  it('keeps the verified medal and warns when refreshing is unavailable', async () => {
    await renderWithProviders(CommunityContributionDialog, {
      props: { profile: profile({ stale: true }), failed: true },
    })
    expect(await screen.findByText(/当前展示上次验证的结果/)).toBeVisible()
    expect(screen.getByAltText('卓越 · 界面共建者')).toBeVisible()
  })
})

describe('Community entry', () => {
  it.each([0, 1])('only shows the menu entry when contributions exist: %s', async count => {
    mocks.get.mockImplementation((url: string) =>
      Promise.resolve(
        url === 'github/community'
          ? profile({ total: count, tier: count ? 'bronze' : null, repositories: count ? profile().repositories : [] })
          : {},
      ),
    )
    await renderWithProviders(UserProfile, { initialState: { user: { superUser: true, userID: 1 } } })
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('github/community', expect.anything()))
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('关于 MoviePilot')
    if (count) {
      const entry = await screen.findByText('社区贡献')
      const menuText = entry.closest('.v-list')!.textContent!
      expect(menuText.indexOf('社区贡献')).toBeLessThan(menuText.indexOf('关于'))
    } else {
      expect(screen.queryByText('社区贡献')).not.toBeInTheDocument()
    }
  })

  it('does not query or inherit the instance token for a normal user', async () => {
    await renderWithProviders(UserProfile, { initialState: { user: { superUser: false, userID: 2 } } })
    await fireEvent.contextMenu(screen.getByRole('button', { name: '用户菜单' }))
    await screen.findByText('个人信息')
    expect(mocks.get).not.toHaveBeenCalledWith('github/community', expect.anything())
    expect(screen.queryByText('社区贡献')).not.toBeInTheDocument()
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
