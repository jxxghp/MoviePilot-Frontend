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

// 记录和恢复滚动位置
const scrollPositions: { [key: string]: number } = {} // 用于存储每个路由的滚动位置

// 路由导航守卫
router.beforeEach((to, from, next) => {
  const isAuthenticated = store.state.auth.token !== null

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  }
  else {
    // 只有 meta 中 keepAlive 为 true 的情况下才记录滚动位置
    if (from.meta.keepAlive)
      scrollPositions[from.fullPath] = window.scrollY

    startNProgress()
    next()
  }
})

router.afterEach((to) => {
  // 只有 meta 中 keepAlive 为 true 的情况下才恢复滚动位置
  if (to.meta.keepAlive) {
    const savedPosition = scrollPositions[to.fullPath]
    if (savedPosition !== undefined) {
      setTimeout(() => {
        window.scrollTo(0, savedPosition)
      }, 0)
    }
  }
  doneNProgress()
})
