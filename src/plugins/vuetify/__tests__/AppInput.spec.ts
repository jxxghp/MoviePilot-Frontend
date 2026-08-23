import { mount } from '@vue/test-utils'
import { createResponsiveInputAdapter } from '@/plugins/vuetify/AppInput'
import { defineComponent, h, type VNode } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type ResponsiveInputKind = 'choice' | 'field' | 'group' | 'multiline' | 'range'

type ExposedInput = {
  blur: () => unknown
  focus: () => unknown
  reset: () => unknown
  resetValidation: () => unknown
  validate: (silent?: boolean) => unknown
}

const mocks = vi.hoisted(() => ({
  inputAttrs: {} as Record<string, unknown>,
  isMobile: { value: false },
  methods: {
    blur: vi.fn(() => 'blur-result'),
    focus: vi.fn(() => 'focus-result'),
    reset: vi.fn(() => 'reset-result'),
    resetValidation: vi.fn(() => 'reset-validation-result'),
    validate: vi.fn((silent?: boolean) => (silent ? 'silent-validation-result' : 'validation-result')),
  },
}))

vi.mock('vuetify', () => ({
  useDisplay: () => ({ smAndDown: mocks.isMobile }),
}))

const InputStub = defineComponent({
  name: 'InputStub',
  inheritAttrs: false,
  setup(_, { attrs, expose, slots }) {
    expose(mocks.methods)

    return () => {
      mocks.inputAttrs = { ...attrs }

      return h('div', { class: 'input-stub' }, [
        h('input', { ...attrs }),
        slots.default?.(),
        slots['append-inner']?.(),
        slots.label?.(),
      ])
    }
  },
})

type TestSlot = (slotProps?: unknown) => VNode

function mountAdapter(
  options: {
    kind?: ResponsiveInputKind
    props?: Record<string, unknown>
    attrs?: Record<string, unknown>
    slots?: Record<string, TestSlot>
  } = {},
) {
  const kind = options.kind ?? 'field'
  const adapter = createResponsiveInputAdapter(InputStub, { kind, name: `${kind}Input` })

  return mount(adapter, {
    attrs: options.attrs,
    props: options.props,
    slots: options.slots,
  })
}

function resetStub() {
  mocks.inputAttrs = {}
  mocks.methods.blur.mockClear()
  mocks.methods.focus.mockClear()
  mocks.methods.reset.mockClear()
  mocks.methods.resetValidation.mockClear()
  mocks.methods.validate.mockClear()
}

