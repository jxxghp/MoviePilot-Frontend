import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createGlassRippleDynamics,
  RIPPLE_FRAGMENT_SHADER,
  type GlassRippleQuality,
} from '@/rendering/glass/glassRippleDynamics'

class FakeVector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  copy(value: FakeVector2) {
    return this.set(value.x, value.y)
  }

  set(x: number, y: number) {
    this.x = x
    this.y = y

    return this
  }
}

class FakeRenderTarget {
  static instances: FakeRenderTarget[] = []

  readonly dispose = vi.fn()
  height = 1
  readonly setSize = vi.fn((width: number, height: number) => {
    this.width = width
    this.height = height
  })
  readonly texture: Record<string, unknown>
  width = 1

  constructor(
    _width: number,
    _height: number,
    readonly options: Record<string, unknown>,
  ) {
    this.texture = {
      format: options.format,
      magFilter: options.magFilter,
      minFilter: options.minFilter,
      type: options.type,
      wrapS: options.wrapS,
      wrapT: options.wrapT,
    }
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

interface RenderSnapshot {
  direction: { x: number; y: number }
  energyDecay: number
  heightDecay: number
  impulse: number
  impulseCenter: { x: number; y: number }
  impulseOffset: number
  impulseSigma: number
  impulseSpeed: number
  reset: number
  step: number
  target: FakeRenderTarget | null
  velocityDecay: number
}

function createRippleHarness(
  quality: GlassRippleQuality = 'balanced',
  compileAsync = vi.fn().mockResolvedValue(undefined),
  supportsHalfFloatTarget = true,
) {
  let currentTarget: FakeRenderTarget | null = null
  const snapshots: RenderSnapshot[] = []
  const renderer = {
    compileAsync,
    extensions: {
      has: vi.fn(() => supportsHalfFloatTarget),
    },
    getRenderTarget: vi.fn(() => currentTarget),
    render: vi.fn((scene: FakeScene) => {
      const uniforms = scene.children[0].material.uniforms
      snapshots.push({
        direction: {
          x: (uniforms.uImpulseDirection.value as FakeVector2).x,
          y: (uniforms.uImpulseDirection.value as FakeVector2).y,
        },
        energyDecay: uniforms.uEnergyDecay.value as number,
        heightDecay: uniforms.uHeightDecay.value as number,
        impulse: uniforms.uImpulse.value as number,
        impulseCenter: {
          x: (uniforms.uImpulseCenter.value as FakeVector2).x,
          y: (uniforms.uImpulseCenter.value as FakeVector2).y,
        },
        impulseOffset: uniforms.uImpulseOffset.value as number,
        impulseSigma: uniforms.uImpulseSigma.value as number,
        impulseSpeed: uniforms.uImpulseSpeed.value as number,
        reset: uniforms.uReset.value as number,
        step: uniforms.uStep.value as number,
        target: currentTarget,
        velocityDecay: uniforms.uVelocityDecay.value as number,
      })
    }),
    setRenderTarget: vi.fn((target: FakeRenderTarget | null) => {
      currentTarget = target
    }),
    setScissorTest: vi.fn(),
  }
  const three = {
    ClampToEdgeWrapping: 1001,
    HalfFloatType: 1005,
    LinearFilter: 1002,
    Mesh: FakeMesh,
    RGBAFormat: 1003,
    Scene: FakeScene,
    ShaderMaterial: FakeShaderMaterial,
    UnsignedByteType: 1004,
    Vector2: FakeVector2,
    WebGLRenderTarget: FakeRenderTarget,
  } as unknown as typeof import('three')

  return {
    create: () =>
      createGlassRippleDynamics({
        camera: {} as never,
        geometry: {} as never,
        quality,
        renderer: renderer as never,
        three,
        viewportHeight: 800,
        viewportWidth: 1200,
      }),
    renderer,
    snapshots,
  }
}

beforeEach(() => {
  FakeRenderTarget.instances = []
  FakeShaderMaterial.instances = []
})

describe('glass ripple dynamics', () => {
  it('uses one bounded half-float ping-pong field when the renderer supports it', async () => {
    const harness = createRippleHarness()
    const dynamics = await harness.create()

    expect(FakeRenderTarget.instances).toHaveLength(2)
    expect(FakeRenderTarget.instances.map(target => [target.width, target.height])).toEqual([
      [192, 128],
      [192, 128],
    ])
    for (const target of FakeRenderTarget.instances) {
      expect(target.options).toMatchObject({
        depthBuffer: false,
        format: 1003,
        magFilter: 1002,
        minFilter: 1002,
        stencilBuffer: false,
        type: 1005,
        wrapS: 1001,
        wrapT: 1001,
      })
      expect(target.texture.generateMipmaps).toBe(false)
    }
    expect(harness.renderer.compileAsync).toHaveBeenCalledOnce()
    expect(harness.snapshots).toHaveLength(2)
    expect(harness.snapshots.every(snapshot => snapshot.reset === 1)).toBe(true)
    expect(new Set(harness.snapshots.map(snapshot => snapshot.target))).toEqual(new Set(FakeRenderTarget.instances))
    expect(dynamics.texture).toBeNull()
    expect(dynamics.texelSize.x).toBeCloseTo(1 / 192)
    expect(dynamics.texelSize.y).toBeCloseTo(1 / 128)

    dynamics.dispose()
    expect(FakeRenderTarget.instances.every(target => target.dispose.mock.calls.length === 1)).toBe(true)
    expect(FakeShaderMaterial.instances[0].dispose).toHaveBeenCalledOnce()
  })

  it('keeps the documented neutral encoding, stencil weights and bounded impulse kernel', () => {
    expect(RIPPLE_FRAGMENT_SHADER).toContain('vec4(0.5, 0.5, 0.0, 1.0)')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('sampleValue.b < (1.0 / 255.0)')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('cardinal1 * 0.72 + cardinal2 * 0.28')
    expect(RIPPLE_FRAGMENT_SHADER).toContain(
      'cardinal1 * 0.46 + diagonal1 * 0.22 + cardinal2 * 0.20 + diagonal2 * 0.12',
    )
    expect(RIPPLE_FRAGMENT_SHADER).toContain('float directionalRadius = length(vec2(along * 0.72, across * 1.24))')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('float centerRelease = smoothstep(0.0, 0.55, normalizedRadius)')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('float annularCore = normalizedRadius * core')
    expect(RIPPLE_FRAGMENT_SHADER).toContain(
      'float radialImpulse = (0.72 * annularCore - 0.3 * ring) * centerRelease * uImpulse',
    )
    expect(RIPPLE_FRAGMENT_SHADER).not.toContain('0.58 * core')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('float directionalImpulse = clamp(')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('mix(radialImpulse, directionalImpulse')
    expect(RIPPLE_FRAGMENT_SHADER).toContain('impulse * mix(0.52, 0.82, speedResponse)')
    expect(RIPPLE_FRAGMENT_SHADER).not.toContain('uHeightDecay + impulse')
  })

  it('resizes in viewport space, clears the field and releases every owned resource', async () => {
    const harness = createRippleHarness('high')
    const dynamics = await harness.create()
    harness.snapshots.length = 0

    dynamics.inject({
      direction: { x: 1, y: 0 },
      point: { x: 0.4, y: 0.6 },
      speed: 0.8,
      timestamp: 100,
    })
    expect(dynamics.step(116.667)).toBe(true)
    expect(dynamics.texture).not.toBeNull()

    dynamics.resize(1600, 900)

    expect(FakeRenderTarget.instances.map(target => [target.width, target.height])).toEqual([
      [400, 225],
      [400, 225],
    ])
    expect(harness.snapshots.slice(-2).every(snapshot => snapshot.reset === 1)).toBe(true)
    expect(dynamics.texture).toBeNull()
    expect(dynamics.texelSize.x).toBeCloseTo(1 / 400)
    expect(dynamics.texelSize.y).toBeCloseTo(1 / 225)

    dynamics.dispose()
    expect(FakeRenderTarget.instances.every(target => target.dispose.mock.calls.length === 1)).toBe(true)
    expect(FakeShaderMaterial.instances[0].dispose).toHaveBeenCalledOnce()
  })

  it('falls back to an 8-bit field when half-float color targets are unavailable', async () => {
    const harness = createRippleHarness('balanced', vi.fn().mockResolvedValue(undefined), false)
    const dynamics = await harness.create()

    expect(FakeRenderTarget.instances.every(target => target.options.type === 1004)).toBe(true)
    dynamics.dispose()
  })

  it('clears flow-zero feedback on the next frame and then stops all GPU work', async () => {
    const harness = createRippleHarness()
    const dynamics = await harness.create()
    dynamics.setParameters(50, 0)
    dynamics.inject({
      direction: { x: 0.8, y: 0.2 },
      point: { x: 0.35, y: 0.65 },
      speed: 0.7,
      timestamp: 100,
    })
    harness.snapshots.length = 0

    expect(dynamics.step(116.667)).toBe(true)
    expect(harness.snapshots).toHaveLength(1)
    expect(dynamics.texture).not.toBeNull()
    expect(dynamics.step(133.334)).toBe(false)
    expect(harness.snapshots).toHaveLength(3)
    expect(harness.snapshots.slice(-2).every(snapshot => snapshot.reset === 1)).toBe(true)
    expect(dynamics.texture).toBeNull()

    expect(dynamics.step(150)).toBe(false)
    expect(harness.snapshots).toHaveLength(3)
    dynamics.dispose()
  })

  it('caps propagation at two substeps while applying decay over the full elapsed time', async () => {
    const harness = createRippleHarness()
    const dynamics = await harness.create()
    dynamics.setParameters(50, 50)
    dynamics.inject({
      direction: { x: 1, y: 0 },
      point: { x: 0.5, y: 0.5 },
      speed: 0.5,
      timestamp: 100,
    })
    dynamics.step(116.667)
    harness.snapshots.length = 0

    expect(dynamics.step(166.667)).toBe(true)

    expect(harness.snapshots).toHaveLength(2)
    const velocityHalfLife = 145
    const expectedSubstepDecay = 2 ** (-25 / velocityHalfLife)
    expect(harness.snapshots.every(snapshot => snapshot.step === 1)).toBe(true)
    expect(
      harness.snapshots.every(snapshot => Math.abs(snapshot.velocityDecay - expectedSubstepDecay) < 0.000001),
    ).toBe(true)
    dynamics.dispose()
  })

  it('integrates directions while retaining the latest point and maximum impulse within one frame', async () => {
    const harness = createRippleHarness()
    const dynamics = await harness.create()
    harness.snapshots.length = 0

    dynamics.inject({
      direction: { x: 1, y: 0 },
      point: { x: 0.25, y: 0.35 },
      speed: 1,
      timestamp: 100,
    })
    dynamics.inject({
      direction: { x: 0, y: 1 },
      point: { x: 0.7, y: 0.8 },
      speed: 0.2,
      timestamp: 104,
    })

    expect(dynamics.step(116.667)).toBe(true)
    expect(harness.snapshots).toHaveLength(1)
    expect(harness.snapshots[0].direction.x).toBeCloseTo(Math.SQRT1_2)
    expect(harness.snapshots[0].direction.y).toBeCloseTo(Math.SQRT1_2)
    expect(harness.snapshots[0].impulseCenter).toEqual({ x: 0.7, y: 0.8 })
    expect(harness.snapshots[0].impulse).toBeCloseTo(0.8)
    expect(harness.snapshots[0].impulseOffset).toBe(28)
    expect(harness.snapshots[0].impulseSigma).toBeCloseTo(75.6)
    expect(harness.snapshots[0].impulseSpeed).toBe(1)
    dynamics.dispose()
  })

  it('keeps the ripple footprint stable across quality levels', async () => {
    const balancedHarness = createRippleHarness('balanced')
    const balancedDynamics = await balancedHarness.create()
    const highHarness = createRippleHarness('high')
    const highDynamics = await highHarness.create()
    const interaction = {
      direction: { x: 1, y: 0 },
      point: { x: 0.5, y: 0.5 },
      speed: 0.5,
      timestamp: 100,
    }
    balancedHarness.snapshots.length = 0
    highHarness.snapshots.length = 0

    balancedDynamics.setParameters(75, 50)
    highDynamics.setParameters(75, 50)
    balancedDynamics.inject(interaction)
    highDynamics.inject(interaction)
    balancedDynamics.step(116.667)
    highDynamics.step(116.667)

    expect(balancedHarness.snapshots[0].impulseSigma).toBeCloseTo(86.4)
    expect(highHarness.snapshots[0].impulseSigma).toBeCloseTo(86.4)
    balancedDynamics.dispose()
    highDynamics.dispose()
  })

  it('disposes partially created resources when shader compilation fails', async () => {
    const compileAsync = vi.fn().mockRejectedValue(new Error('compile failed'))
    const harness = createRippleHarness('balanced', compileAsync)

    await expect(harness.create()).rejects.toThrow('compile failed')
    expect(FakeRenderTarget.instances.every(target => target.dispose.mock.calls.length === 1)).toBe(true)
    expect(FakeShaderMaterial.instances[0].dispose).toHaveBeenCalledOnce()
  })
})
