<!--
  ============================================================
  VirtualTree - 虚拟滚动树
  ============================================================

  设计目标：
    - 不引入新的虚拟化引擎：VirtualTree = useTreeFlatten + VirtualList
    - useTreeFlatten 按展开状态把树深度优先扁平成一维数组
    - VirtualList 负责虚拟滚动 / 触底加载 / measureElement 防泄漏
    - 业务侧只写「一个节点长什么样」，缩进/展开按钮由业务在 #node slot 里画

  展开状态双模式：
    - 非受控（默认）：组件内部维护，可用 defaultExpandedKeys 设初值
    - 受控：传入 expandedKeys 即进入受控模式，组件只 emit update:expandedKeys

  典型用法（文件树，容器内 scroll）：
    <VirtualTree :nodes="roots" :get-node-id="n => n.path"
                 :estimate-size="32" container-height="60vh">
      <template #node="{ node, depth, expanded, hasChildren, toggle }">
        <div :style="{ paddingInlineStart: `${depth * 16}px` }" @click="hasChildren && toggle()">
          <VIcon v-if="hasChildren">{{ expanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</VIcon>
          {{ node.name }}
        </div>
      </template>
    </VirtualTree>
-->

<script setup lang="ts" generic="T">
import { computed, ref } from 'vue'
import VirtualList from '@/components/virtual/VirtualList.vue'
import { useTreeFlatten } from '@/composables/virtual/useTreeFlatten'

const props = withDefaults(
  defineProps<{
    /** 根节点数组 */
    nodes: T[]
    /** 取节点唯一 id（必填，用作虚拟列表 key + 展开状态键） */
    getNodeId: (node: T) => string | number
    /** 取子节点数组，默认读 node.children */
    getChildren?: (node: T) => T[] | undefined
    /** 估算行高（px） */
    estimateSize?: number
    /** 视口外预渲染项数 */
    overscan?: number
    /** 使用页面 window scroll */
    useWindowScroll?: boolean
    /** 容器内 scroll 模式下的容器高度 */
    containerHeight?: string | number
    /** 受控模式：传入即进入受控，组件只 emit update:expandedKeys */
    expandedKeys?: (string | number)[]
    /** 非受控模式的初始展开 id 列表 */
    defaultExpandedKeys?: (string | number)[]
  }>(),
  {
    getChildren: (node: any) => node?.children,
    estimateSize: 32,
    overscan: 8,
    useWindowScroll: false,
    containerHeight: '100%',
    expandedKeys: undefined,
    defaultExpandedKeys: () => [],
  },
)

const emit = defineEmits<{
  loadMore: []
  'update:expandedKeys': [keys: (string | number)[]]
  toggle: [id: string | number, expanded: boolean]
}>()

// 展开状态：受控（props.expandedKeys 已传）走 emit，非受控走内部 ref。
const internalExpanded = ref<Set<string | number>>(new Set(props.defaultExpandedKeys))
const isControlled = computed(() => props.expandedKeys !== undefined)
const expandedSet = computed<Set<string | number>>(() =>
  isControlled.value ? new Set(props.expandedKeys) : internalExpanded.value,
)

function isExpanded(id: string | number) {
  return expandedSet.value.has(id)
}

function setExpanded(id: string | number, expanded: boolean) {
  const next = new Set(expandedSet.value)
  if (expanded) next.add(id)
  else next.delete(id)
  if (isControlled.value) emit('update:expandedKeys', [...next])
  else internalExpanded.value = next
  emit('toggle', id, expanded)
}

function toggle(id: string | number) {
  setExpanded(id, !expandedSet.value.has(id))
}

// Base Layer：按展开状态扁平化（纯 computed），结果喂给 VirtualList
const flatNodes = useTreeFlatten<T>({
  nodes: () => props.nodes,
  getId: props.getNodeId,
  getChildren: node => props.getChildren(node),
  isExpanded,
})

const listRef = ref<any>(null)

defineExpose({
  toggle,
  expand: (id: string | number) => setExpanded(id, true),
  collapse: (id: string | number) => setExpanded(id, false),
  isExpanded,
  getFlatNodes: () => flatNodes.value,
  scrollToIndex: (idx: number, opts?: { align?: 'start' | 'center' | 'end' | 'auto' }) =>
    listRef.value?.scrollToIndex(idx, opts),
  getScrollElement: () => listRef.value?.getScrollElement?.() ?? null,
})
</script>

<template>
  <VirtualList
    ref="listRef"
    :items="flatNodes"
    key-field="id"
    :estimate-size="estimateSize"
    :overscan="overscan"
    :use-window-scroll="useWindowScroll"
    :container-height="containerHeight"
    @load-more="emit('loadMore')"
  >
    <template #item="{ item }">
      <slot
        name="node"
        :node="item.node"
        :id="item.id"
        :depth="item.depth"
        :expanded="item.expanded"
        :has-children="item.hasChildren"
        :parent-id="item.parentId"
        :toggle="() => toggle(item.id)"
      />
    </template>

    <template #empty>
      <slot name="empty" />
    </template>

    <template #loading>
      <slot name="loading" />
    </template>
  </VirtualList>
</template>
