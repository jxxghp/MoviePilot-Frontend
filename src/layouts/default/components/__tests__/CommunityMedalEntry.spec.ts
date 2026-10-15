import CommunityMedalEntry from '../CommunityMedalEntry.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen } from '@testing-library/vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CommunityMedalRecord } from '@/utils/communityMedals'

const art = vi.hoisted(() =>
  vi.fn((key: string, tier?: number): { badge: string } | null => ({ badge: `/assets/${key}-badge-t${tier}.webp` })),
)
vi.mock('@/utils/communityMedalArt', () => ({ medalArt: art }))

const worn = { key: 'code', tier: 2 } as CommunityMedalRecord

describe('CommunityMedalEntry', () => {
  it('未佩戴时显示线框勋章图标，点击按新勋章优先打开展台', async () => {
    const { emitted } = await renderWithProviders(CommunityMedalEntry)
    const button = screen.getByRole('button', { name: '社区勋章' })
    expect(button).toHaveAttribute('title', '社区勋章')
    expect(button.querySelector('.v-icon')).toBeInTheDocument()
    expect(document.querySelector('.v-badge__badge')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(emitted().open).toEqual([['']])
  })

  it('有没看过的新勋章时图标带红点', async () => {
    await renderWithProviders(CommunityMedalEntry, { props: { unseen: true } })
    expect(screen.getByRole('button', { name: '社区勋章 · 新勋章' })).toBeInTheDocument()
    expect(document.querySelector('.v-badge__badge')).toBeInTheDocument()
  })

  it('佩戴时换成所持档位的正面小图，不加底座，提示里保留勋章名，点击停在这一枚', async () => {
    const { emitted } = await renderWithProviders(CommunityMedalEntry, { props: { worn, unseen: true } })
    const button = screen.getByRole('button', { name: '编剧勋章，打开社区勋章' })
    expect(button).toHaveAttribute('title', '编剧勋章，打开社区勋章')
    expect(art).toHaveBeenCalledWith('code', 2)
    expect(button.querySelector('img.community-medal-entry__badge')).toHaveAttribute(
      'src',
      '/assets/code-badge-t2.webp',
    )
    expect(button.querySelector('.v-icon')).not.toBeInTheDocument()
    expect(document.querySelector('.v-badge__badge')).not.toBeInTheDocument()
    await fireEvent.click(button)
    expect(emitted().open).toEqual([['code']])
  })

  it('佩戴的勋章缺小图时退回线框勋章图标', async () => {
    art.mockReturnValueOnce(null)
    await renderWithProviders(CommunityMedalEntry, { props: { worn } })
    const button = screen.getByRole('button', { name: '编剧勋章，打开社区勋章' })
    expect(button.querySelector('img')).not.toBeInTheDocument()
    expect(button.querySelector('.v-icon')).toBeInTheDocument()
  })

  it('功能不可用时顶栏不渲染入口，头像菜单入口仍保留', () => {
    const profile = readFileSync(resolve('src/layouts/default/components/UserProfile.vue'), 'utf8')
    expect(profile).toMatch(/<CommunityMedalEntry\s+v-if="community\.eligible\.value"/)
    expect(profile).toMatch(/<VListItem v-if="community\.eligible\.value" link @click="showCommunityDialog\(\)"/)
  })
})
