import type { Plugin } from 'vite'

/** 专用认证页仅使用内联样式，避免全局 CSS 合并时加载业务主题和字体。 */
export function nativePasskeyPage(): Plugin {
  return {
    name: 'moviepilot-native-passkey-page',
    transformIndexHtml: {
      order: 'post',
      /** 只移除独立入口的合并样式引用，不改变主业务入口或内联安全策略。 */
      handler(html, context) {
        if (context.path !== '/native-passkey.html') return html
        return html.replace(/<link\b[^>]*>/g, tag =>
          tag.includes('rel="stylesheet"') || tag.includes('rel="manifest"') ? '' : tag,
        )
      },
    },
  }
}
