import { flushPromises, shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Object3D } from 'three'
import OpticalLogoLab from '@/components/misc/OpticalLogoLab.vue'

const runtime = vi.hoisted(() => ({
  renderers: [] as Array<{ dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn> }>,
  pending: [] as Array<{
    scene: Object3D
    materials: Set<import('three').Material>
    resolve: () => void
    reject: (error: Error) => void
  }>,
  ticker: { add: vi.fn(), remove: vi.fn() },
}))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  return {
    ...three,
    WebGLRenderer: class {
      capabilities = { maxSamples: 4 }
      dispose = vi.fn()
      forceContextLoss = vi.fn()
      setClearColor = vi.fn()
      setPixelRatio = vi.fn()
      setSize = vi.fn()
      getPixelRatio = () => 1
      getSize = (target: import('three').Vector2) => target.set(160, 160)
      constructor() {
        runtime.renderers.push(this)
      }
      compile(scene: Object3D) {
        const materials = new Set<import('three').Material>()
        scene.traverse(object => {
          if (!(object instanceof three.Mesh)) return
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material)
          }
        })
        return materials
      }
      compileAsync(scene: Object3D) {
        const materials = this.compile(scene)
        return new Promise<void>((resolve, reject) => runtime.pending.push({ scene, materials, resolve, reject }))
      }
    },
    PMREMGenerator: class {
      fromScene = () => new three.WebGLRenderTarget(16, 16)
      dispose = vi.fn()
    },
  }
})

