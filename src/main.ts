import { createApp } from 'vue'
import '@/@iconify/icons-bundle'
import ToastPlugin from 'vue-toast-notification'
import VuetifyUseDialog from 'vuetify-use-dialog'
import { configureNProgress, doneNProgress, startNProgress } from '@/api/nprogress'
import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import { loadFonts } from '@/plugins/webfontloader'
import router from '@/router'
import store from '@/store'
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'
import '@styles/styles.scss'
import 'vue-toast-notification/dist/theme-default.css'

loadFonts()

// Nprogress
configureNProgress()

// Create vue app
const app = createApp(App)

// Use plugins Mount vue app
app.use(vuetify)
  .use(router)
  .use(store)
  .use(ToastPlugin, {
    position: 'bottom-right',
  })
  .use(VuetifyUseDialog).mount('#app')

// 路由导航守卫
router.beforeEach((to, from, next) => {
  const isAuthenticated = store.state.auth.token !== null

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  }
  else {
    startNProgress()
    next()
  }
})

// 记录首次开启app
let isFirstApp: Boolean = true
router.afterEach(() => {
  doneNProgress()
  if (isFirstApp) {
    // 标记首次载入完成, 再隐藏loading页面, 让首次载入更加丝滑
    isFirstApp = false
    const loading_bg = document.getElementById('loading-bg')
    if (loading_bg)
      // 或许这里需要再多加一点延迟才能改善ios的bug
      document.body.removeChild(loading_bg)
  }
})
