import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlassMobilePresentation } from '@/composables/useGlassPresentationCapabilities'

const mocks = vi.hoisted(() => ({
  smAndDown: null as { value: boolean } | null,
  usesTouchInput: null as { value: boolean } | null,
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  mocks.usesTouchInput = ref(false)

  return {
    useMediaQuery: vi.fn(() => mocks.usesTouchInput),
  }
})

vi.mock('vuetify', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  mocks.smAndDown = ref(false)

  return {
    useDisplay: () => ({ smAndDown: mocks.smAndDown }),
  }
})

describe('useGlassMobilePresentation', () => {
  beforeEach(() => {
    mocks.smAndDown!.value = false
    mocks.usesTouchInput!.value = false
  })

  it('reacts when DevTools switches between touch and desktop input', () => {
    const usesMobilePresentation = useGlassMobilePresentation()

    mocks.usesTouchInput!.value = true
    expect(usesMobilePresentation.value).toBe(true)

    mocks.usesTouchInput!.value = false
    expect(usesMobilePresentation.value).toBe(false)
  })

  it('keeps small viewports on the mobile presentation path', () => {
    const usesMobilePresentation = useGlassMobilePresentation()

    mocks.smAndDown!.value = true
    expect(usesMobilePresentation.value).toBe(true)
  })
})