describe('createResponsiveInputAdapter', () => {
  beforeEach(() => {
    mocks.isMobile.value = false
    resetStub()
  })

  it('keeps desktop rendering, attributes, and slots on the original component', () => {
    const wrapper = mountAdapter({
      attrs: {
        class: 'desktop-class',
        id: 'desktop-id',
        label: 'Desktop label',
        modelValue: 'value',
        style: { color: 'red' },
      },
      slots: {
        default: () => h('span', { class: 'default-slot' }, 'default content'),
        label: () => h('span', { class: 'label-slot' }, 'label content'),
      },
    })

    expect(wrapper.find('.app-responsive-input').exists()).toBe(false)
    expect(wrapper.find('.default-slot').text()).toBe('default content')
    expect(wrapper.find('.label-slot').text()).toBe('label content')
    expect(mocks.inputAttrs).toMatchObject({
      class: 'desktop-class',
      id: 'desktop-id',
      label: 'Desktop label',
      modelValue: 'value',
    })
  })

  it.each([
    ['mobileLayout=false', { label: 'Name' }, { mobileLayout: false }],
    ['without a label', { hint: 'Hint' }, {}],
  ])('falls back to the original component when %s', (_, attrs, props) => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({ attrs, props })

    expect(wrapper.find('.app-responsive-input').exists()).toBe(false)
    expect(wrapper.find('.input-stub').exists()).toBe(true)
    expect(mocks.inputAttrs).toMatchObject(attrs)
  })

  it.each([
    ['field', true],
    ['multiline', true],
    ['choice', false],
    ['range', false],
    ['group', false],
  ] as const)('applies the %s mobile control contract', (kind, isTextInput) => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({ kind, attrs: { label: 'Title', modelValue: 'value' } })

    expect(wrapper.find('.app-responsive-input').classes()).toContain(`app-responsive-input--${kind}`)
    expect(mocks.inputAttrs).toMatchObject({
      'aria-label': 'Title',
      density: 'compact',
      id: expect.any(String),
      label: undefined,
      hint: undefined,
      persistentHint: false,
    })

    if (isTextInput) {
      expect(mocks.inputAttrs).toMatchObject({
        placeholder: '-',
        singleLine: true,
        variant: 'plain',
      })
    } else {
      expect(mocks.inputAttrs).not.toHaveProperty('placeholder')
      expect(mocks.inputAttrs).not.toHaveProperty('singleLine')
      expect(mocks.inputAttrs).not.toHaveProperty('variant')
    }
  })

  it('renders a label slot, hint, generated ids, and merged descriptions on mobile', () => {
    mocks.isMobile.value = true
    let receivedLabelProps: unknown
    const wrapper = mountAdapter({
      attrs: {
        'aria-describedby': 'existing custom-hint',
        hint: 'Helpful hint',
        label: 'Name',
      },
      slots: {
        label: props => {
          receivedLabelProps = props
          return h('span', { class: 'custom-label' }, 'custom label')
        },
      },
    })
    const controlId = String(mocks.inputAttrs.id)

    expect(controlId).toMatch(/^app-responsive-input-\d+$/)
    expect(wrapper.get('label').attributes('for')).toBe(controlId)
    expect(wrapper.get('.custom-label').text()).toBe('custom label')
    expect(wrapper.get('.app-responsive-input__hint').attributes('id')).toBe(`${controlId}-hint`)
    expect(wrapper.get('.app-responsive-input__hint').text()).toBe('Helpful hint')
    expect(mocks.inputAttrs['aria-describedby']).toBe(`existing custom-hint ${controlId}-hint ${controlId}-messages`)
    expect(receivedLabelProps).toEqual({ label: 'Name', props: { for: controlId } })
  })

  it('preserves an explicit id and aria-label while forwarding control slots', () => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({
      attrs: {
        'aria-label': 'Accessible name',
        id: 'custom-id',
        label: 'Visible label',
      },
      slots: {
        'append-inner': () => h('span', { class: 'append-inner-slot' }, 'append action'),
        default: () => h('span', { class: 'default-slot' }, 'control content'),
      },
    })

    expect(wrapper.get('label').attributes('for')).toBe('custom-id')
    expect(mocks.inputAttrs).toMatchObject({
      'aria-label': 'Accessible name',
      id: 'custom-id',
    })
    expect(wrapper.get('.default-slot').text()).toBe('control content')
    expect(wrapper.get('.app-responsive-input__control .append-inner-slot').text()).toBe('append action')
  })

  it.each([
    ['undefined', {}, true],
    ['true', { hideDetails: true }, false],
    ['empty string', { hideDetails: '' }, false],
    ['true string', { 'hide-details': 'true' }, false],
    ['false string', { 'hide-details': 'false' }, true],
  ])('uses hide-details semantics for %s', (_, attrs, showHint) => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({ attrs: { hint: 'Hint', label: 'Name', ...attrs } })

    expect(wrapper.find('.app-responsive-input__hint').exists()).toBe(showHint)
    if (showHint) {
      expect(mocks.inputAttrs['aria-describedby']).toEqual(expect.any(String))
    } else {
      expect(mocks.inputAttrs['aria-describedby']).toBeUndefined()
    }
  })

  it.each([
    ['empty field', 'field', {}, true, '-'],
    ['numeric model value', 'field', { modelValue: 0 }, false, '-'],
    ['explicit placeholder', 'field', { placeholder: 'Enter value' }, false, 'Enter value'],
    ['choice control', 'choice', {}, false, undefined],
  ] as Array<[string, ResponsiveInputKind, Record<string, unknown>, boolean, string | undefined]>)(
    'handles %s without losing the model contract',
    (_, kind, attrs, isEmpty, placeholder) => {
      mocks.isMobile.value = true
      const wrapper = mountAdapter({ kind, attrs: { label: 'Name', ...attrs } })

      expect(wrapper.find('.app-responsive-input').classes()).toContain(
        kind === 'field' && isEmpty ? 'app-responsive-input--empty' : `app-responsive-input--${kind}`,
      )
      if (Object.hasOwn(attrs, 'modelValue')) {
        expect(mocks.inputAttrs.modelValue).toBe(attrs.modelValue)
      } else {
        expect(mocks.inputAttrs).not.toHaveProperty('modelValue')
      }
      expect(mocks.inputAttrs.placeholder).toBe(placeholder)
    },
  )

  it('keeps root class and style on the mobile shell while giving the native control its own class', () => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({
      attrs: {
        class: 'outer-class',
        disabled: 'true',
        label: 'Name',
        style: { color: 'red' },
      },
      props: { mobileControlWidth: 40 },
    })
    const root = wrapper.get('.app-responsive-input')

    expect(root.classes()).toEqual(expect.arrayContaining(['app-responsive-input--disabled', 'outer-class']))
    const rootElement = root.element as HTMLElement

    expect(rootElement.style.color).toBe('red')
    expect(rootElement.style.getPropertyValue('--app-responsive-input-control-width')).toBe('40%')
    expect(mocks.inputAttrs.class).toBe('app-responsive-input__native')
    expect(mocks.inputAttrs.style).toBeUndefined()
  })

  it.each([
    [50, '50%'],
    [-10, '0%'],
    [120, '100%'],
    [' 42vw ', '42vw'],
    ['  ', undefined],
    [Number.POSITIVE_INFINITY, undefined],
  ] as const)('normalizes mobileControlWidth %s', (width, expected) => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({
      attrs: { label: 'Name' },
      props: { mobileControlWidth: width },
    })
    const rootElement = wrapper.get('.app-responsive-input').element as HTMLElement
    const actual = rootElement.style.getPropertyValue('--app-responsive-input-control-width')

    expect(actual || undefined).toBe(expected)
  })

  it('forwards all public control methods and their return values', () => {
    mocks.isMobile.value = true
    const wrapper = mountAdapter({ attrs: { label: 'Name' } })
    const exposed = wrapper.vm as unknown as ExposedInput

    expect(exposed.focus()).toBe('focus-result')
    expect(exposed.blur()).toBe('blur-result')
    expect(exposed.validate(true)).toBe('silent-validation-result')
    expect(exposed.reset()).toBe('reset-result')
    expect(exposed.resetValidation()).toBe('reset-validation-result')
    expect(mocks.methods.focus).toHaveBeenCalledOnce()
    expect(mocks.methods.blur).toHaveBeenCalledOnce()
    expect(mocks.methods.validate).toHaveBeenCalledWith(true)
    expect(mocks.methods.reset).toHaveBeenCalledOnce()
    expect(mocks.methods.resetValidation).toHaveBeenCalledOnce()
  })
})
