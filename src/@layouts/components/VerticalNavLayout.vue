<script lang="ts">
import { useDisplay } from 'vuetify'
import VerticalNav from '@layouts/components/VerticalNav.vue'
import {
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { usePWA } from '@/composables/usePWA'

export default defineComponent({
  setup(props, { slots }) {
    const isOverlayNavActive = ref(false)
    const isLayoutOverlayVisible = ref(false)
    const toggleIsOverlayNavActive = useToggle(isOverlayNavActive)

    const route = useRoute()
    const { mdAndDown } = useDisplay()
    const { appMode } = usePWA()
    const themeLayout = ref(readThemeCustomizerSettings().layout)
    const canUseDesktopLayout = computed(() => !mdAndDown.value && !appMode.value)
    const isCollapsedLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'collapsed')
    const isHorizontalLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'horizontal')

    // ℹ️ This is alternative to below two commented watcher
    // We want to show overlay if overlay nav is visible and want to hide overlay if overlay is hidden and vice versa.
    syncRef(isOverlayNavActive, isLayoutOverlayVisible)

    const scrollDistance = ref(window.scrollY)
    const isDialogOpen = ref(false)
    const wasScrolledBeforeDialog = ref(false)
    let dialogObserver: MutationObserver | null = null

    const handleScroll = () => {
      scrollDistance.value = window.scrollY
    }

    const handleThemeCustomizerChange = (event: Event) => {
      themeLayout.value = (event as CustomEvent<ThemeCustomizerSettings>).detail.layout
    }

    // 监听弹窗状态变化
    const checkDialogState = () => {
      const wasDialogOpen = isDialogOpen.value
      isDialogOpen.value = document.documentElement.classList.contains('v-overlay-scroll-blocked')

      // 当弹窗刚打开时，记录当前的滚动状态
      if (!wasDialogOpen && isDialogOpen.value) {
        wasScrolledBeforeDialog.value = scrollDistance.value > 10
      }
    }

    onMounted(() => {
      window.addEventListener('scroll', handleScroll)
      window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)

      // 初始检查弹窗状态
      checkDialogState()

      // 监听 DOM 变化以检测弹窗状态
      dialogObserver = new MutationObserver(checkDialogState)
      dialogObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    })

    onBeforeUnmount(() => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)
      dialogObserver?.disconnect()
      dialogObserver = null
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
        h('section', { class: 'page-content-container' }, slots.default?.()),
      )

      // 👉 根据路由 meta 决定 footer 高度
      const shouldShowFooter = !route.meta.hideFooter
      const isNavbarScrolled = scrollDistance.value > 5 || (isDialogOpen.value && wasScrolledBeforeDialog.value)

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
            isCollapsedLayout.value && 'layout-vertical-nav-collapsed',
            isHorizontalLayout.value && 'layout-horizontal-nav-active',
            isHorizontalLayout.value && isNavbarScrolled && 'layout-horizontal-nav-scrolled',
            route.meta.layoutWrapperClasses,
            !isHorizontalLayout.value && isNavbarScrolled && 'window-scrolled',
          ],
        },
        [verticalNav, h('div', { class: 'layout-content-wrapper' }, [navbar, main, footer]), layoutOverlay],
      )
    }
  },
})
</script>

<style lang="scss">
/* stylelint-disable no-descending-specificity */

@use '@configured-variables' as variables;
@use '@layouts/styles/placeholders';
@use '@layouts/styles/mixins';

.layout-page-content {
  position: relative;
  z-index: 1;
  margin-block-start: 0;
}

