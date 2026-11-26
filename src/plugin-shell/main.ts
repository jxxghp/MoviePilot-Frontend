import { createApp, defineComponent, h } from 'vue'
import 'vuetify/styles'
import '@/styles/variables/_vuetify.scss'
import { VBtn } from 'vuetify/components/VBtn'
import { VIcon } from 'vuetify/components/VIcon'
import vuetify from '@/plugins/vuetify'
import { pluginHostBridge } from './bridgeClient'
import PluginShellHost from './PluginShellHost.vue'
import './plugin-shell.css'

/** 极简运行时弹窗关闭按钮（免除主站 vue-i18n 依赖，完整兼容插件 `<VDialogCloseBtn>` / `<DialogCloseBtn>`）。 */
const ShellDialogCloseBtn = defineComponent({
  name: 'ShellDialogCloseBtn',
  props: {
    innerClass: { type: String, default: undefined },
  },
  emits: ['click', 'update:modelValue'],
  setup(props, { emit }) {
    const onClick = (event: MouseEvent) => {
      event.stopPropagation()
      emit('update:modelValue', false)
      emit('click')
    }
    return () =>
      h(
        VBtn,
        {
          'icon': true,
          'variant': 'text',
          'size': 'small',
          'data-native-dialog-close': '',
          'aria-label': '关闭',
          'class': props.innerClass ? props.innerClass : 'absolute right-3 top-3 z-10',
          onClick,
        },
        () => h(VIcon, { icon: 'mdi-close' }),
      )
  },
})

// 加载本地离线 Iconify MDI 图标包，零网络延迟支持全部 mdi-* 图标
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
app.component('VDialogCloseBtn', ShellDialogCloseBtn)
app.component('DialogCloseBtn', ShellDialogCloseBtn)
app.mount('#app')
