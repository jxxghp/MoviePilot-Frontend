/* eslint-disable import/order */
import '@/@iconify/icons-bundle'
import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import { loadFonts } from '@/plugins/webfontloader'
import router from '@/router'
import store from '@/store'
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'
import '@styles/styles.scss'
import PullRefresh from 'pull-refresh-vue3'
import { createApp } from 'vue'

loadFonts()

// Create vue app
const app = createApp(App)

// Use plugins Mount vue app
app
.use(vuetify)
.use(router)
.use(store)
.use(PullRefresh)
.mount('#app')
