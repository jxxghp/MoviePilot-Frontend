import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LoginMfaStep from '@/components/auth/LoginMfaStep.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const slotStub = { template: '<div><slot /></div>' }
const buttonStub = {
  emits: ['click'],
  props: ['loading'],
  template: '<button :disabled="loading" @click="$emit(\'click\')"><slot /></button>',
}

function mountStep(methods: Array<'otp'>) {
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
})
