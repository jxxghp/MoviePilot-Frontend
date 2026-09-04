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
import { useFooterDockHeight } from '@/composables/useFooterDockHeight'

const FLOATING_NAVBAR_INSET_PX = 16

export default defineComponent({
  setup(props, { slots }) {
    const isOverlayNavActive = ref(false)
    const isLayoutOverlayVisible = ref(false)
    const toggleIsOverlayNavActive = useToggle(isOverlayNavActive)

    const route = useRoute()
    const { mdAndDown } = useDisplay()
    const { appMode, displayEnvironment, isStandaloneMode, isWindowControlsOverlayMode } = usePWA()
    // App Dock 通过 Teleport 挂载到 body，不参与内容流；将实际高度交给布局用于末尾避让。
    const { footerDockHeight } = useFooterDockHeight()
    const fixedShellBackplate = useGlassFixedShellBackplate()
    const themeLayout = ref(readThemeCustomizerSettings().layout)
    const canUseDesktopLayout = computed(() => !mdAndDown.value && !appMode.value)
    const isOverlayShell = computed(() => mdAndDown.value && !appMode.value)
    const isCollapsedLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'collapsed')
    const isHorizontalLayout = computed(() => canUseDesktopLayout.value && themeLayout.value === 'horizontal')
    const isFloatingNavbarEligible = computed(() => isHorizontalLayout.value && !isWindowControlsOverlayMode.value)
    const floatingNavbarScale = ref(1)
    const floatingNavbarContentScale = computed(() => 1 / floatingNavbarScale.value)

    // 顶栏的布局宽度保持不变；缩进比例仅随视口变化，滚动动画可完全留在合成层。
    const updateFloatingNavbarScale = () => {
      const viewportWidth = document.documentElement.clientWidth

      floatingNavbarScale.value =
        viewportWidth > FLOATING_NAVBAR_INSET_PX * 2
          ? (viewportWidth - FLOATING_NAVBAR_INSET_PX * 2) / viewportWidth
          : 1
    }

    // ℹ️ This is alternative to below two commented watcher
    // We want to show overlay if overlay nav is visible and want to hide overlay if overlay is hidden and vice versa.
    syncRef(isOverlayNavActive, isLayoutOverlayVisible)

    // Drawer 离开当前 Shell 后必须同步关闭，避免残留遮罩拦截 App 或桌面内容。
    watch(isOverlayShell, active => {
      if (!active) isOverlayNavActive.value = false
    })

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
      window.addEventListener('resize', updateFloatingNavbarScale, { passive: true })
      updateFloatingNavbarScale()

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
      window.removeEventListener('resize', updateFloatingNavbarScale)
      dialogObserver?.disconnect()
      dialogObserver = null
    })

    return () => {
      const hasFixedShellBackplate = fixedShellBackplate.layers.value.length > 0

      // 👉 Vertical nav
      const verticalNav = appMode.value
        ? null
        : h(
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
            isOverlayNav: isOverlayShell.value,
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
      // compact/revealed 是 App 上下文顶栏的呈现状态；其他 Shell 只消费 away-from-top 材质状态。
      const isNavbarCompact = appMode.value && shellScroll.state.value === 'compact'
      const isNavbarRevealed = appMode.value && shellScroll.state.value === 'revealed'

      // 👉 Footer
      const footer = h('footer', { class: 'layout-footer' }, [
        h(
          'div',
          {
            class: [
              'footer-content-container',
              (!shouldShowFooter || appMode.value) && 'footer-content-container-noheight',
            ],
          },
          slots.footer?.(),
        ),
      ])

      // 👉 Overlay
      const layoutOverlay = isOverlayShell.value
        ? h('div', {
            class: ['layout-overlay', 'touch-none', { visible: isLayoutOverlayVisible.value }],
            onClick: () => {
              isLayoutOverlayVisible.value = !isLayoutOverlayVisible.value
            },
          })
        : null

      return h(
        'div',
        {
          class: [
            'layout-wrapper layout-nav-type-vertical layout-navbar-static layout-footer-static layout-content-width-fluid',
            'layout-navbar-fixed',
            isOverlayShell.value && 'layout-overlay-nav',
            appMode.value && 'layout-app-shell',
            isStandaloneMode.value && 'layout-standalone-pwa-shell',
            isWindowControlsOverlayMode.value && 'layout-window-controls-overlay-shell',
            isOverlayShell.value && 'layout-mobile-drawer-shell',
            isCollapsedLayout.value && 'layout-vertical-nav-collapsed',
            isHorizontalLayout.value && 'layout-horizontal-nav-active',
            isFloatingNavbarEligible.value && 'layout-navbar-floating-eligible',
            isHorizontalLayout.value && isNavbarAwayFromTop && 'layout-horizontal-nav-scrolled',
            isNavbarAwayFromTop && 'layout-navbar-away-from-top',
            isNavbarCompact && 'layout-navbar-compact',
            isNavbarRevealed && 'layout-navbar-revealed',
            hasFixedShellBackplate && 'layout-fixed-shell-backplate-active',
            route.meta.layoutWrapperClasses,
            !isHorizontalLayout.value && isNavbarAwayFromTop && 'window-scrolled',
          ],
          'data-shell-mode': appMode.value ? 'app' : mdAndDown.value ? 'drawer' : 'desktop',
          'data-shell-display-environment': displayEnvironment.value,
          'data-shell-navbar-attachment': appMode.value
            ? 'contextual'
            : isFloatingNavbarEligible.value
              ? 'theme-qualified'
              : 'connected',
          'data-shell-scroll-direction': shellScroll.direction.value,
          style: {
            '--layout-footer-dock-height': `${footerDockHeight.value ?? 0}px`,
            '--shell-floating-navbar-scale-x': floatingNavbarScale.value,
            '--shell-floating-navbar-content-scale-x': floatingNavbarContentScale.value,
          },
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
  padding-block-start: calc(var(--layout-navbar-safe-area-top, env(safe-area-inset-top, 0px)) + 4.5rem);
}

.layout-wrapper.layout-nav-type-vertical {
  --layout-navbar-safe-area-top: env(safe-area-inset-top, 0px);
  --layout-navbar-safe-area-inline: 0px;
  --shell-floating-navbar-radius: 1rem;
  --shell-floating-navbar-inset: 1rem;
  --shell-floating-navbar-motion-duration: 150ms;
  --shell-floating-navbar-motion-easing: cubic-bezier(0.2, 0, 0, 1);
  --layout-navbar-block-size: calc(
    var(--layout-navbar-safe-area-top) + #{variables.$layout-vertical-nav-navbar-height} + var(--navbar-tab-height)
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
      padding-block-start: var(--layout-navbar-safe-area-top);
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

  @at-root {
    // 只有具备连续透射背景的特殊主题可解释顶栏四周的空间；WCO 与连接式导航保持附着。
    html:is([data-theme='transparent'], [data-theme='glass'])
      .layout-wrapper.layout-nav-type-vertical.layout-navbar-floating-eligible
      .layout-navbar {
      inset-block-start: 0;
      inset-inline: 0;
      transform: translate3d(0, 0, 0) scaleX(1);
      transform-origin: center top;
      transition:
        background-color var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
        border-color var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
        border-radius var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
        box-shadow var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
        transform var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing);

      .navbar-content-container {
        transform: scaleX(1);
        transform-origin: center top;
        transition:
          background-color var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
          border-color var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
          border-radius var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
          box-shadow var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing),
          opacity 180ms var(--mp-motion-ease-standard),
          transform var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing);
      }
    }

    html:is([data-theme='transparent'], [data-theme='glass'])
      .layout-wrapper.layout-nav-type-vertical.layout-navbar-floating-eligible.layout-navbar-away-from-top
      .layout-navbar {
      border-radius: var(--shell-floating-navbar-radius);
      overflow: clip;
      transform: translate3d(0, var(--shell-floating-navbar-inset), 0) scaleX(var(--shell-floating-navbar-scale-x));

      .navbar-content-container {
        transform: scaleX(var(--shell-floating-navbar-content-scale-x));
      }
    }
  }

  // App 始终保留底部一级导航，因此下滚可让上下文顶栏退出内容区。
  &.layout-app-shell.layout-navbar-compact:not(.layout-standalone-pwa-shell):not(.layout-window-controls-overlay-shell)
    .layout-navbar {
    transform: translate3d(0, -100%, 0);
    transition-duration: 160ms;
    transition-timing-function: var(--mp-motion-ease-exit);
  }

  // Standalone 没有浏览器 chrome 保护系统状态区，隐藏控制行时仍保留 safe-area 材质。
  &.layout-standalone-pwa-shell {
    --layout-navbar-safe-area-inline: max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px));
  }

  &.layout-standalone-pwa-shell .layout-navbar {
    padding-inline: var(--layout-navbar-safe-area-inline);
  }

  &.layout-app-shell:is(.layout-standalone-pwa-shell, .layout-window-controls-overlay-shell).layout-navbar-compact
    .layout-navbar {
    overflow: clip;
    transform: translate3d(0, calc(-100% + var(--layout-navbar-safe-area-top)), 0);
    transition-duration: 160ms;
    transition-timing-function: var(--mp-motion-ease-exit);

    .navbar-content-container {
      opacity: 0;
      pointer-events: none;
    }
  }

  // WCO 的标题栏是桌面窗口合同；独立保留拖拽区，避免复用移动端 safe-area 与显隐语义。
  &.layout-window-controls-overlay-shell {
    --layout-navbar-safe-area-top: env(titlebar-area-height, 0px);

    &::before {
      position: fixed;
      z-index: variables.$layout-vertical-nav-layout-navbar-z-index + 1;
      block-size: env(titlebar-area-height, 0px);
      content: '';
      inline-size: env(titlebar-area-width, 100%);
      inset-block-start: env(titlebar-area-y, 0px);
      inset-inline-start: env(titlebar-area-x, 0px);
      -webkit-app-region: drag;
      app-region: drag;
    }

    .layout-vertical-nav {
      padding-block-start: var(--layout-navbar-safe-area-top);
    }
  }

  [dir='rtl'] &.layout-window-controls-overlay-shell::before {
    // titlebar-area-x 是物理坐标，RTL 下需转换为逻辑起点，避免拖拽区镜像到窗口控件上。
    inset-inline-start: calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100%));
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

  // App shell 的一级导航由底部 Dock 独占，顶栏与内容不保留桌面侧栏的几何空间。
  &.layout-app-shell {
    .layout-content-wrapper {
      padding-inline-start: 0;
    }

    .layout-navbar {
      inline-size: 100%;
      inset-inline: 0;
    }

    .page-content-container > div:first-child {
      inline-size: 100%;
    }
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
      backdrop-filter: none;
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
