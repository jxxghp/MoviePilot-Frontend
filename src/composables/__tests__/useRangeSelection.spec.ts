import { useRangeSelection } from '@/composables/useRangeSelection'
import { describe, expect, it } from 'vitest'

/** 用字符串列表和集合模拟调用方的显示顺序与选中状态。 */
function createList(initial: string[]) {
  let items = [...initial]
  const selected = new Set<string>()
  const selection = useRangeSelection<string>({
    items: () => items,
    getKey: item => item,
    isSelected: item => selected.has(item),
    setSelected: (rangeItems, checked) =>
      rangeItems.forEach(item => (checked ? selected.add(item) : selected.delete(item))),
  })
  return {
    selection,
    selected: () => [...selected].sort(),
    setItems: (next: string[]) => {
      items = next
    },
  }
}

describe('useRangeSelection', () => {
  it('extends the anchor state across the displayed range in either direction', () => {
    const list = createList(['a', 'b', 'c', 'd', 'e'])

    list.selection.select('d', true)
    list.selection.select('b', true, true)
    expect(list.selected()).toEqual(['b', 'c', 'd'])

    list.selection.select('c', false)
    list.selection.select('e', true, true)
    expect(list.selected()).toEqual(['b'])
  })

  it('toggles only the target when the anchor is no longer displayed or was reset', () => {
    const list = createList(['a', 'b', 'c', 'd'])
    list.selection.select('a', true)
    list.setItems(['b', 'c', 'd'])
    list.selection.select('d', true, true)
    expect(list.selected()).toEqual(['a', 'd'])

    list.selection.reset()
    list.selection.select('b', true, true)
    expect(list.selected()).toEqual(['a', 'b', 'd'])
  })

  it('clears a pending checkbox modifier when resetting the selection session', () => {
    const list = createList(['a', 'b', 'c', 'd'])
    list.selection.onCheckboxClick(new MouseEvent('click', { shiftKey: true }))
    list.selection.reset()
    list.selection.select('b', true)
    list.selection.selectFromCheckbox('d', true)
    expect(list.selected()).toEqual(['b', 'd'])
  })

  it('uses the Shift state recorded by the preceding checkbox click once', () => {
    const list = createList(['a', 'b', 'c'])
    list.selection.selectFromCheckbox('a', true)
    list.selection.onCheckboxClick(new MouseEvent('click', { shiftKey: true }))
    list.selection.selectFromCheckbox('c', true)
    expect(list.selected()).toEqual(['a', 'b', 'c'])

    list.selection.selectFromCheckbox('b', false)
    expect(list.selected()).toEqual(['a', 'c'])
  })
})
