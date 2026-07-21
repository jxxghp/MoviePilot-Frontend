import type { IndexHtmlTransformContext, IndexHtmlTransformResult, ViteDevServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import {
  createDevServiceWorkerCleanupPlugin,
  deleteCurrentOriginCaches,
  DEV_SW_CLEANUP_PATH,
  isManagedServiceWorkerRegistration,
  isMoviePilotServiceWorkerIdentityResponse,
  isPwaDevelopmentEnabled,
  retryMoviePilotIdentityVerification,
  resolveDevAppScope,
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

  it('只匹配当前应用 scope 下精确的 MoviePilot Worker URL', () => {
    const pageUrl = 'http://localhost:5173/moviepilot/#/dashboard'
    const scope = 'http://localhost:5173/moviepilot/'

    expect(resolveDevAppScope(pageUrl).href).toBe(scope)
    expect(isManagedServiceWorkerRegistration(`${scope}dev-sw.js?dev-sw`, scope, pageUrl)).toBe(true)
    expect(isManagedServiceWorkerRegistration(`${scope}service-worker.js`, scope, pageUrl)).toBe(true)
    expect(isManagedServiceWorkerRegistration(`${scope}unrelated-sw.js`, scope, pageUrl)).toBe(false)
    expect(
      isManagedServiceWorkerRegistration(
        'http://localhost:5173/another-app/service-worker.js',
        'http://localhost:5173/another-app/',
        pageUrl,
      ),
    ).toBe(false)
    expect(
      isManagedServiceWorkerRegistration(
        'http://localhost:5174/moviepilot/dev-sw.js?dev-sw',
        'http://localhost:5174/moviepilot/',
        pageUrl,
      ),
    ).toBe(false)
  })

  it('只有现有 MoviePilot 消息协议响应才能通过身份确认', () => {
    expect(isMoviePilotServiceWorkerIdentityResponse({ count: 0 })).toBe(true)
    expect(isMoviePilotServiceWorkerIdentityResponse({ count: 3 })).toBe(true)
    expect(isMoviePilotServiceWorkerIdentityResponse({ success: true })).toBe(false)
    expect(isMoviePilotServiceWorkerIdentityResponse(null)).toBe(false)
  })

  it('身份确认首次失败后重试，持续失败时保持 fail-closed', async () => {
    const succeedsOnRetry = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const alwaysFails = vi.fn().mockResolvedValue(false)

    await expect(retryMoviePilotIdentityVerification(succeedsOnRetry, 2)).resolves.toBe(true)
    expect(succeedsOnRetry).toHaveBeenCalledTimes(2)
    await expect(retryMoviePilotIdentityVerification(alwaysFails, 2)).resolves.toBe(false)
    expect(alwaysFails).toHaveBeenCalledTimes(2)
  })

  it('删除当前 dev origin 的全部 Cache Storage', async () => {
    const keys = vi.fn().mockResolvedValue(['precache', 'static-resources', 'api-cache'])
    const deleteCache = vi.fn().mockResolvedValue(true)

    await deleteCurrentOriginCaches({ keys, delete: deleteCache })

    expect(keys).toHaveBeenCalledOnce()
    expect(deleteCache).toHaveBeenCalledTimes(3)
    expect(deleteCache).toHaveBeenNthCalledWith(1, 'precache')
    expect(deleteCache).toHaveBeenNthCalledWith(2, 'static-resources')
    expect(deleteCache).toHaveBeenNthCalledWith(3, 'api-cache')
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
    const entryTag = '<script type="module" src="/src/main.ts"></script>'
    const result = await (
      transform as {
        handler: (html: string, context: IndexHtmlTransformContext) => IndexHtmlTransformResult
      }
    ).handler(`<main>loading</main>${entryTag}`, {} as IndexHtmlTransformContext)
    if (!result || Array.isArray(result) || typeof result === 'string') {
      throw new Error('Expected transformIndexHtml to gate the development entry')
    }
    const [script] = result.tags ?? []

    expect(result.html).toBe('<main>loading</main>')
    expect(script.injectTo).toBe('head-prepend')
    if (typeof script.children !== 'string') throw new TypeError('Expected an inline cleanup script')
    const scriptContent = script.children

    expect(scriptContent).toContain('cleanupPath.slice(1)')
    expect(scriptContent).not.toContain("replace(/^//, '')")
    expect(scriptContent).toContain('dev-sw.js?dev-sw')
    expect(scriptContent).toContain('service-worker.js')
    expect(scriptContent).toContain(DEV_SW_CLEANUP_PATH)
    expect(scriptContent).toContain('GET_UNREAD_COUNT')
    expect(scriptContent).toContain('const identityTimeoutMs = 1500')
    expect(scriptContent).toContain('const identityAttempts = 2')
    expect(scriptContent).toContain('retryMoviePilotIdentityVerification')
    expect(scriptContent).toContain('entry.src = entryScriptUrl')
    expect(scriptContent).toContain('startApp()')
    expect(scriptContent).toContain('verifyMoviePilotWorkerOnce')
    expect(scriptContent).toContain('verifyMoviePilotWorker')
    expect(scriptContent).toContain("cleanupState === 'complete'")
    expect(scriptContent).toContain("sessionStorage.setItem(cleanupAttemptKey, 'pending')")
    expect(scriptContent).toContain('encodeURIComponent(appScope.pathname)')
    expect(scriptContent).toContain('deleteCurrentOriginCaches(caches)')
    expect(scriptContent).toContain('location.reload()')
    expect(scriptContent.indexOf('deleteCurrentOriginCaches(caches)')).toBeLessThan(
      scriptContent.indexOf('sessionStorage.removeItem(cleanupAttemptKey)'),
    )
  })

  it('开发入口标签缺失时立即失败，避免普通 dev 静默白屏', () => {
    const transform = createDevServiceWorkerCleanupPlugin().transformIndexHtml

    expect(() =>
      (
        transform as {
          handler: (html: string, context: IndexHtmlTransformContext) => IndexHtmlTransformResult
        }
      ).handler('<main>missing entry</main>', {} as IndexHtmlTransformContext),
    ).toThrow('Expected development entry tag')
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
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('verifyMoviePilotWorker'))
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('const identityTimeoutMs = 1500'))
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('const identityAttempts = 2'))
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining("sessionStorage.getItem(cleanupAttemptKey) !== 'pending'"),
    )
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining("const appScope = new URL('./', location.href)"))
    expect(response.end).not.toHaveBeenCalledWith(expect.stringContaining("new URL('./', returnUrl)"))
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining("sessionStorage.setItem(cleanupAttemptKey, 'complete')"),
    )
    expect(response.end).toHaveBeenCalledWith(expect.stringContaining('deleteCurrentOriginCaches(caches)'))
    expect(response.end).not.toHaveBeenCalledWith(expect.stringContaining('localStorage.clear'))

    const cleanupDocument = vi.mocked(response.end).mock.calls[0]?.[0]
    if (typeof cleanupDocument !== 'string') throw new TypeError('Expected cleanup document')
    expect(cleanupDocument.indexOf("sessionStorage.getItem(cleanupAttemptKey) !== 'pending'")).toBeLessThan(
      cleanupDocument.indexOf('deleteCurrentOriginCaches(caches)'),
    )
    expect(cleanupDocument.indexOf('if (!managedRegistrations.length) throw new Error')).toBeLessThan(
      cleanupDocument.indexOf('deleteCurrentOriginCaches(caches)'),
    )
  })
})

interface ResponseStub {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body: string) => void
}