vi.mock('gsap', () => ({ gsap: { ticker: runtime.ticker } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/login', query: {} }) }))
vi.mock('vuetify', async () => {
  const { ref } = await import('vue')
  return {
    useTheme: () => ({
      global: {
        name: ref('light'),
        current: ref({ colors: { primary: '#00aabb', surface: '#ffffff', 'on-surface': '#111111' } }),
      },
    }),
  }
})
vi.mock('@/composables/useThemeCustomizer', () => ({ THEME_CUSTOMIZER_CHANGE_EVENT: 'theme-change' }))
vi.mock('@/components/misc/PrismaticLogo.vue', () => ({ default: { template: '<span />' } }))

let wrapper: ReturnType<typeof shallowMount> | undefined

beforeEach(() => {
  vi.useFakeTimers()
  runtime.renderers.length = 0
  runtime.pending.length = 0
  runtime.ticker.add.mockClear()
  runtime.ticker.remove.mockClear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.setItem(
    'moviepilot-optical-logo-lab-v2',
    JSON.stringify({ version: 2, pinned: true, pinnedCombination: 'crystal:none', staticMotion: 'steady' }),
  )
})

afterEach(async () => {
  wrapper?.unmount()
  wrapper = undefined
  runtime.pending.splice(0).forEach(pending => pending.resolve())
  await flushPromises()
})

async function mountUntilCompiling() {
  wrapper = shallowMount(OpticalLogoLab, { global: { stubs: { VSlider: true } } })
  await flushPromises()
  await vi.advanceTimersByTimeAsync(40)
  await vi.dynamicImportSettled()
  expect(runtime.pending).toHaveLength(1)
  return wrapper
}

async function settleCompilation(error?: Error) {
  const pending = runtime.pending.shift()!
  if (error) pending.reject(error)
  else pending.resolve()
  await flushPromises()
  return pending
}

function watchMaterials(scene: Object3D) {
  const listeners: Array<ReturnType<typeof vi.fn>> = []
  scene.traverse(object => {
    const mesh = object as import('three').Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const listener = vi.fn()
      material.addEventListener('dispose', listener)
      listeners.push(listener)
    }
  })
  expect(listeners.length).toBeGreaterThan(0)
  return listeners
}

describe('OpticalLogoLab compilation lifecycle', () => {
  it('cancels initial readiness checks before releasing resources on unmount', async () => {
    const mounted = await mountUntilCompiling()
    const owner = runtime.renderers[0]
    const batch = runtime.pending[0].materials
    expect(batch.size).toBeGreaterThan(0)
    const materials = watchMaterials(runtime.pending[0].scene)
    mounted.unmount()
    wrapper = undefined
    expect(batch.size).toBe(0)
    expect(owner.dispose).toHaveBeenCalledTimes(1)
    await settleCompilation()
    expect(owner.dispose).toHaveBeenCalledTimes(1)
    expect(owner.forceContextLoss).toHaveBeenCalledTimes(1)
    expect(materials.every(listener => listener.mock.calls.length > 0)).toBe(true)
    expect(runtime.ticker.add).not.toHaveBeenCalled()
  })

  it('cancels pending prewarm before releasing its material on unmount', async () => {
    const mounted = await mountUntilCompiling()
    await settleCompilation()
    expect(mounted.classes()).toContain('optical-logo-lab--ready')
    await vi.advanceTimersByTimeAsync(900)
    expect(runtime.pending).toHaveLength(1)
    const batch = runtime.pending[0].materials
    mounted.unmount()
    wrapper = undefined
    expect(batch.size).toBe(0)
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    const pending = await settleCompilation()
    expect(pending.scene.children).toHaveLength(0)
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(runtime.pending).toHaveLength(0)
  })

  it('does not let a stale compilation failure tear down a restored owner', async () => {
    const mounted = await mountUntilCompiling()
    const canvas = mounted.get('canvas').element
    const batch = runtime.pending[0].materials
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(batch.size).toBe(0)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    await flushPromises()
    expect(runtime.renderers).toHaveLength(2)
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    await settleCompilation(new Error('Old compilation stopped'))
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(runtime.renderers[0].forceContextLoss).not.toHaveBeenCalled()
    expect(runtime.renderers).toHaveLength(2)
    expect(runtime.renderers[1].dispose).not.toHaveBeenCalled()
    await settleCompilation()
    expect(mounted.classes()).toContain('optical-logo-lab--ready')
    expect(runtime.renderers[1].dispose).not.toHaveBeenCalled()
  })

  it('does not recreate the renderer if unmounted during asynchronous restoration', async () => {
    const mounted = await mountUntilCompiling()
    const canvas = mounted.get('canvas').element
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    mounted.unmount()
    wrapper = undefined
    await settleCompilation()
    expect(runtime.renderers).toHaveLength(1)
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(runtime.pending).toHaveLength(0)
  })

  it('isolates consecutive context generations while earlier compilations are pending', async () => {
    const mounted = await mountUntilCompiling()
    const canvas = mounted.get('canvas').element
    for (let index = 0; index < 2; index++) {
      const batch = runtime.pending[index].materials
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(batch.size).toBe(0)
      canvas.dispatchEvent(new Event('webglcontextrestored'))
      await flushPromises()
      expect(runtime.renderers[index].dispose).toHaveBeenCalledTimes(1)
    }
    expect(runtime.renderers).toHaveLength(3)
    await settleCompilation(new Error('First retired owner'))
    await settleCompilation(new Error('Second retired owner'))
    expect(runtime.renderers[2].dispose).not.toHaveBeenCalled()
    await settleCompilation()
    expect(mounted.classes()).toContain('optical-logo-lab--ready')
  })

  it('does not construct a renderer after unmount during runtime loading', async () => {
    wrapper = shallowMount(OpticalLogoLab, { global: { stubs: { VSlider: true } } })
    await flushPromises()
    vi.advanceTimersByTime(40)
    wrapper.unmount()
    wrapper = undefined
    await vi.dynamicImportSettled()
    expect(runtime.renderers).toHaveLength(0)
    expect(runtime.ticker.add).not.toHaveBeenCalled()
  })

  it('pauses remaining prewarm while hidden and resumes it when visible', async () => {
    await mountUntilCompiling()
    await settleCompilation()
    await vi.advanceTimersByTimeAsync(900)
    expect(runtime.pending).toHaveLength(1)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await settleCompilation()
    expect(runtime.pending).toHaveLength(0)
    hidden.mockReturnValue(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(900)
    expect(runtime.pending).toHaveLength(1)
  })

  it('keeps the current material ready when optional prewarm fails', async () => {
    const mounted = await mountUntilCompiling()
    await settleCompilation()
    await vi.advanceTimersByTimeAsync(900)
    const pending = await settleCompilation(new Error('Optional prewarm failed'))
    expect(pending.scene.children).toHaveLength(0)
    expect(mounted.classes()).toContain('optical-logo-lab--ready')
    expect(runtime.renderers[0].dispose).not.toHaveBeenCalled()
  })

  it('enters fallback and releases the current owner if initial compilation fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const mounted = await mountUntilCompiling()
    await settleCompilation(new Error('Initial compile failed'))
    expect(mounted.classes()).toContain('optical-logo-lab--fallback')
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledOnce()
    expect(runtime.ticker.add).not.toHaveBeenCalled()
  })

  it('releases resources immediately when no compilation is pending', async () => {
    const mounted = await mountUntilCompiling()
    await settleCompilation()
    mounted.unmount()
    wrapper = undefined
    expect(runtime.renderers[0].dispose).toHaveBeenCalledTimes(1)
  })
})
