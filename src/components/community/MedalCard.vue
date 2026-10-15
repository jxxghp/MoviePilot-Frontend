<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import MedalFace from '@/components/community/MedalFace.vue'
import type { MedalArt } from '@/utils/communityMedalArt'
import { engraveBack, loadMedalImage } from '@/utils/communityMedalEngrave'
import { ENGRAVING_FONT, type MedalEngraving, type MedalKey } from '@/utils/communityMedals'

/**
 * 不用 WebGL 的勋章：正反两面叠成一枚可以翻的卡片，指针移动时朝它倾斜（最多 ±18°，再大就看得出是薄片），
 * 一道窄镜面亮线与一片主色柔光随倾斜移动，都用渲染图的透明通道裁剪，只落在勋章本体上。
 * 有渲染图时用两张图，背面刻字与精绘同一套画布刻法；缺图时用页面绘制的六边形，刻字以文字叠加。
 * 减少动态效果时不自动摆动，翻面没有过渡。
 */
const props = defineProps<{
  medalKey: MedalKey
  art: MedalArt | null
  engraving: MedalEngraving
  reducedMotion: boolean
}>()

const { t } = useI18n()
const TILT = 18
const root = ref<HTMLElement | null>(null)
const tilt = ref({ x: 0, y: 0 })
const flipped = ref(false)
const active = ref(false)
// 轻点才翻面，拖动之后松手不翻。
let moved = 0
let frame = 0

/** 没有指针时缓慢摆动，让高光自己走一走。 */
function sway() {
  cancelAnimationFrame(frame)
  if (active.value || props.reducedMotion) return
  const start = performance.now()
  const step = (now: number) => {
    const time = (now - start) / 1000
    tilt.value = { x: Math.sin(time * 0.5) * 6, y: Math.sin(time * 0.37) * 3 }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}
watch([active, () => props.reducedMotion], sway, { immediate: true })
onBeforeUnmount(() => cancelAnimationFrame(frame))

function follow(event: PointerEvent) {
  const box = root.value?.getBoundingClientRect()
  if (!box?.width) return
  const px = (event.clientX - box.left) / box.width - 0.5
  const py = (event.clientY - box.top) / box.height - 0.5
  moved += Math.abs(event.movementX) + Math.abs(event.movementY)
  tilt.value = { x: Math.max(-1, Math.min(1, px * 2)) * TILT, y: Math.max(-1, Math.min(1, py * 2)) * TILT }
}

function enter(event: PointerEvent) {
  moved = 0
  active.value = true
  follow(event)
}

function release(event: PointerEvent) {
  if (event.pointerType !== 'mouse' && moved > 6) active.value = false
}

function leave() {
  active.value = false
  if (props.reducedMotion) tilt.value = { x: 0, y: 0 }
}

function flip() {
  if (moved < 6 || !active.value) flipped.value = !flipped.value
}

// 光的位置跟着倾斜走：朝左转时亮线从右往左扫，柔光落在朝光的一侧。
const sweep = computed(() => 50 - tilt.value.x * 2.6 + tilt.value.y * 1.2)
const light = computed(() => ({ x: 50 - tilt.value.x * 2, y: 35 + tilt.value.y * 2 }))
function masked(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
  }
}
function streak(src: string): CSSProperties {
  const at = sweep.value
  return {
    ...masked(src),
    background: `linear-gradient(115deg, transparent ${at - 7}%, rgb(255 255 255 / 0.55) ${at - 1}%, rgb(255 255 255 / 0.85) ${at}%, rgb(255 255 255 / 0.4) ${at + 2}%, transparent ${at + 8}%)`,
    mixBlendMode: 'overlay',
  }
}
function glow(src: string, tone: string): CSSProperties {
  const { x, y } = light.value
  return {
    ...masked(src),
    background: `radial-gradient(60% 55% at ${x}% ${y}%, ${tone}55, transparent 70%), radial-gradient(70% 60% at ${100 - x}% ${100 - y}%, rgb(0 0 0 / 0.35), transparent 75%)`,
    mixBlendMode: 'soft-light',
  }
}

