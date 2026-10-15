import { waitFor } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import MedalStage from '@/components/community/MedalStage.vue'

const relief = vi.hoisted(() => {
  const instance = {
    show: vi.fn(() => Promise.resolve()),
    prepare: vi.fn(),
    snapshot: vi.fn(() => null),
    bounds: vi.fn(() => ({ top: 0.1, bottom: 0.9 })),
    dispose: vi.fn(),
  }
  return { instance, createReliefRenderer: vi.fn(() => instance) }
})
vi.mock('@/utils/communityMedalRelief', () => ({ createReliefRenderer: relief.createReliefRenderer }))

const engraving = { title: '掌灯', lines: [] }

describe('MedalStage', () => {
  it('keeps one WebGL renderer for the whole hall and releases it on close', async () => {
    // jsdom 没有 WebGL；声明这个构造函数让展台走精绘分支，渲染器本身已被替身代替。
    vi.stubGlobal('WebGLRenderingContext', function WebGLRenderingContext() {})
    const view = await renderWithProviders(MedalStage, {
      props: { medalKey: 'helper', engraving, reducedMotion: true },
    })
    await waitFor(() => expect(relief.instance.show).toHaveBeenCalledTimes(1))
    await view.rerender({ medalKey: 'security', engraving: { title: '守夜', lines: [] }, reducedMotion: true })
    await waitFor(() => expect(relief.instance.show).toHaveBeenCalledTimes(2))
    await view.rerender({ medalKey: 'code', tier: 2, engraving: { title: '织影', lines: [] }, reducedMotion: true })
    await waitFor(() => expect(relief.instance.show).toHaveBeenCalledTimes(3))
    expect(relief.createReliefRenderer).toHaveBeenCalledTimes(1)
    // 每次就绪后都把接下来可能切到的勋章交给渲染器在后台先搭好。
    expect(relief.instance.prepare).toHaveBeenCalled()
    expect(view.container.querySelectorAll('canvas')).toHaveLength(1)
    expect(view.emitted().bounds?.at(-1)).toEqual([{ top: 0.1, bottom: 0.9 }])
    view.unmount()
    expect(relief.instance.dispose).toHaveBeenCalledTimes(1)
  })
})
