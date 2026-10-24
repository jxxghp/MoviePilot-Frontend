import { afterEach, describe, expect, it } from 'vitest'
import { readNativePresentation } from '../presentation'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('菜单与全屏弹窗的导航语义', () => {
  it('普通菜单和普通弹窗保留底栏，只有全屏声明隐藏底栏', () => {
    const overlay = document.createElement('div')
    document.body.append(overlay)
    overlay.className = 'v-overlay--active v-menu'
    expect(readNativePresentation(document)).toEqual({ overlayOpen: true, fullscreen: false })
    overlay.className = 'v-overlay--active v-dialog'
    expect(readNativePresentation(document)).toEqual({ overlayOpen: true, fullscreen: false })
    overlay.classList.add('v-dialog--fullscreen')
    expect(readNativePresentation(document)).toEqual({ overlayOpen: true, fullscreen: true })
    overlay.className = 'v-overlay--active v-tooltip'
    expect(readNativePresentation(document)).toEqual({ overlayOpen: false, fullscreen: false })
  })

  it('自定义主题全屏设置同样参与返回、遮挡与底栏互锁', () => {
    const customizer = document.createElement('aside')
    customizer.className = 'theme-customizer-panel-host'
    customizer.setAttribute('role', 'dialog')
    document.body.append(customizer)
    expect(readNativePresentation(document)).toEqual({ overlayOpen: true, fullscreen: true })
    customizer.remove()
    expect(readNativePresentation(document)).toEqual({ overlayOpen: false, fullscreen: false })
  })
})
