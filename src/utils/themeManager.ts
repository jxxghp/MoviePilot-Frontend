import { applyDocumentThemeChrome } from '@/utils/themePalette'

// 主题管理器 - 动态加载主题CSS
export interface ThemeConfig {
  name: string
  cssPath: string
  isLoaded: boolean
}

class ThemeManager {
  private themes: Map<string, ThemeConfig> = new Map()
  private currentTheme: string = 'default'
  private loadedLinks: Map<string, HTMLLinkElement> = new Map()
  private themeListeners: Map<(theme: string) => void, EventListener> = new Map()

  constructor() {
    // 注册所有可用主题
    this.registerTheme('default', '')
    this.registerTheme('light', '')
    this.registerTheme('dark', '')
    this.registerTheme('purple', '')
    this.registerTheme('auto', '')
    // 只有透明主题有特定的CSS文件
    this.registerTheme('transparent', './src/styles/themes/transparent.css')
  }

  /**
   * 注册主题
   */
  registerTheme(name: string, cssPath: string): void {
    this.themes.set(name, {
      name,
      cssPath,
      isLoaded: false,
    })
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): string {
    return this.currentTheme
  }

  /**
   * 设置主题
   */
  async setTheme(themeName: string): Promise<void> {
    if (!this.themes.has(themeName)) {
      console.warn(`Theme "${themeName}" not found`)
      return
    }

    const theme = this.themes.get(themeName)!

    // 清理其他主题的CSS（除了当前要设置的主题）
    this.unloadOtherThemes()

    // 如果主题有CSS文件，则加载CSS
    if (theme.cssPath) {
      try {
        await this.loadThemeCSS(themeName, theme.cssPath)
      } catch (error) {
        console.error(`Failed to load CSS for theme "${themeName}":`, error)
        // 即使CSS加载失败，也继续应用主题（使用默认样式）
      }
    }

    // 应用主题（无论是否有CSS文件）
    this.applyTheme(themeName)
  }

  /**
   * 加载主题CSS文件
   */
  private async loadThemeCSS(themeName: string, cssPath: string): Promise<void> {
    // 如果已经加载过，直接返回
    if (this.loadedLinks.has(themeName)) {
      return
    }

    try {
      // 动态导入CSS模块
      if (themeName === 'transparent') {
        await import('@/styles/themes/transparent.scss')
        this.themes.get(themeName)!.isLoaded = true
        return
      }

      // 对于其他主题，使用传统的link方式
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.type = 'text/css'
      link.href = cssPath
      link.id = `theme-${themeName}`

      // 等待CSS加载完成
      await new Promise<void>((resolve, reject) => {
        link.onload = () => {
          this.loadedLinks.set(themeName, link)
          this.themes.get(themeName)!.isLoaded = true
          resolve()
        }
        link.onerror = () => {
          reject(new Error(`Failed to load theme CSS: ${cssPath}`))
        }
      })

      // 添加到head
      document.head.appendChild(link)
    } catch (error) {
      console.error(`Error loading theme "${themeName}":`, error)
      throw error
    }
  }

  /**
   * 应用主题到DOM
   */
  private applyTheme(themeName: string): void {
    // auto 是用户偏好，DOM 上必须落到实际主题，避免恢复前台时短暂匹配不到深色样式。
    const { resolvedTheme } = applyDocumentThemeChrome(themeName)

    this.currentTheme = themeName

    // 触发主题变更事件
    this.dispatchThemeChangeEvent(resolvedTheme)
  }

  /**
   * 卸载主题CSS
   */
  unloadTheme(themeName: string): void {
    const theme = this.themes.get(themeName)
    if (!theme) return

    // 对于动态导入的CSS，我们无法直接卸载，但可以标记为未加载
    if (themeName === 'transparent') {
      theme.isLoaded = false
      return
    }

    // 对于传统link方式加载的CSS
    const link = this.loadedLinks.get(themeName)
    if (link) {
      link.remove()
      this.loadedLinks.delete(themeName)
      theme.isLoaded = false
    }
  }

  /**
   * 卸载所有主题CSS（除了当前主题）
   */
  unloadOtherThemes(): void {
    for (const [themeName] of this.themes) {
      if (themeName !== this.currentTheme && this.themes.get(themeName)?.isLoaded) {
        this.unloadTheme(themeName)
      }
    }
  }

  /**
   * 获取已注册的主题列表
   */
  getAvailableThemes(): string[] {
    return Array.from(this.themes.keys())
  }

  /**
   * 检查主题是否已加载
   */
  isThemeLoaded(themeName: string): boolean {
    return this.themes.get(themeName)?.isLoaded || false
  }

  /**
   * 触发主题变更事件
   */
  private dispatchThemeChangeEvent(themeName: string): void {
    const event = new CustomEvent('themechange', {
      detail: { theme: themeName },
    })
    document.dispatchEvent(event)
  }

  /**
   * 监听主题变更事件
   */
  onThemeChange(callback: (theme: string) => void): void {
    if (this.themeListeners.has(callback)) {
      return
    }

    const listener: EventListener = event => {
      callback((event as CustomEvent<{ theme: string }>).detail.theme)
    }

    this.themeListeners.set(callback, listener)
    document.addEventListener('themechange', listener)
  }

  /**
   * 移除主题变更监听器
   */
  offThemeChange(callback: (theme: string) => void): void {
    const listener = this.themeListeners.get(callback)
    if (!listener) {
      return
    }

    document.removeEventListener('themechange', listener)
    this.themeListeners.delete(callback)
  }
}

// 创建单例实例
export const themeManager = new ThemeManager()

// 导出类型
export type { ThemeManager }
