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

  it('保留异步组件原语、首路由挂载门槛和 loader 退场时序', () => {
    expect(appSource).toContain(
      "const loadGlassOpticalLayer = () => import('@/components/theme/GlassOpticalLayer.vue')",
    )
    expect(appSource).toContain('const GlassOpticalLayer = defineAsyncComponent(loadGlassOpticalLayer)')
    expect(appSource).toMatch(
      /const shouldRenderGlassOpticalLayer = computed\([\s\S]*?isGlassTheme\.value[\s\S]*?opticalQuality\.value !== 'css'[\s\S]*?isInitialRouteReady\.value/u,
    )
    expect(appSource).toContain('v-if="shouldRenderGlassOpticalLayer"')
    expect(appSource).toContain('const LAUNCH_EXIT_DURATION_MS = 180')
    expect(appSource).toContain("removeEl('#loading-bg')")
    expect(appSource).toContain('}, LAUNCH_EXIT_DURATION_MS)')
  })
})
