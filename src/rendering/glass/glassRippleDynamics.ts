import type {
  BufferGeometry,
  IUniform,
  OrthographicCamera,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import type { GlassOpticalQuality } from '@/utils/glassOptics'

type ThreeModule = typeof import('three')

export type GlassRippleQuality = Exclude<GlassOpticalQuality, 'css'>

interface GlassRippleUniforms extends Record<string, IUniform> {
  uEnergyDecay: IUniform<number>
  uHeightDecay: IUniform<number>
  uImpulse: IUniform<number>
  uImpulseCenter: IUniform<Vector2>
  uImpulseDirection: IUniform<Vector2>
  uImpulseOffset: IUniform<number>
  uImpulseSigma: IUniform<number>
  uImpulseSpeed: IUniform<number>
  uPrevious: IUniform<Texture | null>
  uPropagation: IUniform<number>
  uQuality: IUniform<number>
  uReset: IUniform<number>
  uRestoring: IUniform<number>
  uStep: IUniform<number>
  uTexelSize: IUniform<Vector2>
  uVelocityDecay: IUniform<number>
  uViewportSize: IUniform<Vector2>
}

export interface GlassRippleInteraction {
  /** CSS viewport 中归一化后的输入位置，Y 轴以 WebGL 底部为原点。 */
  point: { x: number; y: number }
  /** 归一化后的指针移动方向。 */
  direction: { x: number; y: number }
  /** 现有 renderer 归一化后的速度强度，范围 0 到 1。 */
  speed: number
  /** 与 performance timeline 一致的事件时间。 */
  timestamp: number
}

export interface GlassRippleDynamics {
  /** 释放波场及其 GPU 资源。 */
  dispose(): void
  /** 将输入合并到下一次 GPU step，不为每个事件立即绘制。 */
  inject(interaction: GlassRippleInteraction): void
  /** 当前可供主材质采样的波场纹理；空场返回 null。 */
  readonly texture: Texture | null
  /** 当前波场单 texel 的 UV 尺寸，供主材质计算高度梯度。 */
  readonly texelSize: Vector2
  /** 更新共享动态参数，不重建 GPU 资源。 */
  setParameters(translationStrength: number, flowStrength: number): void
  /** 调整 viewport-space 波场；尺寸变化会恢复为空场。 */
  resize(viewportWidth: number, viewportHeight: number): void
  /** 立即清空两个 ping-pong target，并停止 CPU 生命周期。 */
  reset(): void
  /** 推进一步波场；返回 false 表示已提交清场并停止。 */
  step(timestamp: number): boolean
}

interface CreateGlassRippleDynamicsOptions {
  camera: OrthographicCamera
  geometry: BufferGeometry
  quality: GlassRippleQuality
  renderer: WebGLRenderer
  three: ThreeModule
  viewportHeight: number
  viewportWidth: number
}

const RIPPLE_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const RIPPLE_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uPrevious;
uniform vec2 uTexelSize;
uniform vec2 uViewportSize;
uniform vec2 uImpulseCenter;
uniform vec2 uImpulseDirection;
uniform float uImpulse;
uniform float uImpulseOffset;
uniform float uImpulseSigma;
uniform float uImpulseSpeed;
uniform float uPropagation;
uniform float uRestoring;
uniform float uVelocityDecay;
uniform float uHeightDecay;
uniform float uEnergyDecay;
uniform float uStep;
uniform float uQuality;
uniform float uReset;
varying vec2 vUv;

vec3 decodeState(vec4 sampleValue) {
  if (sampleValue.b < (1.0 / 255.0)) return vec3(0.0);

  return vec3(sampleValue.rg * 2.0 - 1.0, sampleValue.b);
}

float sampleHeight(vec2 offset) {
  return decodeState(texture2D(uPrevious, clamp(vUv + offset, vec2(0.0), vec2(1.0)))).x;
}

void main() {
  if (uReset > 0.5) {
    gl_FragColor = vec4(0.5, 0.5, 0.0, 1.0);
    return;
  }

  vec3 previous = decodeState(texture2D(uPrevious, vUv));
  float h = previous.x;
  float velocity = previous.y;
  float energy = previous.z;
  float cardinal1 = (
    sampleHeight(vec2(uTexelSize.x, 0.0)) +
    sampleHeight(vec2(-uTexelSize.x, 0.0)) +
    sampleHeight(vec2(0.0, uTexelSize.y)) +
    sampleHeight(vec2(0.0, -uTexelSize.y))
  ) * 0.25;
  float cardinal2 = (
    sampleHeight(vec2(uTexelSize.x * 2.0, 0.0)) +
    sampleHeight(vec2(-uTexelSize.x * 2.0, 0.0)) +
    sampleHeight(vec2(0.0, uTexelSize.y * 2.0)) +
    sampleHeight(vec2(0.0, -uTexelSize.y * 2.0))
  ) * 0.25;
  float diagonal1 = (
    sampleHeight(vec2(uTexelSize.x, uTexelSize.y)) +
    sampleHeight(vec2(-uTexelSize.x, uTexelSize.y)) +
    sampleHeight(vec2(uTexelSize.x, -uTexelSize.y)) +
    sampleHeight(vec2(-uTexelSize.x, -uTexelSize.y))
  ) * 0.25;
  float diagonal2 = (
    sampleHeight(vec2(uTexelSize.x * 2.0, uTexelSize.y * 2.0)) +
    sampleHeight(vec2(-uTexelSize.x * 2.0, uTexelSize.y * 2.0)) +
    sampleHeight(vec2(uTexelSize.x * 2.0, -uTexelSize.y * 2.0)) +
    sampleHeight(vec2(-uTexelSize.x * 2.0, -uTexelSize.y * 2.0))
  ) * 0.25;
  float balancedMean = cardinal1 * 0.72 + cardinal2 * 0.28;
  float highMean = cardinal1 * 0.46 + diagonal1 * 0.22 + cardinal2 * 0.20 + diagonal2 * 0.12;
  float curvature = mix(balancedMean, highMean, uQuality) - h;

  float speedResponse = smoothstep(0.0, 1.0, uImpulseSpeed);
  vec2 shiftedCenter = uImpulseCenter +
    uImpulseDirection * uImpulseOffset * mix(0.35, 1.0, speedResponse) / max(uViewportSize, vec2(1.0));
  vec2 impulseDelta = (vUv - shiftedCenter) * uViewportSize;
  float directionLength = length(uImpulseDirection);
  vec2 flowDirection = directionLength > 0.0001 ? uImpulseDirection / directionLength : vec2(0.0, 1.0);
  vec2 flowPerpendicular = vec2(-flowDirection.y, flowDirection.x);
  float along = dot(impulseDelta, flowDirection);
  float across = dot(impulseDelta, flowPerpendicular);
  float directionalRadius = length(vec2(along * 0.72, across * 1.24));
  float directionality = step(0.0001, directionLength) * mix(0.32, 0.72, speedResponse);
  float radius = mix(length(impulseDelta), directionalRadius, directionality);
  float sigma = max(uImpulseSigma * mix(0.86, 1.05, speedResponse), 1.0);
  float normalizedRadius = radius / sigma;
  float core = exp(-0.5 * pow(normalizedRadius, 2.0));
  float ring = exp(-0.5 * pow((radius - 1.6 * sigma) / (0.55 * sigma), 2.0));
  float centerRelease = smoothstep(0.0, 0.55, normalizedRadius);
  float annularCore = normalizedRadius * core;
  float radialImpulse = (0.72 * annularCore - 0.3 * ring) * centerRelease * uImpulse;
  float wakeEnvelope = exp(-0.5 * (
    pow(along / (1.25 * sigma), 2.0) +
    pow(across / (0.72 * sigma), 2.0)
  ));
  float directionalImpulse = clamp((-along / sigma) * wakeEnvelope * uImpulse * 0.9, -0.62, 0.62);
  float impulse = clamp(
    mix(radialImpulse, directionalImpulse, directionality),
    -0.62,
    0.62
  );

  velocity = clamp(
    (
      velocity +
      curvature * uPropagation * uStep -
      h * uRestoring * uStep +
      impulse * mix(0.52, 0.82, speedResponse)
    ) * uVelocityDecay,
    -1.0,
    1.0
  );
  h = clamp((h + velocity * uStep) * uHeightDecay, -1.0, 1.0);
  energy = clamp(max(max(energy * uEnergyDecay, abs(h)), abs(impulse)), 0.0, 1.0);
  gl_FragColor = vec4(h * 0.5 + 0.5, velocity * 0.5 + 0.5, energy, 1.0);
}
`

const FRESHNESS_MS = 40
const ENVELOPE_THRESHOLD = 0.006
const MAX_STEP_MS = 16.667
const MIN_STEP_MS = 4

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function mix(start: number, end: number, progress: number) {
  return start + (end - start) * progress
}

/** 创建仅由单个 renderer context 持有的 viewport-space 水漾场。 */
export async function createGlassRippleDynamics(
  options: CreateGlassRippleDynamicsOptions,
): Promise<GlassRippleDynamics> {
  const { camera, geometry, renderer, three } = options
  const quality = options.quality
  let viewportWidth = Math.max(1, options.viewportWidth)
  let viewportHeight = Math.max(1, options.viewportHeight)
  let translation = 0.5
  let flow = 0.5
  let energyAtInput = 0
  let lastInputAt = Number.NEGATIVE_INFINITY
  let deadlineAt = Number.NEGATIVE_INFINITY
  let lastStepAt = 0
  let pendingImpulse = 0
  let pendingSpeed = 0
  let impulseCenter = { x: 0.5, y: 0.5 }
  let impulseDirection = { x: 0, y: 1 }
  let pendingDirection = { x: 0, y: 0 }
  let clearOnNextFrame = false
  let fieldActive = false
  let disposed = false
  const targetType = renderer.extensions?.has?.('EXT_color_buffer_float') ? three.HalfFloatType : three.UnsignedByteType

  const createTarget = () => {
    const target = new three.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      format: three.RGBAFormat,
      magFilter: three.LinearFilter,
      minFilter: three.LinearFilter,
      stencilBuffer: false,
      type: targetType,
      wrapS: three.ClampToEdgeWrapping,
      wrapT: three.ClampToEdgeWrapping,
    })
    target.texture.generateMipmaps = false

    return target
  }
  let readTarget = createTarget()
  let writeTarget = createTarget()
  const uniforms: GlassRippleUniforms = {
    uEnergyDecay: { value: 1 },
    uHeightDecay: { value: 1 },
    uImpulse: { value: 0 },
    uImpulseCenter: { value: new three.Vector2(0.5, 0.5) },
    uImpulseDirection: { value: new three.Vector2(0, 1) },
    uImpulseOffset: { value: 0 },
    uImpulseSigma: { value: 24 },
    uImpulseSpeed: { value: 0 },
    uPrevious: { value: null },
    uPropagation: { value: 0.18 },
    uQuality: { value: quality === 'high' ? 1 : 0 },
    uReset: { value: 1 },
    uRestoring: { value: quality === 'high' ? 0.028 : 0.035 },
    uStep: { value: 1 },
    uTexelSize: { value: new three.Vector2(1, 1) },
    uVelocityDecay: { value: 1 },
    uViewportSize: { value: new three.Vector2(viewportWidth, viewportHeight) },
  }
  const material = new three.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: RIPPLE_FRAGMENT_SHADER,
    uniforms,
    vertexShader: RIPPLE_VERTEX_SHADER,
  })
  const scene = new three.Scene()
  const mesh = new three.Mesh(geometry, material)
  mesh.frustumCulled = false
  scene.add(mesh)

  const renderTarget = (target: WebGLRenderTarget) => {
    const previousTarget = renderer.getRenderTarget()

    try {
      renderer.setScissorTest(false)
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
    } finally {
      renderer.setRenderTarget(previousTarget)
    }
  }

  const writeNeutralTargets = () => {
    uniforms.uReset.value = 1
    uniforms.uPrevious.value = null
    renderTarget(readTarget)
    renderTarget(writeTarget)
    uniforms.uReset.value = 0
  }

  const getTargetSize = (width: number, height: number) => {
    const scale =
      quality === 'high'
        ? Math.min(1, Math.max(0.25, 192 / width, 128 / height))
        : Math.min(1, Math.max(0.16, 128 / width, 96 / height))

    return {
      height: Math.max(1, Math.round(height * scale)),
      width: Math.max(1, Math.round(width * scale)),
    }
  }

  const resize = (width: number, height: number) => {
    if (disposed) return false
    const nextViewportWidth = Math.max(1, width)
    const nextViewportHeight = Math.max(1, height)
    const target = getTargetSize(nextViewportWidth, nextViewportHeight)
    const viewportChanged = viewportWidth !== nextViewportWidth || viewportHeight !== nextViewportHeight
    const targetChanged = readTarget.width !== target.width || readTarget.height !== target.height
    if (!viewportChanged && !targetChanged) return false

    viewportWidth = nextViewportWidth
    viewportHeight = nextViewportHeight
    if (targetChanged) {
      readTarget.setSize(target.width, target.height)
      writeTarget.setSize(target.width, target.height)
    }
    uniforms.uTexelSize.value.set(1 / target.width, 1 / target.height)
    uniforms.uViewportSize.value.set(viewportWidth, viewportHeight)
    reset()

    return true
  }

  const getVelocityHalfLife = () => (quality === 'high' ? mix(90, 280, flow) : mix(70, 220, flow))

  const getDeadlineDuration = () => FRESHNESS_MS + (quality === 'high' ? mix(220, 920, flow) : mix(160, 680, flow))

  const settleEnvelope = (timestamp: number) => {
    if (!Number.isFinite(lastInputAt)) return 0
    const freshReleaseAge = Math.max(0, timestamp - lastInputAt - FRESHNESS_MS)
    const deadlineTaper = clamp01((deadlineAt - timestamp) / FRESHNESS_MS)

    return energyAtInput * 2 ** (-freshReleaseAge / getVelocityHalfLife()) * deadlineTaper
  }

  const reset = () => {
    if (disposed) return
    writeNeutralTargets()
    energyAtInput = 0
    lastInputAt = Number.NEGATIVE_INFINITY
    deadlineAt = Number.NEGATIVE_INFINITY
    lastStepAt = 0
    pendingImpulse = 0
    pendingSpeed = 0
    pendingDirection = { x: 0, y: 0 }
    impulseDirection = { x: 0, y: 1 }
    clearOnNextFrame = false
    fieldActive = false
  }

  try {
    const initializedByResize = resize(viewportWidth, viewportHeight)
    await renderer.compileAsync(scene, camera)
    if (disposed) throw new Error('Ripple resources were disposed during compilation')
    if (!initializedByResize) reset()
  } catch (error) {
    material.dispose()
    readTarget.dispose()
    writeTarget.dispose()
    throw error
  }

  return {
    dispose() {
      if (disposed) return
      disposed = true
      material.dispose()
      readTarget.dispose()
      writeTarget.dispose()
    },
    inject(interaction) {
      if (disposed) return
      const timestamp = interaction.timestamp
      const previousEnvelope = settleEnvelope(timestamp)
      const inputAmplitude = Math.min(0.8, Math.max(0.22, 0.22 + clamp01(interaction.speed) * 0.58))
      energyAtInput = Math.max(previousEnvelope, inputAmplitude)
      lastInputAt = timestamp
      deadlineAt = timestamp + getDeadlineDuration()
      pendingImpulse = Math.max(pendingImpulse, inputAmplitude)
      pendingSpeed = Math.max(pendingSpeed, clamp01(interaction.speed))
      impulseCenter = { x: clamp01(interaction.point.x), y: clamp01(interaction.point.y) }
      const directionLength = Math.hypot(interaction.direction.x, interaction.direction.y)
      if (directionLength > 0.0001) {
        pendingDirection.x += interaction.direction.x / directionLength
        pendingDirection.y += interaction.direction.y / directionLength
      }
      fieldActive = true
      clearOnNextFrame = false
    },
    get texture() {
      return fieldActive && !disposed ? readTarget.texture : null
    },
    get texelSize() {
      return uniforms.uTexelSize.value
    },
    setParameters(translationStrength, flowStrength) {
      translation = clamp01(translationStrength / 100)
      flow = clamp01(flowStrength / 100)
    },
    resize,
    reset,
    step(timestamp) {
      if (disposed || !fieldActive) return false
      if (clearOnNextFrame || timestamp >= deadlineAt || settleEnvelope(timestamp) < ENVELOPE_THRESHOLD) {
        reset()
        return false
      }

      const elapsed = lastStepAt > 0 ? Math.max(0, timestamp - lastStepAt) : MAX_STEP_MS
      const simulatedElapsed = Math.min(MAX_STEP_MS * 2, Math.max(MIN_STEP_MS, elapsed))
      const substeps = simulatedElapsed > MAX_STEP_MS ? 2 : 1
      const stepMs = Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, simulatedElapsed / substeps))
      const decayStepMs = elapsed / substeps
      const velocityHalfLife = getVelocityHalfLife()
      const heightHalfLife = velocityHalfLife * 0.82
      const energyHalfLife = velocityHalfLife * 0.72
      const targetCssPerTexel = Math.sqrt(
        (viewportWidth / Math.max(readTarget.width, 1)) * (viewportHeight / Math.max(readTarget.height, 1)),
      )
      const referenceCssPerTexel = quality === 'high' ? 4 : 6.25
      const basePropagation = quality === 'high' ? mix(0.11, 0.16, translation) : mix(0.12, 0.18, translation)

      if (pendingImpulse > 0) {
        const directionLength = Math.hypot(pendingDirection.x, pendingDirection.y)
        impulseDirection =
          directionLength > 0.0001
            ? { x: pendingDirection.x / directionLength, y: pendingDirection.y / directionLength }
            : { x: 0, y: 0 }
      }

      uniforms.uImpulseCenter.value.set(impulseCenter.x, impulseCenter.y)
      uniforms.uImpulseDirection.value.set(impulseDirection.x, impulseDirection.y)
      uniforms.uImpulseOffset.value = 56 * translation
      uniforms.uImpulseSpeed.value = pendingSpeed
      // 质量档把额外预算用于场分辨率和衰减细节；输入范围保持稳定，避免高质量改变动态效果的空间语义。
      uniforms.uImpulseSigma.value = mix(54, 97.2, translation)
      uniforms.uPropagation.value = Math.min(
        0.18,
        Math.max(0.08, basePropagation * (referenceCssPerTexel / targetCssPerTexel) ** 2),
      )
      uniforms.uRestoring.value = quality === 'high' ? 0.028 : 0.035
      uniforms.uStep.value = stepMs / MAX_STEP_MS
      uniforms.uVelocityDecay.value = 2 ** (-decayStepMs / velocityHalfLife)
      uniforms.uHeightDecay.value = 2 ** (-decayStepMs / heightHalfLife)
      uniforms.uEnergyDecay.value = 2 ** (-decayStepMs / energyHalfLife)

      for (let index = 0; index < substeps; index += 1) {
        uniforms.uPrevious.value = readTarget.texture
        uniforms.uImpulse.value = index === 0 ? pendingImpulse : 0
        renderTarget(writeTarget)
        const previousReadTarget = readTarget
        readTarget = writeTarget
        writeTarget = previousReadTarget
      }
      pendingImpulse = 0
      pendingSpeed = 0
      pendingDirection = { x: 0, y: 0 }
      lastStepAt = timestamp
      if (flow <= 0) clearOnNextFrame = true

      return true
    },
  }
}
