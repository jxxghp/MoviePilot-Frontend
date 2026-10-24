/** 区分普通菜单、半屏主题设置与全屏弹窗，只有全屏内容影响底栏。 */
export function readNativePresentation(document: Document) {
  const custom = document.querySelector(
    '.theme-customizer-panel-host[role="dialog"], .agent-assistant-panel.is-open[role="dialog"]',
  )
  return {
    overlayOpen: Boolean(custom || document.querySelector('.v-overlay--active.v-dialog, .v-overlay--active.v-menu')),
    fullscreen: Boolean(
      document.querySelector(
        '.theme-customizer-panel-host[role="dialog"]:not([data-native-sheet-size="medium"]), .agent-assistant-panel.is-open[role="dialog"], .v-overlay--active.v-dialog--fullscreen',
      ),
    ),
  }
}
