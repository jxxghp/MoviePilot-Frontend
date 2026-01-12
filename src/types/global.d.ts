// PWA Badge API 类型定义
declare global {
  const __APP_VERSION__: string
  const __BUILD_TIME__: string

  interface Navigator {
    /**
     * 设置应用徽章数量
     * @param contents 要显示的数量，可选
     */
    setAppBadge(contents?: number): Promise<void>

    /**
     * 清除应用徽章
     */
    clearAppBadge(): Promise<void>
  }
}

export {}
