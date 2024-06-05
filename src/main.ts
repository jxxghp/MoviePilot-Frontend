import '@/@core/utils/compatibility'
import './ace-config'
import '@/@iconify/icons-bundle'
import '@/plugins/webfontloader'
import App from '@/App.vue'
import vuetify from '@/plugins/vuetify'
import router from '@/router'
import store from '@/store'
import { VAceEditor } from 'vue3-ace-editor'
import { createApp } from 'vue'
import { removeEl } from './@core/utils/dom'
import { PerfectScrollbarPlugin } from 'vue3-perfect-scrollbar'
import { VTreeview } from 'vuetify/labs/VTreeview'
import ToastPlugin from 'vue-toast-notification'
import VuetifyUseDialog from 'vuetify-use-dialog'
import VueApexCharts from 'vue3-apexcharts'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import MediaCard from './components/cards/MediaCard.vue'
import PosterCard from './components/cards/PosterCard.vue'
import BackdropCard from './components/cards/BackdropCard.vue'
import PersonCard from './components/cards/PersonCard.vue'
import MediaInfoCard from './components/cards/MediaInfoCard.vue'
import TorrentCard from './components/cards/TorrentCard.vue'
import MediaIdSelector from './components/misc/MediaIdSelector.vue'
import PathField from './components/input/PathField.vue'
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'
import '@styles/styles.scss'
import 'vue-toast-notification/dist/theme-bootstrap.css'
import 'vue3-perfect-scrollbar/style.css'

// 创建Vue实例
const app = createApp(App)

// 注册全局组件
app
  .component('VAceEditor', VAceEditor)
  .component('VApexChart', VueApexCharts)
  .component('VDialogCloseBtn', DialogCloseBtn)
  .component('VMediaCard', MediaCard)
  .component('VPosterCard', PosterCard)
  .component('VBackdropCard', BackdropCard)
  .component('VPersonCard', PersonCard)
  .component('VMediaInfoCard', MediaInfoCard)
  .component('VTorrentCard', TorrentCard)
  .component('VMediaIdSelector', MediaIdSelector)
  .component('VTreeview', VTreeview)
  .component('VPathField', PathField)

// 注册插件
app
  .use(vuetify)
  .use(router)
  .use(store)
  .use(ToastPlugin, {
    position: 'bottom-right',
  })
  .use(VuetifyUseDialog, {
    confirmDialog: {
      dialogProps: {
        maxWidth: '40rem',
      },
      confirmationButtonProps: {
        variant: 'elevated',
        color: 'primary',
        class: 'me-3 px-5',
        'prepend-icon': 'mdi-check',
      },
      cancellationButtonProps: {
        variant: 'outlined',
        color: 'secondary',
        class: 'me-3',
      },
      confirmationText: '确认',
      cancellationText: '取消',
    },
  })
  .use(PerfectScrollbarPlugin)
  .use(VueApexCharts)
  .mount('#app')
  .$nextTick(() => removeEl('#loading-bg'))
