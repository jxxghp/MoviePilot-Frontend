import { describe, expect, it } from 'vitest'
import { engravingInk, layoutPlate } from '@/utils/communityMedalEngrave'

/** 把 rgba() 串拆成数字，比较明暗。 */
function channels(value: string) {
  return value
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
}

describe('community medal engraving ink', () => {
  it.each([
    ['gold', [212, 175, 95]],
    ['rose gold', [214, 150, 130]],
    ['silver', [190, 192, 196]],
  ] as [string, [number, number, number]][])('engraves %s tone on tone without a white outline', (_, metal) => {
    const ink = engravingInk(metal)
    const groove = channels(ink.groove)
    const shadow = channels(ink.shadow)
    const edge = channels(ink.edge)
    // 凹槽是金属深一档的同色，内阴影更深，亮边只比金属略亮。
    groove.forEach((value, index) => expect(value).toBeLessThan(metal[index] * 0.6))
    shadow.forEach((value, index) => expect(value).toBeLessThan(groove[index] + 1))
    edge.forEach((value, index) => expect(value).toBeGreaterThan(metal[index] - 1))
    expect(Math.min(...edge)).toBeLessThan(240)
    groove.forEach((value, index) =>
      expect(value / Math.max(...groove)).toBeCloseTo(metal[index] / Math.max(...metal), 1),
    )
  })

  it('uses a registered ink override for the groove', () => {
    expect(engravingInk([200, 200, 200], '#102030').groove).toBe('rgba(16, 32, 48, 1)')
  })
})

describe('community medal plate layout', () => {
  // 按字号与字数估算行宽，等宽近似足够检验排版规则。
  const measure = (row: { text: string }, size: number) => row.text.length * size * 0.6
  const engraving = {
    title: '织影',
    lines: [
      { text: '核心 · 生态共建者', kind: 'tier' as const },
      { text: '授予 @example-dev', kind: 'recipient' as const },
      { text: '达成 2025.04.02', kind: 'time' as const },
    ],
  }

  it('keeps every row at or above the minimum size and the mark on its own row', () => {
    const layout = layoutPlate(engraving, { width: 600, height: 360 }, 40, measure)
    expect(layout.rows.map(row => row.role)).toEqual(['title', 'tier', 'recipient', 'time', 'mark'])
    expect(layout.rows.every(row => row.fontSize >= 40)).toBe(true)
    expect(layout.rows[0].fontSize).toBeGreaterThan(layout.rows[1].fontSize)
    expect(layout.dropped).toEqual([])
  })

  it('drops the time line before shrinking below the minimum, never the name or the mark', () => {
    const layout = layoutPlate(engraving, { width: 600, height: 300 }, 40, measure)
    expect(layout.dropped).toEqual(['达成 2025.04.02'])
    expect(layout.rows.map(row => row.role)).toEqual(['title', 'tier', 'recipient', 'mark'])
    expect(layout.rows.every(row => row.fontSize >= 40)).toBe(true)
  })

  it('drops the recipient next and keeps the tier, name and mark at the minimum size', () => {
    const layout = layoutPlate(engraving, { width: 600, height: 240 }, 40, measure)
    expect(layout.dropped).toEqual(['达成 2025.04.02', '授予 @example-dev'])
    expect(layout.rows.map(row => row.role)).toEqual(['title', 'tier', 'mark'])
    expect(layout.rows.every(row => row.fontSize >= 40)).toBe(true)
  })

  it('uses one engraving typeface for every row', () => {
    const layout = layoutPlate(engraving, { width: 600, height: 360 }, 40, measure)
    expect(new Set(layout.rows.map(row => row.family)).size).toBe(1)
  })

  it('shrinks below the minimum only as the last resort', () => {
    const layout = layoutPlate(engraving, { width: 600, height: 120 }, 40, measure)
    expect(layout.rows[0].role).toBe('title')
    expect(layout.rows.at(-1)?.role).toBe('mark')
    expect(layout.rows.some(row => row.fontSize < 40)).toBe(true)
  })
})
