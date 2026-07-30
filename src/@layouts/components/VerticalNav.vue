<script lang="ts" setup>
import type { Component } from 'vue'
import { useDisplay } from 'vuetify'
import ThemeLogoMark from '@/components/misc/ThemeLogoMark.vue'

interface Props {
  tag?: string | Component
  isOverlayNavActive: boolean
  toggleIsOverlayNavActive: (value: boolean) => void
}

const props = withDefaults(defineProps<Props>(), {
  tag: 'aside',
})

const { mdAndDown } = useDisplay()
const refNav = ref()
const route = useRoute()

watch(
  () => route.path,
  () => {
    props.toggleIsOverlayNavActive(false)
  },
)

// 是否滚动
const isVerticalNavScrolled = ref(false)
const updateIsVerticalNavScrolled = (val: boolean) => (isVerticalNavScrolled.value = val)

// 滚动响应
function handleNavScroll(evt: Event) {
  isVerticalNavScrolled.value = (evt.target as HTMLElement).scrollTop > 0
}
</script>

<template>
  <Component
    :is="props.tag"
    ref="refNav"
    class="layout-vertical-nav touch-none"
    :class="[
      {
        'visible': isOverlayNavActive,
        'scrolled': isVerticalNavScrolled,
        'overlay-nav': mdAndDown,
      },
    ]"
  >
    <!-- 👉 Header -->
    <div class="nav-header">
      <slot name="nav-header">
        <RouterLink to="/" class="app-logo d-flex align-center app-title-wrapper">
          <ThemeLogoMark />

          <h1 class="leading-normal text-xl">
            <span class="moviepilot-wordmark">MOVIEPILOT</span> <span class="text-sm text-gray-500">v2</span>
          </h1>
        </RouterLink>
      </slot>
    </div>
    <slot name="nav-items" :update-is-vertical-nav-scrolled="updateIsVerticalNavScrolled">
      <PerfectScrollbar
        tag="ul"
        class="nav-items"
        :options="{ wheelPropagation: false }"
        @ps-scroll-y="handleNavScroll"
      >
        <slot />
      </PerfectScrollbar>
    </slot>

    <slot name="after-nav-items" />
  </Component>
</template>

<style lang="scss">
@use '@configured-variables' as variables;
@use '@layouts/styles/mixins';

.visible {
  visibility: visible !important;
}

// 👉 Vertical Nav
.layout-vertical-nav {
  position: fixed;
  z-index: variables.$layout-vertical-nav-z-index;
  display: flex;
  flex-direction: column;
  block-size: 100%;
  inline-size: variables.$layout-vertical-nav-width;
  inset-block-start: 0;
  inset-inline-start: 0;
  transition: transform 0.25s ease-in-out, inline-size 0.25s ease-in-out, box-shadow 0.25s ease-in-out;
  visibility: hidden;
  will-change: transform, inline-size;

  &:not(.overlay-nav) {
    visibility: visible;
  }

  .nav-header {
    display: flex;
    align-items: center;

    .header-action {
      cursor: pointer;
    }
  }

  .app-title-wrapper {
    margin-inline-end: auto;
  }

  .nav-items {
    block-size: 100%;

    // ℹ️ We no loner needs this overflow styles as perfect scrollbar applies it
    // overflow-x: hidden;

    // // ℹ️ We used `overflow-y` instead of `overflow` to mitigate overflow x. Revert back if any issue found.
    // overflow-y: auto;
  }

  .nav-item-title {
    overflow: hidden;
    margin-inline-end: auto;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 👉 Collapsed
  .layout-vertical-nav-collapsed & {
    &:not(.hovered) {
      inline-size: variables.$layout-vertical-nav-collapsed-width;
    }
  }

  // 👉 Overlay nav
  &.overlay-nav {
    &:not(.visible) {
      transform: translateX(-#{variables.$layout-vertical-nav-width});

      @include mixins.rtl {
        transform: translateX(variables.$layout-vertical-nav-width);
      }
    }
  }
}
</style>
