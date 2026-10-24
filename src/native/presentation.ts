/** 区分普通菜单、全屏弹窗与自定义全屏设置，工具提示不参与导航互锁。 */
export function readNativePresentation(document: Document) {
  const customFullscreen = document.querySelector(
    '.theme-customizer-panel-host[role="dialog"], .agent-assistant-panel.is-open[role="dialog"]',
  )
  return {
    overlayOpen: Boolean(
      customFullscreen || document.querySelector('.v-overlay--active.v-dialog, .v-overlay--active.v-menu'),
    ),
    fullscreen: Boolean(customFullscreen || document.querySelector('.v-overlay--active.v-dialog--fullscreen')),
  }
}
