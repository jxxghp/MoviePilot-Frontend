<script lang="ts">
import { Transition } from 'vue'
import { useDisplay } from 'vuetify'
import VerticalNav from '@layouts/components/VerticalNav.vue'

export default defineComponent({
  setup(props, { slots }) {
    const isOverlayNavActive = ref(false)
    const isLayoutOverlayVisible = ref(false)
    const toggleIsOverlayNavActive = useToggle(isOverlayNavActive)

    const route = useRoute()
    const { mdAndDown } = useDisplay()

    // ℹ️ This is alternative to below two commented watcher
    // We want to show overlay if overlay nav is visible and want to hide overlay if overlay is hidden and vice versa.
    syncRef(isOverlayNavActive, isLayoutOverlayVisible)

    const scrollDistance = ref(window.scrollY)
    const isDialogOpen = ref(false)
    const wasScrolledBeforeDialog = ref(false)

    // 监听弹窗状态变化
    const checkDialogState = () => {
      const wasDialogOpen = isDialogOpen.value
      isDialogOpen.value = document.documentElement.classList.contains('v-overlay-scroll-blocked')

      // 当弹窗刚打开时，记录当前的滚动状态
      if (!wasDialogOpen && isDialogOpen.value) {
        wasScrolledBeforeDialog.value = scrollDistance.value > 0
      }
    }

    onMounted(() => {
      window.addEventListener('scroll', () => {
        scrollDistance.value = window.scrollY
      })

      // 初始检查弹窗状态
      checkDialogState()

      // 监听 DOM 变化以检测弹窗状态
      const observer = new MutationObserver(checkDialogState)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    })

    return () => {
      // 👉 Vertical nav
      const verticalNav = h(
        VerticalNav,
        { isOverlayNavActive: isOverlayNavActive.value, toggleIsOverlayNavActive },
        {
          'nav-header': () => slots['vertical-nav-header']?.(),
          'before-nav-items': () => slots['before-vertical-nav-items']?.(),
          'default': () => slots['vertical-nav-content']?.(),
          'after-nav-items': () => slots['after-vertical-nav-items']?.(),
        },
      )

      // 👉 Navbar
      const navbar = h(
        'header',
        { class: ['layout-navbar navbar-blur'] },
        [
          h(
            'div',
            { class: 'navbar-content-container' },
            [
              slots.navbar?.({
                toggleVerticalOverlayNavActive: toggleIsOverlayNavActive,
              }),
              // 👉 Dynamic Header Tab in NavBar
              slots['dynamic-header-tab']?.()
                ? h('div', { class: 'layout-dynamic-header-tab' }, slots['dynamic-header-tab']?.())
                : null,
            ].filter(Boolean),
          ),
        ].filter(Boolean),
      )

      const main = h(
        'main',
        { class: 'layout-page-content' },
        h(Transition, { name: 'fade-slide', mode: 'out-in', appear: true }, () =>
          h('section', { class: 'page-content-container' }, slots.default?.()),
        ),
      )

      // 👉 根据路由 meta 决定 footer 高度
      const shouldShowFooter = !route.meta.hideFooter

      // 👉 Footer
      const footer = h('footer', { class: 'layout-footer' }, [
        h(
          'div',
          {
            class: ['footer-content-container', !shouldShowFooter && 'footer-content-container-noheight'],
          },
          slots.footer?.(),
        ),
      ])

      // 👉 Overlay
      const layoutOverlay = h('div', {
        class: ['layout-overlay', 'touch-none', { visible: isLayoutOverlayVisible.value }],
        onClick: () => {
          isLayoutOverlayVisible.value = !isLayoutOverlayVisible.value
        },
      })

      return h(
        'div',
        {
          class: [
            'layout-wrapper layout-nav-type-vertical layout-navbar-static layout-footer-static layout-content-width-fluid',
            'layout-navbar-fixed',
            mdAndDown.value && 'layout-overlay-nav',
            route.meta.layoutWrapperClasses,
            (scrollDistance.value > 5 || (isDialogOpen.value && wasScrolledBeforeDialog.value)) && 'window-scrolled',
          ],
        },
        [verticalNav, h('div', { class: 'layout-content-wrapper' }, [navbar, main, footer]), layoutOverlay],
      )
    }
  },
})
</script>

<style lang="scss">
@use '@configured-variables' as variables;
@use '@layouts/styles/placeholders';
@use '@layouts/styles/mixins';

.layout-page-content {
  position: relative;
  z-index: 1;
  margin-block-start: 0;
}

.layout-wrapper.layout-nav-type-vertical {
  // TODO(v2): Check why we need height in vertical nav & min-height in horizontal nav
  block-size: 100%;

  .layout-content-wrapper {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-block-size: calc(var(--vh, 1vh) * 100);
    transition: padding-inline-start 0.2s ease-in-out;
    will-change: padding-inline-start;
  }

  .layout-navbar {
    position: fixed;
    z-index: variables.$layout-vertical-nav-layout-navbar-z-index;
    inline-size: calc(100vw - variables.$layout-vertical-nav-width - 0.5rem);
    inset-block-start: 0;

    .navbar-content-container {
      block-size: calc(
        env(safe-area-inset-top) + variables.$layout-vertical-nav-navbar-height + var(--navbar-tab-height)
      );
    }

    @at-root {
      .layout-wrapper.layout-nav-type-vertical {
        .layout-navbar {
          @if variables.$layout-vertical-nav-navbar-is-contained {
            @include mixins.boxed-content;
          }
        }
      }
    }
  }

  &.layout-navbar-fixed .layout-navbar {
    @extend %layout-navbar-fixed;
  }

  &.layout-navbar-hidden .layout-navbar {
    @extend %layout-navbar-hidden;
  }

  // 👉 Footer
  .layout-footer {
    @include mixins.boxed-content;
  }

  // 👉 Layout overlay
  .layout-overlay {
    position: fixed;
    z-index: variables.$layout-overlay-z-index;
    background-color: rgb(0 0 0 / 60%);
    cursor: pointer;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease-in-out;
    will-change: transform;

    &.visible {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &:not(.layout-overlay-nav) .layout-content-wrapper {
    padding-inline-start: calc(variables.$layout-vertical-nav-width);
  }

  // Adjust right column pl when vertical nav is collapsed
  &.layout-vertical-nav-collapsed .layout-content-wrapper {
    padding-inline-start: variables.$layout-vertical-nav-collapsed-width;
  }

  // 👉 Content height fixed
  &.layout-content-height-fixed {
    .layout-content-wrapper {
      max-block-size: calc(var(--vh) * 100);
    }

    .layout-page-content {
      // display: flex;
      // 使用 clip 替代 hidden，避免 Chrome 144+ 滚动锁定问题
      overflow-x: clip;
      overflow-y: auto;

      .page-content-container {
        inline-size: 100%;

        > :first-child {
          max-block-size: 100%;
          overflow-y: auto;
        }
      }
    }
  }
}

.layout-wrapper.layout-nav-type-vertical.layout-overlay-nav {
  .layout-navbar {
    inline-size: 100%;
    padding-inline: 0;
  }
}
</style>
