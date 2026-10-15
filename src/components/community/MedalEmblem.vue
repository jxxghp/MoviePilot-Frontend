<script setup lang="ts">
import { computed } from 'vue'
import { MEDAL_CATALOG, type MedalKey } from '@/utils/communityMedals'

/**
 * 勋章的线描徽记：16 格画布、单线圆头，颜色跟随文字色（currentColor）。
 * 用于展台切换标签与空状态的勋章介绍，比缩小的渲染图更清楚。
 */
const props = withDefaults(defineProps<{ medalKey: MedalKey; size?: number; stroke?: number }>(), {
  size: 16,
  stroke: 1.4,
})
const path = computed(() => MEDAL_CATALOG[props.medalKey].emblem)
</script>

<template>
  <svg
    class="medal-emblem"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="path" />
  </svg>
</template>

<style scoped>
.medal-emblem {
  flex: none;
}
</style>
