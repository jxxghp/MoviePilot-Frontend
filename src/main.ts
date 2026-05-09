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

// 4. 工具函数和其他辅助模块
import { loadRemoteComponents } from './utils/federationLoader'

// 5. 其他插件和功能模块
import Toast from 'vue-toastification'
import ConfirmDialog from '@/composables/useConfirm'
import { configureApexChartsTheme } from '@/utils/apexCharts'

// 6. 注册自定义组件
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import ScrollToTopBtn from '@/@core/components/ScrollToTopBtn.vue'
import PageContentTitle from './@core/components/PageContentTitle.vue'

// 7. 样式文件 - 合并为单一导入
import '@/styles/main.scss'

// 8. 状态恢复插件
import stateRestorePlugin from '@/plugins/stateRestore'

// 9. 后台优化工具
import { backgroundManager } from '@/utils/backgroundManager'
import { sseManagerSingleton } from '@/utils/sseManager'

const iconBundlePromise = import('@/@iconify/icons-bundle').catch(error => {
  console.error('Failed to load icon bundle', error)
})

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

// 异步加载远程组件（不阻塞启动）
loadRemoteComponents().catch(error => {
  console.error('Failed to load remote components', error)
})

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
  })
  .use(ConfirmDialog)
  .use(i18n)

await iconBundlePromise
app.mount('#app')

// 页面卸载时清理后台管理器
window.addEventListener('beforeunload', () => {
  backgroundManager.destroy()
  sseManagerSingleton.closeAllManagers()
})
