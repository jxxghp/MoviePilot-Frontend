import {
  applyTransparencySettings,
  cancelTransparencyPreview,
  commitTransparencyPreview,
  previewTransparencySettings,
  readTransparencySettings,
  useTransparencySettings,
  type TransparencySettings,
} from '@/composables/useTransparencySettings'
import { beforeEach, describe, expect, it } from 'vitest'

const storedSettings: TransparencySettings = {
  backgroundBlur: 16,
  backgroundPosterOpacity: 0.2,
  blur: 10,
  glassQuality: 'lightweight',
  level: 'medium',
  opacity: 0.3,
}

describe('useTransparencySettings preview transaction', () => {
  beforeEach(() => {
    cancelTransparencyPreview()
    localStorage.clear()
    applyTransparencySettings(storedSettings)
  })

  it('previews changes without writing them to local storage', () => {
    previewTransparencySettings({
      backgroundBlur: 24,
      glassQuality: 'realtime',
      opacity: 0.7,
    })

    expect(document.documentElement.style.getPropertyValue('--transparent-opacity')).toBe('0.7')
    expect(document.documentElement.style.getPropertyValue('--transparent-background-blur')).toBe('24px')
    expect(document.documentElement.classList.contains('transparent-glass-realtime')).toBe(true)
    expect(readTransparencySettings()).toEqual(storedSettings)
  })

  it('commits the latest preview as one persisted state', () => {
    previewTransparencySettings({ opacity: 0.7 })
    previewTransparencySettings({ backgroundBlur: 24, glassQuality: 'realtime' })

    commitTransparencyPreview()

    expect(readTransparencySettings()).toEqual({
      ...storedSettings,
      backgroundBlur: 24,
      glassQuality: 'realtime',
      opacity: 0.7,
    })
  })

  it('restores the persisted appearance when the preview is cancelled', () => {
    previewTransparencySettings({
      backgroundBlur: 24,
      glassQuality: 'realtime',
      opacity: 0.7,
    })

    cancelTransparencyPreview()

    expect(document.documentElement.style.getPropertyValue('--transparent-opacity')).toBe('0.3')
    expect(document.documentElement.style.getPropertyValue('--transparent-background-blur')).toBe('16px')
    expect(document.documentElement.classList.contains('transparent-glass-lightweight')).toBe(true)
    expect(readTransparencySettings()).toEqual(storedSettings)
  })

  it('keeps reset as a preview until the dialog saves it', () => {
    applyTransparencySettings({
      backgroundBlur: 25,
      backgroundPosterOpacity: 0.6,
      blur: 20,
      glassQuality: 'realtime',
      level: '',
      opacity: 0.8,
    })
    const settings = useTransparencySettings()

    settings.resetTransparencySettings()

    expect(readTransparencySettings()).toMatchObject({
      backgroundBlur: 25,
      backgroundPosterOpacity: 0.6,
      blur: 20,
      glassQuality: 'realtime',
      opacity: 0.8,
    })

    settings.saveTransparencySettings()

    expect(readTransparencySettings()).toEqual({
      ...storedSettings,
      backgroundPosterOpacity: 0,
    })
  })
})
