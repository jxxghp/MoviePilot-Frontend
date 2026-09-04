export interface GlassNavbarRefractionBrowserIdentity {
  /** User-Agent Client Hints 暴露的浏览器品牌。 */
  userAgentData?: {
    brands?: readonly {
      brand: string
    }[]
  }
  /** Client Hints 不可用时使用的传统浏览器标识。 */
  userAgent: string
}

/** 仅在已验证 SVG backdrop 位移的 Chromium 引擎启用实时顶栏折射。 */
export function supportsGlassNavbarLiveRefraction(browserIdentity: GlassNavbarRefractionBrowserIdentity = navigator) {
  const brands = browserIdentity.userAgentData?.brands
  if (brands?.length) return brands.some(({ brand }) => brand === 'Chromium')

  return /\b(?:Chrome|Chromium)\/\d+/u.test(browserIdentity.userAgent)
}
