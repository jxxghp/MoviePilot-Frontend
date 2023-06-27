import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { VBtn } from 'vuetify/components/VBtn'
import * as labsComponents from 'vuetify/labs/components'
import defaults from './defaults'
import { icons } from './icons'
import theme from './theme'
// Styles
import '@core/scss/template/libs/vuetify/index.scss'
import 'vuetify/styles'

export default createVuetify({
  aliases: {
    IconBtn: VBtn,
  },
  defaults,
  icons,
  theme,
  components: {
    ...components,
    ...labsComponents,
  },
})
