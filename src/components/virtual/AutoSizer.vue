<!--
  ============================================================
  AutoSizer - 测量自身容器尺寸并通过 slot 传给子虚拟组件
  ============================================================

  设计目标：
    - 把「容器宽高测量」职责从虚拟化组件里拿出来（react-virtualized 经典分层）
    - 虚拟化组件只接受显式 width/height/columns，不再内部 ResizeObserver
    - 容器自适应需求由本组件 + 业务计算（如 useResponsiveCols）解决

  原理：
    - 用 `@vueuse/core` 的 `useElementSize` 观察自身根 div
    - 默认 100% 宽高填满父容器；父容器必须给出有限尺寸（弹性盒/网格/显式 height）
    - 把 { width, height } 通过默认 slot 暴露给子内容

  典型用法（dashboard 卡片里的可变宽网格）：
    <VCard>
      <VCardItem>...</VCardItem>
      <AutoSizer #default="{ width }">
        <VirtualGrid :columns="Math.max(1, Math.floor(width / 240))"
                     :container-height="'10rem'" ... />
      </AutoSizer>
    </VCard>

  注意：
    - 父容器必须有有限宽（CSS 默认 100% 即可）和高度（dashboard 卡片有明确 block-size）
    - 首次渲染时 width/height 为 0 直到 useElementSize 第一帧回写。
      子组件应能容忍 cols=最小值（useResponsiveCols 默认 min=1）。
-->

<script setup lang="ts">
import { ref } from 'vue'
import { useElementSize } from '@vueuse/core'

defineProps<{
  /** 透传到根 div 的额外 class */
  class?: string | string[] | Record<string, boolean>
}>()

const rootRef = ref<HTMLElement | null>(null)
const { width, height } = useElementSize(rootRef)

defineExpose({
  getRootElement: () => rootRef.value,
})
</script>

<template>
  <div ref="rootRef" :class="['virtual-auto-sizer', $props.class]">
    <slot :width="width" :height="height" :root-ref="rootRef" />
  </div>
</template>

<style scoped>
.virtual-auto-sizer {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
}
</style>
