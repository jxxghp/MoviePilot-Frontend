<script setup lang="ts">
import { computed, useId } from 'vue'
import { FALLBACK_OUTLINE, hexagonVertices, roundedPolygon } from '@/utils/communityMedalGeometry'
import { MEDAL_CATALOG, type MedalKey } from '@/utils/communityMedals'

/**
 * 页面绘制的勋章面：正式渲染图缺失时的后备，造型取 Logo 六边形，配色取目录。
 * 正面画唇边、珐琅表盘、玑镂细纹与线描徽记；背面只画空表盘，刻字由外层叠加。
 */
const props = withDefaults(defineProps<{ medalKey: MedalKey; side?: 'front' | 'back' }>(), { side: 'front' })

const id = useId()
const palette = computed(() => MEDAL_CATALOG[props.medalKey].palette)
const toPoints = (points: readonly number[][]) => points.map(([x, y]) => `${x * 200},${y * 200}`).join(' ')
const rim = toPoints(FALLBACK_OUTLINE)
const dial = toPoints(roundedPolygon(hexagonVertices(0.5, 0.5, 0.36), 0.045))
const guilloche = Array.from({ length: 6 }, (_, i) =>
  toPoints(roundedPolygon(hexagonVertices(0.5, 0.5, 0.33 - i * 0.05), 0.03)),
)
</script>

<template>
  <svg class="medal-face" viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <linearGradient :id="id + 'rim'" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" :stop-color="palette.tone" />
        <stop offset="0.7" :stop-color="palette.enamel[0]" />
        <stop offset="1" :stop-color="palette.tone" />
      </linearGradient>
      <radialGradient :id="id + 'dial'" cx="0.5" cy="0.4" r="0.7">
        <stop offset="0" :stop-color="palette.enamel[0]" />
        <stop offset="1" :stop-color="palette.enamel[1]" />
      </radialGradient>
      <linearGradient :id="id + 'metal'" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" :stop-color="palette.tone" />
      </linearGradient>
    </defs>
    <polygon :points="rim" :fill="`url(#${id}rim)`" />
    <polygon :points="dial" :fill="`url(#${id}dial)`" />
    <polygon
      v-for="(ring, index) in guilloche"
      :key="index"
      :points="ring"
      fill="none"
      :stroke="palette.tone"
      :stroke-opacity="side === 'back' ? 0.08 : 0.14"
    />
    <g v-if="side === 'front'" transform="translate(52 52) scale(6)">
      <path
        :d="MEDAL_CATALOG[medalKey].emblem"
        fill="none"
        :stroke="`url(#${id}metal)`"
        stroke-width="1.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  </svg>
</template>

<style lang="scss" scoped>
.medal-face {
  display: block;
  inline-size: 100%;
  block-size: 100%;
}
</style>
