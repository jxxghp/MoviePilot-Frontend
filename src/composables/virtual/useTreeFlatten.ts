import { computed, type ComputedRef } from 'vue'

/**
 * ============================================================
 * useTreeFlatten - 虚拟滚动 Base Layer：树扁平化
 * ============================================================
 *
 * 把树形数据按「当前展开状态」深度优先扁平成一维数组，
 * 交给 VirtualList 做虚拟滚动。纯 computed，无 DOM 副作用，易测。
 *
 * VirtualTree 即「useTreeFlatten + VirtualList」的组合，
 * 不引入新的虚拟化引擎。
 */
export interface FlatTreeNode<T> {
  /** 原始节点 */
  node: T
  /** 节点唯一 id */
  id: string | number
  /** 层级深度，根节点为 0 */
  depth: number
  /** 是否已展开（仅 hasChildren 时有意义） */
  expanded: boolean
  /** 是否有子节点 */
  hasChildren: boolean
  /** 父节点 id，根节点为 null */
  parentId: string | number | null
}

/**
 * @param nodes        根节点数组的 getter
 * @param getId        取节点唯一 id
 * @param getChildren  取子节点数组（无子节点返回 undefined/[]）
 * @param isExpanded   判断某 id 当前是否展开
 */
export function useTreeFlatten<T>(opts: {
  nodes: () => T[]
  getId: (node: T) => string | number
  getChildren: (node: T) => T[] | undefined
  isExpanded: (id: string | number) => boolean
}): ComputedRef<FlatTreeNode<T>[]> {
  return computed(() => {
    const out: FlatTreeNode<T>[] = []

    const walk = (list: T[], depth: number, parentId: string | number | null) => {
      for (const node of list) {
        const id = opts.getId(node)
        const children = opts.getChildren(node)
        const hasChildren = !!children && children.length > 0
        const expanded = hasChildren && opts.isExpanded(id)
        out.push({ node, id, depth, expanded, hasChildren, parentId })
        if (expanded && children) walk(children, depth + 1, id)
      }
    }

    walk(opts.nodes(), 0, null)
    return out
  })
}
