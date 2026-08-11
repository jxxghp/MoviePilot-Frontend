import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LoginMfaStep from '@/components/auth/LoginMfaStep.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const slotStub = { template: '<div><slot /></div>' }
const buttonStub = {
  emits: ['click'],
  props: ['disabled', 'loading', 'type'],
  template: '<button :type="type" :disabled="loading || disabled" @click="$emit(\'click\')"><slot /></button>',
}

function mountStep(
  methods: Array<'otp'>,
  props: Partial<{ errorMessage: string; otpLoading: boolean; otpPassword: string }> = {},
) {
  return shallowMount(LoginMfaStep, {
    global: {
      stubs: {
        VAlert: slotStub,
        VBtn: buttonStub,
        VIcon: true,
        VTextField: true,
      },
    },
    props: {
      errorMessage: '',
      methods,
      otpLoading: false,
      otpPassword: '',
      ...props,
    },
  })
}

describe('LoginMfaStep', () => {
  it('shows only the OTP form for an OTP-only account', () => {
    const wrapper = mountStep(['otp'])

    expect(wrapper.find('[data-testid="mfa-otp-form"]').exists()).toBe(true)
  })

  it('shows no authentication action when the server declares no supported method', () => {
    const wrapper = mountStep([])

    expect(wrapper.find('[data-testid="mfa-otp-form"]').exists()).toBe(false)
  })

  it('emits the OTP value and submits the current verification step', async () => {
    const wrapper = mountStep(['otp'])
    const input = wrapper.get('input[name="otp"]')

    await input.setValue('123456')
    await wrapper.setProps({ otpPassword: '123456' })
    await wrapper.get('[data-testid="mfa-otp-form"]').trigger('submit')

    expect(wrapper.emitted('update:otpPassword')).toEqual([['123456']])
    expect(wrapper.emitted('otp')).toHaveLength(1)
  })

  it('disables submission until an OTP is present', () => {
    const wrapper = mountStep(['otp'])

    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('locks input, back and submit actions while OTP verification is pending', () => {
    const wrapper = mountStep(['otp'], { otpLoading: true, otpPassword: '123456' })

    expect(wrapper.get('input[name="otp"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="mfa-back"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('emits back when the user returns to password login', async () => {
    const wrapper = mountStep(['otp'])

    await wrapper.get('[data-testid="mfa-back"]').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })

  it('shows the current verification error', () => {
    const wrapper = mountStep(['otp'], { errorMessage: '验证码错误' })

    expect(wrapper.text()).toContain('验证码错误')
  })
})