// 有渲染图时把刻字画进背面图，与精绘、保存图片一致；生成之前先显示未刻字的背面。
const engravedBack = ref<string | null>(null)
watch(
  [() => props.art, () => JSON.stringify(props.engraving)],
  async () => {
    engravedBack.value = null
    const art = props.art
    if (!art) return
    try {
      const [image, shapes] = await Promise.all([
        loadMedalImage(art.back),
        art.shapes ? art.shapes().catch(() => null) : Promise.resolve(null),
      ])
      if (props.art !== art) return
      engravedBack.value = engraveBack(
        image,
        art,
        props.engraving,
        shapes?.back ?? null,
        root.value?.clientWidth,
      ).toDataURL('image/png')
    } catch {
      engravedBack.value = null
    }
  },
  { immediate: true },
)
// 页面绘制的后备背面：刻字叠在六边形表盘中央。
const dial = { x: 0.5, y: 0.5, width: 0.52 }
const ink = '#f2f0f8'
const bodyStyle = computed(() => ({
  transform: `rotateX(${-tilt.value.y}deg) rotateY(${tilt.value.x + (flipped.value ? 180 : 0)}deg)`,
}))

defineExpose({ flipped })
</script>

<template>
  <div
    ref="root"
    class="medal-card"
    role="button"
    tabindex="0"
    :aria-label="t('community.flip')"
    :aria-pressed="flipped"
    @pointerenter="enter"
    @pointerdown="moved = 0"
    @pointermove="follow"
    @pointerleave="leave"
    @pointerup="release"
    @click="flip"
    @keydown.enter.prevent="flipped = !flipped"
    @keydown.space.prevent="flipped = !flipped"
  >
    <div
      class="medal-card__body"
      :class="{ 'is-active': active, 'is-still': reducedMotion }"
      :style="bodyStyle"
      data-testid="medal-card-body"
    >
      <div class="medal-card__face">
        <template v-if="art">
          <img :src="art.front" alt="" draggable="false" class="medal-card__image" />
          <div class="medal-card__light" :style="glow(art.front, art.tone)" />
          <div class="medal-card__light" :style="streak(art.front)" />
        </template>
        <MedalFace v-else :medal-key="medalKey" class="medal-card__image" />
      </div>
      <div class="medal-card__face medal-card__face--back">
        <img v-if="art" :src="engravedBack ?? art.back" alt="" draggable="false" class="medal-card__image" />
        <MedalFace v-else :medal-key="medalKey" side="back" class="medal-card__image" />
        <div v-if="!art" class="medal-card__engraving">
          <div
            class="medal-card__dial"
            :style="{
              left: dial.x * 100 + '%',
              top: dial.y * 100 + '%',
              width: dial.width * 100 + '%',
              color: ink,
              fontFamily: ENGRAVING_FONT,
              '--dial': dial.width,
            }"
          >
            <p class="medal-card__title">{{ engraving.title }}</p>
            <p
              v-for="(line, index) in engraving.lines"
              :key="index"
              class="medal-card__line"
              :class="'medal-card__line--' + line.kind"
            >
              {{ line.text }}
            </p>
          </div>
        </div>
        <div v-if="art" class="medal-card__light" :style="streak(art.back)" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 刻进珐琅的字：下沿暗影、上沿亮线。
$carved:
  0 1px 0 rgb(0 0 0 / 60%),
  0 -1px 0 rgb(255 255 255 / 18%);

.medal-card {
  position: relative;
  inline-size: 100%;
  aspect-ratio: 1;
  cursor: pointer;
  perspective: 1100px;
  touch-action: none;
  user-select: none;
  outline: none;

  &:focus-visible {
    border-radius: var(--app-control-radius);
    box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  }

  &__body {
    position: relative;
    inline-size: 100%;
    block-size: 100%;
    transform-style: preserve-3d;
    transition: transform 0.7s ease-out;

    &.is-active {
      transition-duration: 0.1s;
    }

    &.is-still {
      transition: none;
    }
  }

  &__face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;

    &--back {
      transform: rotateY(180deg);
    }
  }

  &__image {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: contain;
    filter: drop-shadow(0 24px 40px rgb(0 0 0 / 55%));
  }

  &__light,
  &__engraving {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &__engraving {
    container-type: inline-size;
  }

  // 字号按刻字区宽度缩放（cqw 随勋章宽度变化），与精绘贴图的排版比例一致。
  &__dial {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transform: translate(-50%, -50%);
  }

  &__title {
    margin: 0;
    font-size: calc(var(--dial) * 15cqw);
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1.4;
    text-shadow: $carved;
  }

  &__line {
    margin: calc(var(--dial) * 1.6cqw) 0 0;
    font-size: calc(var(--dial) * 5.6cqw);
    font-weight: 700;
    line-height: 1.4;
    opacity: 0.9;
    text-shadow: $carved;
    overflow-wrap: anywhere;
  }

  &__title + &__line {
    margin-block-start: calc(var(--dial) * 3cqw);
  }
}
</style>