.layout-wrapper.layout-nav-type-vertical {
  --layout-navbar-block-size: calc(
    env(safe-area-inset-top, 0px) + #{variables.$layout-vertical-nav-navbar-height} + var(--navbar-tab-height)
  );

  // TODO(v2): Check why we need height in vertical nav & min-height in horizontal nav
  min-block-size: 100%;

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
    // iOS Safari 在地址栏收起和惯性滚动时可能把 fixed 顶栏和页面滚动层合成到一起，
    // 单独提升顶栏图层可避免导航栏短暂上移到安全区下方。
    backface-visibility: hidden;
    block-size: var(--layout-navbar-block-size);
    inline-size: calc(100vw - variables.$layout-vertical-nav-width - 0.5rem);
    inset-block-start: 0;
    transform: translate3d(0, 0, 0);

    .navbar-content-container {
      block-size: var(--layout-navbar-block-size);
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

    .page-content-container > div:first-child {
      inline-size: calc(100vw - variables.$layout-vertical-nav-collapsed-width - 1rem);
    }
  }

  &.layout-vertical-nav-collapsed .layout-navbar {
    inline-size: calc(100vw - variables.$layout-vertical-nav-collapsed-width - 0.5rem);
  }

  &.layout-vertical-nav-collapsed .layout-vertical-nav:not(.overlay-nav) {
    .nav-header {
      justify-content: center;
      margin-inline: 0;
      padding-inline: 0;
    }

    .app-logo {
      justify-content: center;
      inline-size: 100%;
      transform: none !important;
    }

    .app-logo > div {
      display: flex;
      overflow: hidden;
      align-items: center;
      justify-content: center;
      block-size: 2.75rem;
      inline-size: 2.75rem;
    }

    .app-logo svg {
      block-size: 2.5rem;
      inline-size: 2.5rem;
    }

    .app-logo h1,
    .nav-item-title,
    .nav-section-title {
      display: none;
    }

    .nav-link > a {
      justify-content: center;
      border-radius: 0.75rem !important;
      block-size: 2.75rem;
      margin-inline: 0.75rem;
      padding-inline: 0;
    }

    .nav-item-icon {
      margin-inline-end: 0 !important;
    }
  }

  &.layout-horizontal-nav-active {
    .layout-vertical-nav:not(.overlay-nav) {
      pointer-events: none;
      transform: translateX(-100%);
      visibility: hidden;
    }

    .layout-content-wrapper {
      padding-inline-start: 0;
    }

    .layout-navbar {
      background: rgb(var(--v-theme-background));
      border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
      inline-size: 100%;
      max-inline-size: none;
      padding-inline: 0;
    }

    .navbar-content-container {
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      inline-size: 100%;
      margin-inline: auto;
      max-inline-size: variables.$layout-boxed-content-width;
      padding-inline: 1.5rem;
    }

    .layout-page-content {
      inline-size: 100%;
      margin-inline: auto;
      max-inline-size: variables.$layout-boxed-content-width;
      padding-inline: 1rem;
    }

    .page-content-container > div:first-child {
      inline-size: 100%;
    }
  }

  @at-root {
    .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed .layout-navbar {
      backdrop-filter: blur(12px) saturate(1.2);
      background: rgb(var(--v-theme-surface)) !important;
      box-shadow:
        0 1px 3px rgba(0, 0, 0, 4%),
        0 1px 2px rgba(0, 0, 0, 2%);
    }

    .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .navbar-content-container {
      backdrop-filter: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      padding-inline: 1.5rem !important;

      &::before {
        display: none !important;
        backdrop-filter: none !important;
        background: transparent !important;
        background-color: transparent !important;
        content: none !important;
        filter: none !important;
      }
    }

    html[data-theme='transparent'] .layout-wrapper.layout-horizontal-nav-active .layout-navbar,
    .v-theme--transparent .layout-wrapper.layout-horizontal-nav-active .layout-navbar {
      backdrop-filter: none !important;
      background: transparent !important;
      border-block-end-color: rgba(var(--v-theme-on-surface), 0.04);
      box-shadow: none !important;
    }

    html[data-theme='transparent'] .layout-wrapper.layout-horizontal-nav-active .navbar-content-container,
    .v-theme--transparent .layout-wrapper.layout-horizontal-nav-active .navbar-content-container {
      backdrop-filter: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    // 透明主题的水平导航不叠加滚动磨砂层，避免中间区域出现一块更深的背景。
    html[data-theme='transparent']
      .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .layout-navbar,
    .v-theme--transparent
      .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .layout-navbar {
      backdrop-filter: blur(var(--transparent-blur-light, 6px)) !important;
      background: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2)) !important;
      box-shadow: none !important;
    }

    // 透明主题滚动时只让外层导航栏承载整屏背景，避免内部最大宽度容器单独变深。
    html[data-theme='transparent']
      .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .navbar-content-container,
    .v-theme--transparent
      .layout-wrapper.layout-horizontal-nav-active.layout-horizontal-nav-scrolled.layout-navbar-fixed
      .navbar-content-container {
      backdrop-filter: none !important;
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      padding-inline: 1.5rem !important;

      &::before {
        display: none !important;
        backdrop-filter: none !important;
        background: transparent !important;
        background-color: transparent !important;
        content: none !important;
        filter: none !important;
      }
    }

    html[data-theme='light'][data-theme-semi-dark-menu='true'][data-theme-layout='vertical']
      .layout-wrapper.layout-nav-type-vertical:not(.layout-horizontal-nav-active)
      .layout-vertical-nav:not(.overlay-nav),
    html[data-theme='light'][data-theme-semi-dark-menu='true'][data-theme-layout='collapsed']
      .layout-wrapper.layout-nav-type-vertical:not(.layout-horizontal-nav-active)
      .layout-vertical-nav:not(.overlay-nav) {
      background: #2f3349;
      color: #e7e3fc;

      .app-logo h1,
      .nav-section-title,
      .nav-link > a,
      .nav-item-icon {
        color: rgba(231, 227, 252, 78%) !important;
      }

      .nav-link > a:hover {
        background-color: rgba(231, 227, 252, 6%);
      }

      .nav-link > .router-link-exact-active {
        color: #fff !important;

        .nav-item-icon,
        .nav-item-title {
          color: #fff !important;
        }
      }
    }
  }

  // 👉 Content height fixed
  &.layout-content-height-fixed {
    .layout-content-wrapper {
      max-block-size: calc(var(--vh) * 100);
    }

    .layout-page-content {
      // display: flex;
      overflow: auto;

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
