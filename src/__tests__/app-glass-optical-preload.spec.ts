import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(cwd(), 'src/App.vue'), 'utf8')
const preloadWatchStart = appSource.indexOf("watch(\n  () => isGlassTheme.value && opticalQuality.value !== 'css',")
const preloadWatchEnd = appSource.indexOf('const transparentBackgroundBlur', preloadWatchStart)
const preloadWatch = appSource.slice(preloadWatchStart, preloadWatchEnd)

describe('App 玻璃光学模块预载', () => {
  it('只在非 CSS 玻璃档位的 guard 内并行预载组件和 Three', () => {
    expect(preloadWatchStart).toBeGreaterThanOrEqual(0)
    expect(preloadWatchEnd).toBeGreaterThan(preloadWatchStart)
    expect(preloadWatch).toContain('if (!enabled) return')
    expect(preloadWatch).toContain("void Promise.all([loadGlassOpticalLayer(), import('three')])")
    expect(preloadWatch.indexOf("import('three')")).toBeGreaterThan(preloadWatch.indexOf('if (!enabled) return'))
    expect(appSource.match(/import\('three'\)/gu)).toHaveLength(1)
  })

  it('提前挂载以准备光学资源，但保留首路由呈现门和 loader 退场时序', () => {
    expect(appSource).toContain(
      "const loadGlassOpticalLayer = () => import('@/components/theme/GlassOpticalLayer.vue')",
    )
    expect(appSource).toContain('const GlassOpticalLayer = defineAsyncComponent(loadGlassOpticalLayer)')
    const mountGate = appSource.slice(
      appSource.indexOf('const shouldRenderGlassOpticalLayer = computed('),
      appSource.indexOf('const loadGlassOpticalLayer ='),
    )
    expect(mountGate).toContain("opticalQuality.value !== 'css'")
    expect(mountGate).toContain('Boolean(activeBackgroundImage.value)')
    expect(mountGate).not.toContain('isInitialRouteReady')
    expect(appSource).toContain('v-if="shouldRenderGlassOpticalLayer"')
    expect(appSource).toContain(':presentation-ready="isInitialRouteReady"')
    expect(appSource).toContain('const LAUNCH_EXIT_DURATION_MS = 180')
    expect(appSource).toContain("removeEl('#loading-bg')")
    expect(appSource).toContain('}, LAUNCH_EXIT_DURATION_MS)')
  })

  it('启动屏退场前等待首路由、基础数据和首张壁纸完成', () => {
    const readinessStart = appSource.indexOf('async function waitForInitialContentReady()')
    const readinessEnd = appSource.indexOf('// 延迟初始化登录态数据', readinessStart)
    const readinessSource = appSource.slice(readinessStart, readinessEnd)
    const launchStart = appSource.indexOf('async function removeLoadingWithStateCheck()')
    const launchEnd = appSource.indexOf('// 加载背景图片', launchStart)
    const launchSource = appSource.slice(launchStart, launchEnd)

    expect(readinessStart).toBeGreaterThanOrEqual(0)
    expect(readinessEnd).toBeGreaterThan(readinessStart)
    expect(readinessSource).toContain('initialRouteReadyPromise')
    expect(readinessSource).toContain('initializeAuthenticatedState()')
    expect(readinessSource).toContain('initialBackgroundLoadPromise')
    expect(readinessSource).toContain('await nextTick()')
    expect(readinessSource).toContain('window.requestAnimationFrame')
    expect(launchSource).toContain('await waitForInitialContentReady()')
    expect(launchSource).not.toContain('void initializeAuthenticatedState()')
  })
})
