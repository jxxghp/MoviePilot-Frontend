<script lang="ts">
import { useDisplay } from 'vuetify'
import VerticalNav from '@layouts/components/VerticalNav.vue'
import GlassFixedShellBackplate from '@/components/theme/GlassFixedShellBackplate.vue'
import {
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { useGlassFixedShellBackplate } from '@/composables/useGlassFixedShellBackplate'
import { usePWA } from '@/composables/usePWA'
import { useShellScrollState } from '@/composables/useShellScrollState'

export default defineComponent({
  setup(props, { slots }) {
    const isOverlayNavActive = ref(false)
    const isLayoutOverlayVisible = ref(false)
    const toggleIsOverlayNavActive = useToggle(isOverlayNavActive)

    const route = useRoute()
    const { mdAndDown } = useDisplay()
    const { appMode, isStandaloneMode } = usePWA()
    const fixedShellBackplate = useGlassFixedShellBackplate()
    const themeLayout = ref(readThemeCustomizerSettings().layout)
    const canUseDesktopLayout = computed(() => !mdAndDown.value && !appMode.value)
    const isStandaloneApp = computed(() => appMode.value && isStandaloneMode.value)
    const isCollapsedLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'collapsed')
    const isHorizontalLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'horizontal')

    // ℹ️ This is alternative to below two commented watcher
    // We want to show overlay if overlay nav is visible and want to hide overlay if overlay is hidden and vice versa.
    syncRef(isOverlayNavActive, isLayoutOverlayVisible)

    const isDialogOpen = ref(false)
    let dialogObserver: MutationObserver | null = null
    const shellScroll = useShellScrollState({ scrollLocked: isDialogOpen })

    const handleThemeCustomizerChange = (event: Event) => {
      themeLayout.value = (event as CustomEvent<ThemeCustomizerSettings>).detail.layout
    }

    // 监听弹窗状态变化
    const checkDialogState = () => {
      isDialogOpen.value = document.documentElement.classList.contains('v-overlay-scroll-blocked')
    }

    onMounted(() => {
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
      window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerChange)
      dialogObserver?.disconnect()
      dialogObserver = null
    })

    return () => {
      const hasFixedShellBackplate = fixedShellBackplate.layers.value.length > 0

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

      const fixedShellBackplateNode = hasFixedShellBackplate
        ? h(GlassFixedShellBackplate, {
            isOverlayNav: mdAndDown.value,
            isOverlayNavActive: isOverlayNavActive.value,
            layers: fixedShellBackplate.layers.value,
            transitionDurationMs: fixedShellBackplate.transitionDurationMs,
          })
        : null

      // 👉 Navbar
      const navbar = h(
        'header',
        {
          class: ['layout-navbar navbar-blur'],
          'data-shell-navbar-state': shellScroll.state.value,
          inert: appMode.value && shellScroll.state.value === 'compact' ? '' : undefined,
        },
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
      const isNavbarAwayFromTop = shellScroll.state.value !== 'expanded'
      const isNavbarCompact = shellScroll.state.value === 'compact'
      const isNavbarRevealed = shellScroll.state.value === 'revealed'

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
            appMode.value && 'layout-app-shell',
            isStandaloneApp.value && 'layout-standalone-pwa-shell',
            mdAndDown.value && !appMode.value && 'layout-mobile-drawer-shell',
            isCollapsedLayout.value && 'layout-vertical-nav-collapsed',
            isHorizontalLayout.value && 'layout-horizontal-nav-active',
            isHorizontalLayout.value && isNavbarAwayFromTop && 'layout-horizontal-nav-scrolled',
            isNavbarAwayFromTop && 'layout-navbar-away-from-top',
            isNavbarCompact && 'layout-navbar-compact',
            isNavbarRevealed && 'layout-navbar-revealed',
            hasFixedShellBackplate && 'layout-fixed-shell-backplate-active',
            route.meta.layoutWrapperClasses,
            !isHorizontalLayout.value && isNavbarAwayFromTop && 'window-scrolled',
          ],
          'data-shell-mode': appMode.value ? 'app' : mdAndDown.value ? 'drawer' : 'desktop',
          'data-shell-scroll-direction': shellScroll.direction.value,
        },
        [
          fixedShellBackplateNode,
          verticalNav,
          h('div', { class: 'layout-content-wrapper' }, [navbar, main, footer]),
          layoutOverlay,
        ],
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
  --layout-navbar-safe-area-inline: 0px;
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
    inline-size: calc(100% - variables.$layout-vertical-nav-width);
    inset-block-start: 0;
    transform: translate3d(0, 0, 0);
    transition:
      background-color 240ms var(--mp-motion-ease-standard),
      border-color 240ms var(--mp-motion-ease-standard),
      border-radius 240ms var(--mp-motion-ease-standard),
      box-shadow 240ms var(--mp-motion-ease-standard),
      inline-size 240ms var(--mp-motion-ease-standard),
      inset-block-start 240ms var(--mp-motion-ease-standard),
      inset-inline-end 240ms var(--mp-motion-ease-standard),
      inset-inline-start 240ms var(--mp-motion-ease-standard),
      transform 240ms var(--mp-motion-ease-standard);

    .navbar-content-container {
      block-size: var(--layout-navbar-block-size);
      transition:
        background-color 240ms var(--mp-motion-ease-standard),
        border-color 240ms var(--mp-motion-ease-standard),
        border-radius 240ms var(--mp-motion-ease-standard),
        box-shadow 240ms var(--mp-motion-ease-standard),
        margin 240ms var(--mp-motion-ease-standard),
        opacity 180ms var(--mp-motion-ease-standard);
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

  // 水平布局只有一个顶部控制层，离开顶部后可整体浮起；侧栏布局保持与导航 rail 连接。
  &.layout-navbar-away-from-top.layout-horizontal-nav-active .layout-navbar {
    border-radius: var(--app-surface-radius);
    inline-size: calc(100% - 1rem);
    inset-block-start: 0.5rem;
    inset-inline: 0.5rem;
    overflow: clip;
  }

  // App 始终保留底部一级导航，因此下滚可让上下文顶栏退出内容区。
  &.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell) .layout-navbar {
    transform: translate3d(0, -100%, 0);
    transition-duration: 160ms;
    transition-timing-function: var(--mp-motion-ease-exit);
  }

  // Standalone 没有浏览器 chrome 保护系统状态区，隐藏控制行时仍保留 safe-area 材质。
  &.layout-standalone-pwa-shell {
    --layout-navbar-safe-area-inline: max(
      env(safe-area-inset-left, 0px),
      env(safe-area-inset-right, 0px)
    );
  }

  &.layout-standalone-pwa-shell .layout-navbar {
    padding-inline: var(--layout-navbar-safe-area-inline);
  }

  &.layout-standalone-pwa-shell.layout-navbar-compact .layout-navbar {
    overflow: clip;
    transform: translate3d(0, calc(-100% + env(safe-area-inset-top, 0px)), 0);
    transition-duration: 160ms;
    transition-timing-function: var(--mp-motion-ease-exit);

    .navbar-content-container {
      opacity: 0;
      pointer-events: none;
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
    inline-size: calc(100% - variables.$layout-vertical-nav-collapsed-width);
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

    .app-logo .theme-logo-mark {
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
      inset-inline: 0;
      max-inline-size: none;
      padding-inline: 0;
    }

    .navbar-content-container {
      display: grid;
      align-items: center;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      column-gap: 0.75rem;
      grid-template-columns: auto minmax(0, 1fr) auto;
      inline-size: 100%;
      margin-inline: auto;
      max-inline-size: variables.$layout-boxed-content-width;
      padding-inline: 1.5rem;
    }

    .layout-dynamic-header-tab {
      display: none;
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

@media (prefers-reduced-motion: reduce) {
  .layout-wrapper.layout-nav-type-vertical {
    .layout-navbar,
    .navbar-content-container {
      transition-duration: 0.01ms !important;
    }
  }
}

.layout-wrapper.layout-nav-type-vertical.layout-overlay-nav {
  .layout-navbar {
    inline-size: 100%;
    padding-inline: var(--layout-navbar-safe-area-inline);
  }
}
</style>
