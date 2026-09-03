<script lang="ts" setup>
import type { GlassFixedShellBackplateLayer } from '@/composables/useGlassFixedShellBackplate'

interface Props {
  /** 移动端 overlay 导航当前是否可见。 */
  isOverlayNavActive: boolean
  /** 当前布局是否使用移动端 overlay 导航。 */
  isOverlayNav: boolean
  /** App 壁纸状态机提供的稳定双槽位。 */
  layers: readonly GlassFixedShellBackplateLayer[]
  /** 与全局壁纸事务一致的交叉淡化时长。 */
  transitionDurationMs: number
}

const props = defineProps<Props>()
const transitionStyle = computed(() => ({
  '--glass-fixed-shell-transition-duration': `${Math.max(0, props.transitionDurationMs)}ms`,
}))
</script>

<template>
  <div
    class="glass-fixed-shell-backplate glass-fixed-shell-backplate--main"
    data-backplate-surface="main"
    :style="transitionStyle"
    aria-hidden="true"
  >
    <div
      v-for="layer in layers"
      :key="layer.key"
      class="glass-fixed-shell-backplate__layer"
      :class="`is-${layer.role}`"
      :data-backplate-slot="layer.key"
    >
      <div class="glass-fixed-shell-backplate__wallpaper" :style="layer.style">
        <img
          v-if="layer.src"
          class="glass-fixed-shell-backplate__source"
          :crossorigin="layer.crossOrigin"
          :src="layer.src"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
    </div>
  </div>

  <div
    v-if="isOverlayNav"
    class="glass-fixed-shell-backplate glass-fixed-shell-backplate--overlay-nav"
    :class="{ 'is-visible': isOverlayNavActive }"
    data-backplate-surface="overlay-nav"
    :style="transitionStyle"
    aria-hidden="true"
  >
    <div
      v-for="layer in layers"
      :key="layer.key"
      class="glass-fixed-shell-backplate__layer"
      :class="`is-${layer.role}`"
      :data-backplate-slot="layer.key"
    >
      <div class="glass-fixed-shell-backplate__wallpaper" :style="layer.style">
        <img
          v-if="layer.src"
          class="glass-fixed-shell-backplate__source"
          :crossorigin="layer.crossOrigin"
          :src="layer.src"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@use '@configured-variables' as variables;
@use '@layouts/styles/mixins';

.glass-fixed-shell-backplate {
  position: fixed;
  overflow: hidden;
  contain: strict;
  inset: 0;
  isolation: isolate;
  pointer-events: none;
}

.glass-fixed-shell-backplate--main {
  --glass-fixed-shell-nav-inline-size: #{variables.$layout-vertical-nav-width};

  z-index: variables.$layout-vertical-nav-layout-navbar-z-index - 1;
  clip-path: polygon(
    0 0,
    calc(100% - 0.5rem) 0,
    calc(100% - 0.5rem) var(--layout-navbar-block-size),
    var(--glass-fixed-shell-nav-inline-size) var(--layout-navbar-block-size),
    var(--glass-fixed-shell-nav-inline-size) 100%,
    0 100%
  );
  transition: clip-path 240ms var(--mp-motion-ease-standard);
}

.layout-wrapper.layout-vertical-nav-collapsed > .glass-fixed-shell-backplate--main {
  --glass-fixed-shell-nav-inline-size: #{variables.$layout-vertical-nav-collapsed-width};
}

.layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav, .layout-app-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0);
}

.layout-wrapper.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell):not(
    .layout-window-controls-overlay-shell
  )
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 100% 0);
}

.layout-wrapper.layout-app-shell:is(
    .layout-standalone-pwa-shell,
    .layout-window-controls-overlay-shell
  ).layout-navbar-compact
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-safe-area-top)) 0);
}

.layout-wrapper.layout-navbar-floating-eligible > .glass-fixed-shell-backplate--main {
  transform: translate3d(0, 0, 0) scaleX(1);
  transform-origin: center top;
  transition: transform var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing);
}

.layout-wrapper.layout-navbar-floating-eligible.layout-navbar-away-from-top > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0 round var(--shell-floating-navbar-radius));
  transform: translate3d(0, var(--shell-floating-navbar-inset), 0) scaleX(var(--shell-floating-navbar-scale-x));
}

[dir='rtl'] .layout-wrapper > .glass-fixed-shell-backplate--main {
  clip-path: polygon(
    0.5rem 0,
    100% 0,
    100% 100%,
    calc(100% - var(--glass-fixed-shell-nav-inline-size)) 100%,
    calc(100% - var(--glass-fixed-shell-nav-inline-size)) var(--layout-navbar-block-size),
    0.5rem var(--layout-navbar-block-size)
  );
}

[dir='rtl']
  .layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav, .layout-app-shell)
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0);
}

[dir='rtl']
  .layout-wrapper.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell):not(
    .layout-window-controls-overlay-shell
  )
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 100% 0);
}

[dir='rtl']
  .layout-wrapper.layout-app-shell:is(
    .layout-standalone-pwa-shell,
    .layout-window-controls-overlay-shell
  ).layout-navbar-compact
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-safe-area-top)) 0);
}

[dir='rtl']
  .layout-wrapper.layout-navbar-floating-eligible.layout-navbar-away-from-top
  > .glass-fixed-shell-backplate--main {
  clip-path: inset(0 0 calc(100% - var(--layout-navbar-block-size)) 0 round var(--shell-floating-navbar-radius));
}

.glass-fixed-shell-backplate--overlay-nav {
  z-index: variables.$layout-vertical-nav-z-index - 1;
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.25s ease-in-out;

  &.is-visible {
    clip-path: inset(0 calc(100% - #{variables.$layout-vertical-nav-width}) 0 0);
  }

  @include mixins.rtl {
    clip-path: inset(0 0 0 100%);

    &.is-visible {
      clip-path: inset(0 0 0 calc(100% - #{variables.$layout-vertical-nav-width}));
    }
  }
}

.glass-fixed-shell-backplate__layer {
  position: absolute;
  filter: var(--glass-fixed-shell-backplate-filter);
  inset: 0;
  opacity: 0;
  transition: opacity var(--glass-fixed-shell-transition-duration, 1500ms) ease;
  will-change: opacity;

  &.is-active {
    z-index: 2;
    opacity: 0.92;
  }

  &.is-previous {
    z-index: 1;
  }
}

.glass-fixed-shell-backplate__wallpaper {
  position: absolute;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  filter: brightness(var(--glass-wallpaper-brightness, 0.82)) saturate(0.9);
  inset: 0;

  &::after {
    position: absolute;
    background: linear-gradient(rgba(6, 10, 19, 24%) 0%, rgba(6, 10, 19, 48%) 100%), rgba(11, 19, 34, 8%);
    content: '';
    inset: 0;
  }
}

.glass-fixed-shell-backplate__source {
  position: absolute;
  display: block;
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .glass-fixed-shell-backplate,
  .glass-fixed-shell-backplate__layer {
    transition-duration: 0.01ms !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .glass-fixed-shell-backplate {
    display: none;
  }
}
</style>
