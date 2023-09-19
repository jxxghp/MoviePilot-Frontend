import { createApp } from 'vue'
import '@/@iconify/icons-bundle'
import ToastPlugin from 'vue-toast-notification'
import VuetifyUseDialog from 'vuetify-use-dialog'
import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import { loadFonts } from '@/plugins/webfontloader'
import router from '@/router'
import store from '@/store'
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'
import '@styles/styles.scss'
import 'vue-toast-notification/dist/theme-default.css'
import { removeEl } from '@/util'

loadFonts()

// Create vue app
const app = createApp(App)

// Use plugins Mount vue app
app
  .use(vuetify)
  .use(router)
  .use(store)
  .use(ToastPlugin, {
    position: 'bottom-right',
  })
  .use(VuetifyUseDialog)
  .mount('#app')

// 小屏幕下1s后移除loading
if (window.innerWidth < 1024)
  setTimeout(() => removeEl('#loading-bg'), 1000)
else
  removeEl('#loading-bg')
