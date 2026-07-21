import type { IndexHtmlTransformContext, IndexHtmlTransformResult, ViteDevServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import {
  createDevServiceWorkerCleanupPlugin,
  DEV_SW_CLEANUP_PATH,
  isManagedCacheName,
  isManagedServiceWorkerUrl,
  isPwaDevelopmentEnabled,
  resolveDevCleanupReturnUrl,
  shouldEnableDevServiceWorkerCleanup,
} from '../../scripts/pwa-development'

describe('PWA 开发模式', () => {
  it('仅显式 dev:pwa 脚本启用开发 Service Worker', () => {
    expect(isPwaDevelopmentEnabled('development', 'dev')).toBe(false)
    expect(isPwaDevelopmentEnabled('development', 'dev:pwa')).toBe(true)
    expect(isPwaDevelopmentEnabled('production', 'dev:pwa')).toBe(false)
  })

  it('仅普通 development server 启用历史 Service Worker 清理', () => {
    expect(shouldEnableDevServiceWorkerCleanup('serve', 'development', false, 'dev')).toBe(true)
    expect(shouldEnableDevServiceWorkerCleanup('serve', 'development', false, 'dev:pwa')).toBe(false)
    expect(shouldEnableDevServiceWorkerCleanup('serve', 'production', true, 'preview')).toBe(false)
    expect(shouldEnableDevServiceWorkerCleanup('build', 'production', false, 'build')).toBe(false)
  })

  it('只匹配当前 origin 的 MoviePilot Service Worker 和缓存', () => {
    const origin = 'http://localhost:5173'

    expect(isManagedServiceWorkerUrl(`${origin}/dev-sw.js?dev-sw`, origin)).toBe(true)
    expect(isManagedServiceWorkerUrl(`${origin}/service-worker.js`, origin)).toBe(true)
    expect(isManagedServiceWorkerUrl(`${origin}/unrelated-sw.js`, origin)).toBe(false)
    expect(isManagedServiceWorkerUrl('http://localhost:5174/dev-sw.js?dev-sw', origin)).toBe(false)
    expect(isManagedCacheName('static-resources-dev-dev')).toBe(true)
    expect(isManagedCacheName('workbox-precache-v2-http://localhost:5173/')).toBe(true)
    expect(isManagedCacheName('unrelated-cache')).toBe(false)
  })

  it('清理完成后只返回当前 origin', () => {
    const origin = 'http://localhost:5173'

    expect(resolveDevCleanupReturnUrl('/#/dashboard', origin).href).toBe(`${origin}/#/dashboard`)
    expect(resolveDevCleanupReturnUrl('https://example.com/path', origin).href).toBe(`${origin}/`)
    expect(resolveDevCleanupReturnUrl(null, origin).href).toBe(`${origin}/`)
  })

  it('在应用入口前检查历史 MoviePilot Service Worker', async () => {
    const plugin = createDevServiceWorkerCleanupPlugin()
    const transform = plugin.transformIndexHtml

    expect(transform).toBeTypeOf('object')
    const result = await (
      transform as {
        handler: (html: string, context: IndexHtmlTransformContext) => IndexHtmlTransformResult
      }
    ).handler('', {} as IndexHtmlTransformContext)
    if (!Array.isArray(result)) throw new Error('Expected transformIndexHtml to return injected tags')
    const [script] = result

    expect(script.injectTo).toBe('head-prepend')
    expect(script.children).toContain('/dev-sw.js')
    expect(script.children).toContain('/service-worker.js')
    expect(script.children).toContain(DEV_SW_CLEANUP_PATH)
    expect(script.children).toContain('static-resources-')
    expect(script.children).toContain("cleanupState === 'complete'")
    expect(script.children).toContain('location.reload()')
  })

  it('提供不缓存的清理页面并只清理 MoviePilot 管理的浏览器状态', () => {
    const plugin = createDevServiceWorkerCleanupPlugin()
    let middleware: ((request: { url?: string }, response: ResponseStub, next: () => void) => void) | undefined
    const use = vi.fn(handler => {
      middleware = handler
    })
    const response: ResponseStub = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    }

    const configureServer = plugin.configureServer as (server: Pick<ViteDevServer, 'middlewares'>) => void
    configureServer({ middlewares: { use } } as unknown as Pick<ViteDevServer, 'middlewares'>)
    middleware?.({ url: DEV_SW_CLEANUP_PATH }, response, vi.fn())

    expect(response.statusCode).toBe(200)
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('registration.unregister()'))
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('name.startsWith(prefix)'))
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining("sessionStorage.setItem(cleanupAttemptKey, 'complete')"),
    )
    expect(response.end).not.toHaveBeenCalledWith(expect.stringContaining('localStorage.clear'))
  })
})

interface ResponseStub {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body: string) => void
}
