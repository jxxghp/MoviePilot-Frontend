import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { VBtn } from 'vuetify/components/VBtn'
import * as labsComponents from 'vuetify/labs/components'
import AppDialog from './AppDialog'
import defaults from './defaults'
import { icons } from './icons'
import theme from './theme'

export default createVuetify({
  aliases: {
    IconBtn: VBtn,
  },
  defaults,
  icons,
  theme,
  components: {
    ...components,
    VDialog: AppDialog,
    ...labsComponents,
  },
})
