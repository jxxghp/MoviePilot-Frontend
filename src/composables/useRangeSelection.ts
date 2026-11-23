/** 列表连选所需的数据边界，由各列表提供自己的显示顺序和选中状态存储。 */
export interface RangeSelectionOptions<T> {
  /** 当前显示顺序的列表项；被筛选隐藏或位于折叠分组内的项不应包含在内，避免连选到看不见的记录 */
  items: () => readonly T[]
  /** 列表项的稳定键，用于在显示列表变化后重新定位起点 */
  getKey: (item: T) => PropertyKey
  /** 判断列表项当前是否已选中 */
  isSelected: (item: T) => boolean
  /** 同步批量设置列表项的选中状态 */
  setSelected: (items: readonly T[], checked: boolean) => void
}

/**
 * 列表按住 Shift 连选。
 *
 * 最近一次勾选的项作为起点；按住 Shift 勾选另一项时，把当前显示顺序中从起点到该项的整段设为起点的勾选状态，
 * 即起点刚被勾选则整段勾选、刚被取消则整段取消。起点已不在显示列表中时只切换当前项。
 */
export function useRangeSelection<T>(options: RangeSelectionOptions<T>) {
  let anchorKey: PropertyKey | null = null
  // 复选框的状态更新事件不带键盘修饰键，由先触发的点击事件记录是否按住 Shift
  let checkboxShiftKey = false

  /** 勾选列表项；extendRange 为真时按起点连选。 */
  function select(item: T, checked: boolean, extendRange = false) {
    const items = options.items()
    const itemKey = options.getKey(item)
    const anchorIndex =
      extendRange && anchorKey !== null ? items.findIndex(entry => options.getKey(entry) === anchorKey) : -1
    const itemIndex = items.findIndex(entry => options.getKey(entry) === itemKey)

    if (anchorIndex >= 0 && itemIndex >= 0) {
      const [start, end] = anchorIndex < itemIndex ? [anchorIndex, itemIndex] : [itemIndex, anchorIndex]
      options.setSelected(items.slice(start, end + 1), options.isSelected(items[anchorIndex]))
    } else {
      options.setSelected([item], checked)
    }
    anchorKey = itemKey
  }

  /** 记录复选框点击时是否按住 Shift，供随后的状态更新决定是否连选。 */
  function onCheckboxClick(event: MouseEvent) {
    checkboxShiftKey = event.shiftKey
  }

  /** 复选框状态更新时按记录的 Shift 状态勾选。 */
  function selectFromCheckbox(item: T, checked: boolean) {
    select(item, checked, checkboxShiftKey)
    checkboxShiftKey = false
  }

  /** input 冒泡时选择已同步更新；范围可能保留原状态，需校正浏览器提前切换的原生勾选值。 */
  function onCheckboxInput(item: T, event: Event) {
    const input = event.target
    if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      input.checked = options.isSelected(item)
    }
  }

  /** 清除起点和临时按键状态，用于退出选择模式或切换数据源。 */
  function reset() {
    anchorKey = null
    checkboxShiftKey = false
  }

  return { select, onCheckboxClick, selectFromCheckbox, onCheckboxInput, reset }
}
