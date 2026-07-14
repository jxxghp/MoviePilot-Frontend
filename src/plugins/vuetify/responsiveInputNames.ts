export const responsiveInputCoreComponentNames = [
  'VAutocomplete',
  'VCheckbox',
  'VCombobox',
  'VFileInput',
  'VRadioGroup',
  'VRangeSlider',
  'VSelect',
  'VSlider',
  'VSwitch',
  'VTextarea',
  'VTextField',
] as const

export const responsiveInputComponentNames = [
  ...responsiveInputCoreComponentNames,
  'VDateInput',
  'VNumberInput',
] as const

export type ResponsiveInputComponentName = typeof responsiveInputComponentNames[number]
