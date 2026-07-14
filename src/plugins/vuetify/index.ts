import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { VBtn } from 'vuetify/components/VBtn'
import * as labsComponents from 'vuetify/labs/components'
import AppDialog from './AppDialog'
import { createResponsiveInputAdapter } from './AppInput'
import defaults from './defaults'
import { icons } from './icons'
import type { ResponsiveInputComponentName } from './responsiveInputNames'
import theme from './theme'

const responsiveInputComponents = {
  VAutocomplete: createResponsiveInputAdapter(components.VAutocomplete, { name: 'Autocomplete', kind: 'field' }),
  VCheckbox: createResponsiveInputAdapter(components.VCheckbox, { name: 'Checkbox', kind: 'choice' }),
  VCombobox: createResponsiveInputAdapter(components.VCombobox, { name: 'Combobox', kind: 'field' }),
  VDateInput: createResponsiveInputAdapter(labsComponents.VDateInput, { name: 'DateInput', kind: 'field' }),
  VFileInput: createResponsiveInputAdapter(components.VFileInput, { name: 'FileInput', kind: 'field' }),
  VNumberInput: createResponsiveInputAdapter(labsComponents.VNumberInput, { name: 'NumberInput', kind: 'field' }),
  VRadioGroup: createResponsiveInputAdapter(components.VRadioGroup, { name: 'RadioGroup', kind: 'group' }),
  VRangeSlider: createResponsiveInputAdapter(components.VRangeSlider, { name: 'RangeSlider', kind: 'range' }),
  VSelect: createResponsiveInputAdapter(components.VSelect, { name: 'Select', kind: 'field' }),
  VSlider: createResponsiveInputAdapter(components.VSlider, { name: 'Slider', kind: 'range' }),
  VSwitch: createResponsiveInputAdapter(components.VSwitch, { name: 'Switch', kind: 'choice' }),
  VTextarea: createResponsiveInputAdapter(components.VTextarea, { name: 'Textarea', kind: 'multiline' }),
  VTextField: createResponsiveInputAdapter(components.VTextField, { name: 'TextField', kind: 'field' }),
} satisfies Record<ResponsiveInputComponentName, ReturnType<typeof createResponsiveInputAdapter>>

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
    VDialog: AppDialog,
    ...responsiveInputComponents,
  },
})
