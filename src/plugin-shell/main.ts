import { createApp } from 'vue'
import vuetify from '@/plugins/vuetify'
import { pluginHostBridge } from './bridgeClient'
import PluginShellHost from './PluginShellHost.vue'
import { registerPluginShellGlobalComponents } from './shellComponents'
import './plugin-shell.scss'

// 加载本地离线 Iconify MDI 图标包，零网络延迟支持主站与插件高频 mdi-* 图标
void import('@/@iconify/icons-bundle').catch(error => {
  console.warn('[plugin-shell] icon bundle load failed:', error)
})

// 拦截外链跳转（window.open 与 <a target="_blank">），严禁 WebView 离开受控虚拟 Origin
if (typeof window !== 'undefined') {
  window.open = (url?: string | URL) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.toString() : ''
    if (/^https?:\/\//i.test(href)) {
      pluginHostBridge.openExternal(href)
    }
    return null
  }

  document.addEventListener(
    'click',
    event => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!target) return
      const href = target.getAttribute('href') || ''
      const openBlank = target.getAttribute('target') === '_blank'
      if (/^https?:\/\//i.test(href)) {
        try {
          const parsed = new URL(href)
          if (openBlank || parsed.origin !== window.location.origin) {
            event.preventDefault()
            pluginHostBridge.openExternal(href)
          }
        } catch {
          // 忽略非法 URL
        }
      }
    },
    true,
  )
}

const app = createApp(PluginShellHost)
app.use(vuetify)
registerPluginShellGlobalComponents(app)
app.mount('#app')
