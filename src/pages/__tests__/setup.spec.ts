import SetupPage from '@/pages/setup.vue'
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  completeWizard: vi.fn(),
  initialize: vi.fn(),
  nextStep: vi.fn(),
  prevStep: vi.fn(),
  routerPush: vi.fn(),
  state: undefined as
    | undefined
    | {
        connectivityTest: Ref<{ isTesting: boolean }>
        currentStep: ReturnType<typeof ref<number>>
        isActionPending: ReturnType<typeof ref<boolean>>
        isLoading: ReturnType<typeof ref<boolean>>
        stepTitles: ReturnType<typeof ref<string[]>>
      },
}))

vi.mock('@/composables/useSetupWizard', () => ({
  useSetupWizard: () => ({
    completeWizard: mocks.completeWizard,
    connectivityTest: mocks.state!.connectivityTest,
    currentStep: mocks.state!.currentStep,
    initialize: mocks.initialize,
    isActionPending: mocks.state!.isActionPending,
    isLoading: mocks.state!.isLoading,
    nextStep: mocks.nextStep,
    prevStep: mocks.prevStep,
    stepTitles: mocks.state!.stepTitles,
    totalSteps: 8,
  }),
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: mocks.routerPush }),
}))

vi.mock('vuetify', async importOriginal => ({
  ...(await importOriginal<typeof import('vuetify')>()),
  useDisplay: () => ({ mdAndUp: ref(true), smAndDown: ref(false) }),
}))

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    icon: String,
    prependIcon: String,
  },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          'aria-label': props.icon || props.prependIcon,
          disabled: props.disabled,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const PassThrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('div', slots.default?.()),
})

const StepperItemStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('div', { 'data-testid': 'step-title' }, slots.title?.()),
})

const StepperStub = defineComponent({
  props: { modelValue: Number },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', [
        h(
          'button',
          {
            'data-testid': 'stepper-update',
            onClick: () => emit('update:modelValue', (props.modelValue ?? 1) + 1),
          },
          'update step',
        ),
        slots.default?.(),
      ])
  },
})

function stepStub(name: string) {
  return defineComponent({
    name,
    setup: () => () => h('section', { 'data-step': name }, name),
  })
}

const globalStubs = {
  AgentSettingsStep: stepStub('AgentSettingsStep'),
  BasicSettingsStep: stepStub('BasicSettingsStep'),
  ConnectivityTest: stepStub('ConnectivityTest'),
  DownloaderSettingsStep: stepStub('DownloaderSettingsStep'),
  MediaServerSettingsStep: stepStub('MediaServerSettingsStep'),
  NotificationSettingsStep: stepStub('NotificationSettingsStep'),
  PreferencesSettingsStep: stepStub('PreferencesSettingsStep'),
  SiteAuthSettingsStep: stepStub('SiteAuthSettingsStep'),
  StorageSettingsStep: stepStub('StorageSettingsStep'),
  VBtn: ButtonStub,
  VCard: PassThrough,
  VCardActions: PassThrough,
  VCardText: PassThrough,
  VDivider: true,
  VProgressCircular: stepStub('LoadingIndicator'),
  VStepper: StepperStub,
  VStepperHeader: PassThrough,
  VStepperItem: StepperItemStub,
  VStepperWindow: PassThrough,
  VStepperWindowItem: PassThrough,
}

function mountPage() {
  return mount(SetupPage, { global: { stubs: globalStubs } })
}

