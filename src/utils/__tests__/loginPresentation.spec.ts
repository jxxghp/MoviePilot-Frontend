import {
  activateLoginBackgroundLayer,
  createLoginBackgroundLayers,
  getLoginGlassOpticalSettings,
  getLoginVisualProfile,
  prepareLoginBackgroundLayer,
  settleLoginBackgroundLayers,
} from '@/utils/loginPresentation'
import { describe, expect, it } from 'vitest'

describe('login presentation', () => {
  it('maps resolved themes to mutually exclusive visual profiles', () => {
    expect(getLoginVisualProfile('glass')).toBe('glass')
    expect(getLoginVisualProfile('transparent')).toBe('transparent')
    expect(getLoginVisualProfile('purple')).toBe('classic')
    expect(getLoginVisualProfile('light')).toBe('classic')
  })

  it('forces high-quality capability while preserving all six user strengths', () => {
    expect(
      getLoginGlassOpticalSettings({
        appearance: 'frosted',
        deformationStrength: 73,
        flowStrength: 68,
        preset: 'liquid',
        reflectionStrength: 41,
        transmissionStrength: 62,
        translationStrength: 57,
        transparencyStrength: 46,
      }),
    ).toEqual({
      appearance: 'frosted',
      deformationStrength: 73,
      flowStrength: 68,
      preset: 'liquid',
      quality: 'high',
      reflectionStrength: 41,
      transmissionStrength: 62,
      translationStrength: 57,
      transparencyStrength: 46,
    })
  })

  it('keeps two stable wallpaper slots while their transition roles change', () => {
    const initial = createLoginBackgroundLayers('one.jpg')
    const prepared = prepareLoginBackgroundLayer(initial, 'two.jpg')
    const activated = activateLoginBackgroundLayer(prepared)
    const settled = settleLoginBackgroundLayers(activated)

    expect(initial).toEqual([
      { key: 'front', role: 'active', url: 'one.jpg' },
      { key: 'back', role: 'standby', url: '' },
    ])
    expect(prepared).toEqual([
      { key: 'front', role: 'active', url: 'one.jpg' },
      { key: 'back', role: 'standby', url: 'two.jpg' },
    ])
    expect(activated).toEqual([
      { key: 'front', role: 'previous', url: 'one.jpg' },
      { key: 'back', role: 'active', url: 'two.jpg' },
    ])
    expect(settled).toEqual([
      { key: 'front', role: 'standby', url: '' },
      { key: 'back', role: 'active', url: 'two.jpg' },
    ])
  })
})
