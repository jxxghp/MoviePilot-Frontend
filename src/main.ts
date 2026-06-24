// 1. 配置与兼容性
import '@/@core/utils/compatibility'
import '@/plugins/webfontloader'

// 2. 核心插件和 UI 框架
import { createApp, defineAsyncComponent } from 'vue'
import vuetify from '@/plugins/vuetify'
import router from '@/router'
import pinia from '@/stores/index'
import i18n from '@/plugins/i18n'

// 3. 全局组件
import App from '@/App.vue'
import { PerfectScrollbarPlugin } from 'vue3-perfect-scrollbar'

// 4. 其他插件和功能模块
import Toast, { TYPE, type PluginOptions } from 'vue-toastification'
import ConfirmDialog from '@/composables/useConfirm'
import { configureApexChartsTheme } from '@/utils/apexCharts'
import {
  canUseAgentAssistantBubble,
  emitAgentAssistantToastBubble,
  type AgentAssistantBubbleVariant,
} from '@/utils/agentAssistantBubble'

// 5. 注册自定义组件
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import ScrollToTopBtn from '@/@core/components/ScrollToTopBtn.vue'
import PageContentTitle from './@core/components/PageContentTitle.vue'

// 6. 样式文件 - 合并为单一导入
import '@/styles/main.scss'

// 7. 状态恢复插件
import stateRestorePlugin from '@/plugins/stateRestore'

type ToastFilterPayload = Parameters<NonNullable<PluginOptions['filterBeforeCreate']>>[0]

function runWhenBrowserIdle(callback: () => void, timeout = 1500) {
  const requestIdle = globalThis.requestIdleCallback
  if (requestIdle) {
    requestIdle(callback, { timeout })
    return
  }

  globalThis.setTimeout(callback, 0)
}

function loadIconBundle() {
  import('@/@iconify/icons-bundle').catch(error => {
    console.error('Failed to load icon bundle', error)
  })
}

function loadRemoteComponentsAfterLogin() {
  import('./utils/federationLoader')
    .then(({ loadRemoteComponents }) => loadRemoteComponents())
    .catch(error => {
      console.error('Failed to load remote components', error)
    })
}

function shouldUseAgentAssistantToastBubble() {
  const settings = pinia.state.value.globalSettings
  if (!settings?.initialized) return false

  return (
    settings.data?.AI_AGENT_ENABLE === true &&
    settings.data?.AI_AGENT_HIDE_ENTRY !== true &&
    canUseAgentAssistantBubble()
  )
}

function getAgentAssistantToastVariant(type?: ToastFilterPayload['type']): AgentAssistantBubbleVariant {
  const variants: Record<string, AgentAssistantBubbleVariant> = {
    [TYPE.DEFAULT]: 'default',
    [TYPE.ERROR]: 'error',
    [TYPE.INFO]: 'info',
    [TYPE.SUCCESS]: 'success',
    [TYPE.WARNING]: 'warning',
  }

  return variants[type || TYPE.DEFAULT] || 'default'
}

function getToastBubbleDuration(type?: ToastFilterPayload['type'], timeout?: ToastFilterPayload['timeout']) {
  if (typeof timeout === 'number') return timeout
  if (timeout === false) return undefined

  return type === TYPE.ERROR || type === TYPE.WARNING ? 7000 : 4500
}

function getToastTextContent(content: ToastFilterPayload['content']) {
  if (typeof content === 'string') return content

  // 组件型 toast 可能包含操作按钮或复杂布局，无法可靠转成气泡文本时继续使用原生 toast。
  return ''
}

function routeToastToAgentAssistantBubble(toast: ToastFilterPayload) {
  const text = getToastTextContent(toast.content)
  if (!text || !shouldUseAgentAssistantToastBubble()) return toast

  const variant = getAgentAssistantToastVariant(toast.type)

  emitAgentAssistantToastBubble({
    id: `toast-${String(toast.id)}`,
    kind: 'toast',
    variant,
    text,
    duration: getToastBubbleDuration(toast.type, toast.timeout),
    keepOpen: toast.timeout === false,
  })

  return false
}

let remoteComponentsInitialized = false

const AsyncAceEditor = defineAsyncComponent(async () => {
  await import('./ace-config')
  return (await import('vue3-ace-editor')).VAceEditor
})

const AsyncApexChart = defineAsyncComponent(async () => {
  const component = (await import('vue3-apexcharts')).default
  const themeName = document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light'
  configureApexChartsTheme(themeName)
  return component
})

const AsyncCronVuetify = defineAsyncComponent(async () => {
  return (await import('@vue-js-cron/vuetify')).CronVuetify
})

const AsyncCronField = defineAsyncComponent(async () => {
  return (await import('./components/field/CronField.vue')).default
})

const AsyncPathField = defineAsyncComponent(async () => {
  return (await import('./components/field/PathField.vue')).default
})

// 创建Vue实例
const app = createApp(App)

// 1. 注册pinia
app.use(pinia)

// 2. 注册 UI 框架
app.use(vuetify)

// 3. 注册路由
app.use(router)

// 4. 注册状态恢复插件
app.use(stateRestorePlugin)

// 5. 注册全局组件
app
  .component('VAceEditor', AsyncAceEditor)
  .component('VApexChart', AsyncApexChart)
  .component('VCronVuetify', AsyncCronVuetify)
  .component('VDialogCloseBtn', DialogCloseBtn)
  .component('VScrollToTopBtn', ScrollToTopBtn)
  .component('VCronField', AsyncCronField)
  .component('VPathField', AsyncPathField)
  .component('VPageContentTitle', PageContentTitle)

// 6. 注册其他插件
app
  .use(PerfectScrollbarPlugin)
  .use(Toast, {
    position: 'bottom-right',
    hideProgressBar: true,
    filterBeforeCreate: routeToastToAgentAssistantBubble,
  })
  .use(ConfirmDialog)
  .use(i18n)

app.mount('#app')

// 图标全集很大，延后到首屏挂载后的空闲时间加载，避免阻塞登录页首次渲染。
runWhenBrowserIdle(loadIconBundle)

// 插件远程入口只在登录后有用，延后初始化可以减少未登录首屏请求和解析成本。
router.isReady().then(() => {
  const loadIfAuthenticated = () => {
    if (!remoteComponentsInitialized && pinia.state.value.auth?.token) {
      remoteComponentsInitialized = true
      runWhenBrowserIdle(loadRemoteComponentsAfterLogin)
    }
  }

  loadIfAuthenticated()
  router.afterEach(loadIfAuthenticated)
})