describe('setup page orchestration', () => {
  beforeEach(() => {
    mocks.completeWizard.mockReset()
    mocks.initialize.mockReset()
    mocks.nextStep.mockReset()
    mocks.prevStep.mockReset()
    mocks.routerPush.mockReset()
    mocks.initialize.mockResolvedValue(undefined)
    mocks.state = {
      connectivityTest: ref({ isTesting: false }),
      currentStep: ref(1),
      isActionPending: ref(false),
      isLoading: ref(false),
      stepTitles: ref(Array.from({ length: 8 }, (_, index) => `step-${index + 1}`)),
    }
  })

  it('initializes and renders the loading state instead of setup steps', async () => {
    mocks.state!.isLoading.value = true
    const wrapper = mountPage()

    expect(mocks.initialize).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('setupWizard.loading')
    expect(wrapper.find('[data-step="LoadingIndicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-step="BasicSettingsStep"]').exists()).toBe(false)
  })

  it('composes all eight step components without duplicating their business templates', () => {
    const wrapper = mountPage()

    expect(wrapper.findAll('[data-step$="SettingsStep"]').map(node => node.attributes('data-step'))).toEqual([
      'BasicSettingsStep',
      'SiteAuthSettingsStep',
      'StorageSettingsStep',
      'DownloaderSettingsStep',
      'MediaServerSettingsStep',
      'NotificationSettingsStep',
      'AgentSettingsStep',
      'PreferencesSettingsStep',
    ])
    expect(wrapper.text()).toContain('step-1')
    expect(wrapper.text()).toContain('step-8')
  })

  it('keeps the current step synchronized with stepper model updates', async () => {
    const wrapper = mountPage()

    await wrapper.get('[data-testid="stepper-update"]').trigger('click')

    expect(mocks.state!.currentStep.value).toBe(2)
  })

  it('routes header commands to settings and home', async () => {
    const wrapper = mountPage()

    await wrapper.get('button[aria-label="mdi-cog"]').trigger('click')
    await wrapper.get('button[aria-label="mdi-close"]').trigger('click')

    expect(mocks.routerPush.mock.calls).toEqual([['/setting'], ['/']])
  })

  it('delegates previous and next while the action is idle', async () => {
    mocks.state!.currentStep.value = 4
    const wrapper = mountPage()

    await wrapper.get('button[aria-label="mdi-chevron-left"]').trigger('click')
    const next = wrapper.findAll('button').find(button => button.text().includes('common.next'))
    expect(next).toBeDefined()
    await next!.trigger('click')

    expect(mocks.prevStep).toHaveBeenCalledTimes(1)
    expect(mocks.nextStep).toHaveBeenCalledTimes(1)
  })

  it('disables previous and next for the entire pending action, including save time', async () => {
    mocks.state!.currentStep.value = 4
    mocks.state!.isActionPending.value = true
    const wrapper = mountPage()
    const previous = wrapper.get('button[aria-label="mdi-chevron-left"]')
    const next = wrapper.findAll('button').find(button => button.text().includes('common.next'))

    expect(previous.attributes('disabled')).toBeDefined()
    expect(next).toBeDefined()
    expect(next!.attributes('disabled')).toBeDefined()
    await previous.trigger('click')
    await next!.trigger('click')
    expect(mocks.prevStep).not.toHaveBeenCalled()
    expect(mocks.nextStep).not.toHaveBeenCalled()
  })

  it('labels the pending next action as connectivity testing while its test is running', () => {
    mocks.state!.currentStep.value = 4
    mocks.state!.isActionPending.value = true
    mocks.state!.connectivityTest.value.isTesting = true

    const wrapper = mountPage()

    expect(wrapper.text()).toContain('setupWizard.testing')
    expect(wrapper.text()).not.toContain('common.next')
  })

  it('disables complete for the entire pending action and delegates it when idle', async () => {
    mocks.state!.currentStep.value = 8
    mocks.state!.isActionPending.value = true
    const pendingWrapper = mountPage()
    const pendingComplete = pendingWrapper.get('button[aria-label="mdi-check"]')
    expect(pendingComplete.attributes('disabled')).toBeDefined()
    await pendingComplete.trigger('click')
    expect(mocks.completeWizard).not.toHaveBeenCalled()

    pendingWrapper.unmount()
    mocks.state!.isActionPending.value = false
    const idleWrapper = mountPage()
    await idleWrapper.get('button[aria-label="mdi-check"]').trigger('click')
    expect(mocks.completeWizard).toHaveBeenCalledTimes(1)
  })
})
