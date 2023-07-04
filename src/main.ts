/* eslint-disable import/order */
import '@/@iconify/icons-bundle'
import App from '@/App.vue'
import { configureNProgress, doneNProgress, startNProgress } from '@/api/nprogress'
import vuetify from '@/plugins/vuetify'
import { loadFonts } from '@/plugins/webfontloader'
import router from '@/router'
import store from '@/store'
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'
import '@styles/styles.scss'
import { createApp } from 'vue'
import ToastPlugin from 'vue-toast-notification'
import 'vue-toast-notification/dist/theme-default.css'
import VuetifyUseDialog from 'vuetify-use-dialog'
loadFonts()

// Nprogress
configureNProgress()

// Create vue app
const app = createApp(App)

// Use plugins Mount vue app
app
.use(vuetify)
.use(router)
.use(store)
.use(ToastPlugin)
.use(VuetifyUseDialog)
.mount('#app')


// 导航守卫
router.beforeEach((to, from, next) => {
  // 通过 Vuex Store 检查用户是否已登录
  const isAuthenticated = store.state.auth.token !== null
  if (to.meta.requiresAuth && !isAuthenticated) {
    // 如果路由需要登录权限且用户未登录，则跳转到登录页面
    next('/login')
  }
  else {
    // 否则，允许继续进行路由导航
    startNProgress()
    next()
  }
})

router.afterEach(() => {
  doneNProgress()
})
