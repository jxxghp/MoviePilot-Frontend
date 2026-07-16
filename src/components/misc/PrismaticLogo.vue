<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import logoUrl from '@images/logo.svg'

const rootRef = ref<HTMLDivElement | null>(null)
const logoMaskStyle = { '--logo-mask': `url("${logoUrl}")` }

let pointerFrame: number | null = null
let pendingPointerX = 0.5
let pendingPointerY = 0.42

/** 将指针位置映射为同一套棱镜反射和轻微空间倾角。 */
function renderPointerResponse() {
  pointerFrame = null
  const root = rootRef.value
  if (!root) return

  root.style.setProperty('--logo-light-x', `${(pendingPointerX * 100).toFixed(2)}%`)
  root.style.setProperty('--logo-light-y', `${(pendingPointerY * 100).toFixed(2)}%`)
  root.style.setProperty('--logo-tilt-x', `${((0.5 - pendingPointerY) * 7).toFixed(2)}deg`)
  root.style.setProperty('--logo-tilt-y', `${((pendingPointerX - 0.5) * 9).toFixed(2)}deg`)
}

function queuePointerResponse() {
  if (pointerFrame === null) pointerFrame = window.requestAnimationFrame(renderPointerResponse)
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const bounds = rootRef.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return

  pendingPointerX = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  pendingPointerY = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
  queuePointerResponse()
}

function resetPointerResponse() {
  pendingPointerX = 0.5
  pendingPointerY = 0.42
  queuePointerResponse()
}

onBeforeUnmount(() => {
  if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame)
})
</script>

<template>
  <div
    ref="rootRef"
    class="prismatic-logo"
    :style="logoMaskStyle"
    role="img"
    aria-label="MoviePilot"
    @pointermove="handlePointerMove"
    @pointerleave="resetPointerResponse"
  >
    <img :src="logoUrl" class="prismatic-logo__base" alt="" draggable="false" aria-hidden="true" />
    <span class="prismatic-logo__spectrum" aria-hidden="true" />
    <span class="prismatic-logo__specular" aria-hidden="true" />
    <span class="prismatic-logo__reveal" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.prismatic-logo {
  --logo-light-x: 50%;
  --logo-light-y: 42%;
  --logo-tilt-x: 0deg;
  --logo-tilt-y: 0deg;

  position: relative;
  display: grid;
  isolation: isolate;
  block-size: 108px;
  inline-size: 108px;
  place-items: center;
  transform: perspective(520px) rotateX(var(--logo-tilt-x)) rotateY(var(--logo-tilt-y));
  transform-style: preserve-3d;
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  animation: prismatic-logo-enter 620ms cubic-bezier(0.16, 1, 0.3, 1) 80ms backwards;
}

.prismatic-logo::before {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(142, 85, 255, 0.3), rgba(77, 36, 145, 0.1) 44%, transparent 72%);
  content: '';
  filter: blur(13px);
  inset: 17%;
  opacity: 0.74;
  transform: translate3d(0, 8px, -16px) scaleX(1.18);
}

.prismatic-logo__base,
.prismatic-logo__spectrum,
.prismatic-logo__specular,
.prismatic-logo__reveal {
  position: absolute;
  display: block;
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  pointer-events: none;
  user-select: none;
}

.prismatic-logo__base {
  filter:
    drop-shadow(0 8px 12px rgba(24, 8, 52, 0.3))
    drop-shadow(0 0 10px rgba(139, 92, 246, 0.22));
  object-fit: contain;
  padding: 7px;
  transform: translateZ(10px);
}

.prismatic-logo__spectrum,
.prismatic-logo__specular,
.prismatic-logo__reveal {
  -webkit-mask: var(--logo-mask) center / calc(100% - 14px) calc(100% - 14px) no-repeat;
  mask: var(--logo-mask) center / calc(100% - 14px) calc(100% - 14px) no-repeat;
}

.prismatic-logo__spectrum {
  background:
    radial-gradient(
      circle at var(--logo-light-x) var(--logo-light-y),
      rgba(255, 255, 255, 0.95),
      rgba(210, 188, 255, 0.66) 13%,
      transparent 36%
    ),
    conic-gradient(
      from 218deg at var(--logo-light-x) var(--logo-light-y),
      rgba(255, 105, 210, 0.72),
      rgba(117, 212, 255, 0.72),
      rgba(177, 139, 255, 0.82),
      rgba(255, 214, 246, 0.7),
      rgba(255, 105, 210, 0.72)
    );
  mix-blend-mode: screen;
  opacity: 0.58;
  transform: translateZ(14px);
}

.prismatic-logo__specular {
  background: radial-gradient(
    ellipse 28% 20% at var(--logo-light-x) var(--logo-light-y),
    rgba(255, 255, 255, 0.96),
    rgba(232, 219, 255, 0.52) 28%,
    transparent 72%
  );
  mix-blend-mode: screen;
  opacity: 0.76;
  transform: translateZ(18px);
}

.prismatic-logo__reveal {
  background: linear-gradient(
    112deg,
    transparent 30%,
    rgba(255, 255, 255, 0.18) 39%,
    rgba(255, 255, 255, 0.98) 48%,
    rgba(125, 211, 252, 0.62) 54%,
    transparent 66%
  );
  background-position: 100% 50%;
  background-size: 300% 100%;
  mix-blend-mode: screen;
  transform: translateZ(20px);
  animation: prismatic-logo-reveal 840ms cubic-bezier(0.2, 0.76, 0.18, 1) 160ms both;
}

@keyframes prismatic-logo-enter {
  0% {
    opacity: 0;
    transform: perspective(520px) translateY(10px) scale(0.82) rotateX(-8deg) rotateY(10deg);
  }

  62% {
    opacity: 1;
    transform: perspective(520px) translateY(-2px) scale(1.025) rotateX(1deg) rotateY(-1deg);
  }

  100% {
    opacity: 1;
    transform: perspective(520px) translateY(0) scale(1) rotateX(0) rotateY(0);
  }
}

@keyframes prismatic-logo-reveal {
  0% {
    background-position: 100% 50%;
    opacity: 0;
  }

  24% {
    opacity: 1;
  }

  100% {
    background-position: 0% 50%;
    opacity: 0;
  }
}

@media (width <= 480px) {
  .prismatic-logo {
    block-size: 92px;
    inline-size: 92px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prismatic-logo,
  .prismatic-logo__reveal {
    animation: none;
    transform: none;
    transition: none;
  }

  .prismatic-logo__reveal {
    display: none;
  }
}
</style>
