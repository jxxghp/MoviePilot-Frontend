import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGlassFluidDynamics,
  GLASS_FLUID_DYNAMIC_RANGE_DENSITY,
  GLASS_FLUID_DYNAMIC_RANGE_SCALE,
  GLASS_FLUID_FIELD_FRAGMENT_SHADER,
  GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION,
  GLASS_FLUID_FRAGMENT_SURFACE_SHAPE,
} from '@/rendering/glass/glassFluidDynamics'

class FakeVector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  set(x: number, y: number) {
    this.x = x
    this.y = y

    return this
  }
}

class FakeRenderTarget {
  static instances: FakeRenderTarget[] = []

  readonly dispose = vi.fn()
  height: number
  readonly setSize = vi.fn((width: number, height: number) => {
    this.width = width
    this.height = height
  })
  readonly texture = {}
  width: number

  constructor(
    width: number,
    height: number,
    readonly options: Record<string, unknown>,
  ) {
    this.height = height
    this.width = width
    FakeRenderTarget.instances.push(this)
  }
}

class FakeShaderMaterial {
  static instances: FakeShaderMaterial[] = []

  readonly dispose = vi.fn()
  readonly fragmentShader: string
  readonly uniforms: Record<string, { value: unknown }>

  constructor(options: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) {
    this.fragmentShader = options.fragmentShader
    this.uniforms = options.uniforms
    FakeShaderMaterial.instances.push(this)
  }
}

class FakeScene {
  readonly children: FakeMesh[] = []

  add(mesh: FakeMesh) {
    this.children.push(mesh)
  }
}

class FakeMesh {
  frustumCulled = true

  constructor(
    readonly geometry: unknown,
    readonly material: FakeShaderMaterial,
  ) {}
}

function createFluidHarness() {
  let currentTarget: FakeRenderTarget | null = null
  const pointer = new FakeVector2(0.25, 0.75)
  const velocity = new FakeVector2(0.1, -0.2)
  const renderer = {
    render: vi.fn(),
    setRenderTarget: vi.fn((target: FakeRenderTarget | null) => {
      currentTarget = target
    }),
    setScissorTest: vi.fn(),
  }
  const three = {
    LinearFilter: 1001,
    Mesh: FakeMesh,
    Scene: FakeScene,
    ShaderMaterial: FakeShaderMaterial,
    Vector2: FakeVector2,
    WebGLRenderTarget: FakeRenderTarget,
  } as unknown as typeof import('three')

  return {
    create: () =>
      createGlassFluidDynamics({
        camera: {} as never,
        geometry: {} as never,
        pointer: pointer as never,
        renderer: renderer as never,
        three,
        velocity: velocity as never,
      }),
    getCurrentTarget: () => currentTarget,
    pointer,
    renderer,
    velocity,
  }
}

beforeEach(() => {
  FakeRenderTarget.instances = []
  FakeShaderMaterial.instances = []
})

describe('glass fluid dynamics', () => {
  it('owns exactly one two-target field and reuses the shared pointer vectors', () => {
    const harness = createFluidHarness()
    const dynamics = harness.create()
    const material = FakeShaderMaterial.instances[0]

    expect(FakeRenderTarget.instances).toHaveLength(2)
    expect(FakeRenderTarget.instances.map(target => target.options)).toEqual([
      {
        depthBuffer: false,
        magFilter: 1001,
        minFilter: 1001,
        stencilBuffer: false,
      },
      {
        depthBuffer: false,
        magFilter: 1001,
        minFilter: 1001,
        stencilBuffer: false,
      },
    ])
    expect(material.fragmentShader).toBe(GLASS_FLUID_FIELD_FRAGMENT_SHADER)
    expect(material.uniforms.uPointer.value).toBe(harness.pointer)
    expect(material.uniforms.uVelocity.value).toBe(harness.velocity)

    dynamics.dispose()
  })

  it('resizes, advances, swaps and clears its private temporal field', () => {
    const harness = createFluidHarness()
    const dynamics = harness.create()
    const material = FakeShaderMaterial.instances[0]
    const [firstTarget, secondTarget] = FakeRenderTarget.instances

    dynamics.resize(800, 600, 1200, 600)
    expect(FakeRenderTarget.instances.map(target => [target.width, target.height])).toEqual([
      [200, 150],
      [200, 150],
    ])
    expect(material.uniforms.uTexelSize.value).toMatchObject({ x: 1 / 200, y: 1 / 150 })
    expect(material.uniforms.uViewportAspect.value).toBe(2)

    dynamics.setFrameParameters(0.8, 0.6)
    const texture = dynamics.step()

    expect(harness.renderer.setScissorTest).toHaveBeenCalledWith(false)
    expect(material.uniforms.uPrevious.value).toBe(firstTarget.texture)
    expect(harness.renderer.setRenderTarget.mock.calls).toEqual([[secondTarget], [null]])
    expect(harness.renderer.render).toHaveBeenCalledOnce()
    expect(harness.getCurrentTarget()).toBeNull()
    expect(texture).toBe(secondTarget.texture)

    dynamics.finishFrame()
    expect(material.uniforms.uInjection.value).toBe(0)
    expect(material.uniforms.uDecay.value).toBe(0.8)

    dynamics.clearInput()
    expect(material.uniforms.uDecay.value).toBe(0)
    expect(material.uniforms.uInjection.value).toBe(0)

    dynamics.dispose()
    dynamics.dispose()
    expect(FakeRenderTarget.instances.every(target => target.dispose.mock.calls.length === 1)).toBe(true)
    expect(material.dispose).toHaveBeenCalledOnce()
  })

  it('keeps the established field injection and decay equations', () => {
    expect(GLASS_FLUID_FIELD_FRAGMENT_SHADER).toContain('previousEnergy * uDecay')
    expect(GLASS_FLUID_DYNAMIC_RANGE_SCALE).toBe(0.52)
    expect(GLASS_FLUID_DYNAMIC_RANGE_DENSITY).toBeCloseTo(3.698, 3)
    expect(GLASS_FLUID_FIELD_FRAGMENT_SHADER).toContain('distanceSquared * 258.876')
    expect(GLASS_FLUID_FIELD_FRAGMENT_SHADER).toContain('distanceSquared * 155.325')
    expect(GLASS_FLUID_FIELD_FRAGMENT_SHADER).toContain('injection * 0.44')
    expect(GLASS_FLUID_FIELD_FRAGMENT_SHADER).not.toContain('uImpulse')
  })

  it('narrows directional material coverage without replacing fluid refraction energy', () => {
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain('smoothstep(0.001, 0.012, length(uPointerVelocity))')
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain('directionalCoverageShape')
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain('pointerCoverageEnergy')
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain('pow(clamp(pointerCoverageShape * uMotion, 0.0, 1.0), 1.15)')
    expect(GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION).toContain('pointerDelta * pointerEnergy * pointerStrength')
    expect(GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION).not.toContain('pointerCoverageEnergy')
  })

  it('squares the signed coverage offset without GLSL pow', () => {
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain(
      'float directionalCoverageAlong = pointerAlong + coverageWakeTravel * 0.45;',
    )
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).toContain(
      'directionalCoverageAlong * directionalCoverageAlong * pointerSpread * 0.55',
    )
    expect(GLASS_FLUID_FRAGMENT_SURFACE_SHAPE).not.toContain('pow(pointerAlong + coverageWakeTravel * 0.45, 2.0)')
  })
})
