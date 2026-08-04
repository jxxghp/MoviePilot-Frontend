import type {
  BufferGeometry,
  IUniform,
  OrthographicCamera,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'

type ThreeModule = typeof import('three')

interface GlassFluidFieldUniforms extends Record<string, IUniform> {
  uDecay: IUniform<number>
  uInjection: IUniform<number>
  uPointer: IUniform<Vector2>
  uPrevious: IUniform<Texture | null>
  uTexelSize: IUniform<Vector2>
  uVelocity: IUniform<Vector2>
  uViewportAspect: IUniform<number>
}

interface CreateGlassFluidDynamicsOptions {
  camera: OrthographicCamera
  geometry: BufferGeometry
  pointer: Vector2
  renderer: WebGLRenderer
  three: ThreeModule
  velocity: Vector2
}

export interface GlassFluidDynamics {
  /** 清除当前输入包络；下一帧会把时序场收敛到中性值。 */
  clearInput(): void
  /** 释放 fluid 私有 shader 和两个 ping-pong target。 */
  dispose(): void
  /** 清除当前帧注入，避免非输入绘制重复写入同一能量。 */
  finishFrame(): void
  /** 调整 fluid field；尺寸只来自主 renderer 已提交的 buffer。 */
  resize(bufferWidth: number, bufferHeight: number, viewportWidth: number, viewportHeight: number): void
  /** 更新当前帧的衰减与注入参数，不自行调度动画。 */
  setFrameParameters(decay: number, injection: number): void
  /** 推进一次 field 并返回主材质应采样的最新纹理。 */
  step(): Texture
}

export const GLASS_FLUID_DYNAMIC_RANGE_SCALE = 0.52
export const GLASS_FLUID_DYNAMIC_RANGE_DENSITY = 1 / GLASS_FLUID_DYNAMIC_RANGE_SCALE ** 2
const GLASS_FLUID_BUFFER_SCALE = 0.25

const GLASS_FLUID_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const GLASS_FLUID_FIELD_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uPrevious;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform vec2 uTexelSize;
uniform float uInjection;
uniform float uDecay;
uniform float uViewportAspect;
varying vec2 vUv;

void main() {
  vec4 previous = (
    texture2D(uPrevious, vUv) * 0.5 +
    texture2D(uPrevious, vUv + vec2(uTexelSize.x, 0.0)) * 0.125 +
    texture2D(uPrevious, vUv - vec2(uTexelSize.x, 0.0)) * 0.125 +
    texture2D(uPrevious, vUv + vec2(0.0, uTexelSize.y)) * 0.125 +
    texture2D(uPrevious, vUv - vec2(0.0, uTexelSize.y)) * 0.125
  );
  float previousEnergy = previous.z;
  vec2 flow = previousEnergy < 0.001 ? vec2(0.0) : (previous.xy * 2.0 - 1.0) * uDecay;
  float energy = previousEnergy * uDecay;
  vec2 delta = vUv - uPointer;
  delta.x *= uViewportAspect;
  float distanceSquared = dot(delta, delta);
  float injection = exp(-distanceSquared * ${(70 * GLASS_FLUID_DYNAMIC_RANGE_DENSITY).toFixed(3)}) * uInjection;
  float speed = length(uVelocity);
  vec2 direction = speed > 0.0001 ? uVelocity / speed : vec2(0.0, -1.0);
  vec2 perpendicular = vec2(-direction.y, direction.x);
  float shear = dot(delta, perpendicular) * exp(-distanceSquared * ${(42 * GLASS_FLUID_DYNAMIC_RANGE_DENSITY).toFixed(3)});

  flow += (direction * min(speed * 9.0, 0.9) - perpendicular * shear * 0.85) * injection * 0.44;
  energy = max(energy, injection);

  gl_FragColor = vec4(flow * 0.5 + 0.5, energy, 1.0);
}
`

/** fluid 主材质的全局临时量；由共享 shader 在原位置逐字拼装。 */
export const GLASS_FLUID_FRAGMENT_SETUP = `  vec2 wakeDirection = length(uWakeDirection) > 0.0001 ? normalize(uWakeDirection) : vec2(0.0, -1.0);
  vec2 wakePerpendicular = vec2(-wakeDirection.y, wakeDirection.x);
  vec2 trailRefraction = vec2(0.0);
  float trailEnergy = 0.0;
  float trailSpatialSpan = 0.0;
  float motionRangeCompression = mix(1.0, 1.34, uMotionExpansion);
  const float dynamicRangeScale = ${GLASS_FLUID_DYNAMIC_RANGE_SCALE.toFixed(2)};
  const float dynamicRangeDensity = ${GLASS_FLUID_DYNAMIC_RANGE_DENSITY.toFixed(3)};`

/** fluid 的 trail 与高质量 temporal field 响应。 */
export const GLASS_FLUID_FRAGMENT_TRAIL_AND_FIELD = `  for (int trailIndex = 0; trailIndex < 4; trailIndex++) {
    if (trailIndex >= uTrailCount) break;

    vec4 trail = uTrail[trailIndex];
    vec2 trailDelta = vUv - trail.xy;
    trailDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    vec2 trailSpanDelta = trail.xy - uPointer;
    trailSpanDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    trailSpatialSpan = max(trailSpatialSpan, length(trailSpanDelta) * trail.z);
    float along = dot(trailDelta, wakeDirection);
    float across = dot(trailDelta, wakePerpendicular);
    float trailAlongDensity = mix(42.0, 22.0, uMotionExpansion) * dynamicRangeDensity;
    float trailAcrossDensity = mix(210.0, 86.0, uMotionExpansion) * dynamicRangeDensity;
    float lobe =
      exp(-(along * along * trailAlongDensity + across * across * trailAcrossDensity)) * trail.z * uMotion;
    float wake = mix(0.88, 0.58, float(trailIndex) / 3.0);

    trailRefraction +=
      (wakeDirection * 0.0048 + wakePerpendicular * across * 0.018) *
      lobe *
      uDeformationStrength *
      uFlowStrength;
    trailEnergy += lobe * wake * mix(0.72, 0.42, float(trailIndex) / 3.0);
  }

  vec4 flowSample = uHasFlowTexture > 0.5 ? texture2D(uFlowTexture, vUv) : vec4(0.5, 0.5, 0.0, 1.0);
  vec2 temporalFlow =
    uHasFlowTexture > 0.5
      ? (flowSample.xy * 2.0 - 1.0) *
        flowSample.z *
        uMotion *
        uDeformationStrength *
        uFlowStrength
      : vec2(0.0);
  float flowSurfaceDetail = 0.0;
  if (uQuality > 0.5 && uHasFlowTexture > 0.5) {
    vec2 flowTexel = vec2(3.0) / max(uPresentationSize, vec2(1.0));
    vec3 flowLeft = texture2D(uFlowTexture, vUv - vec2(flowTexel.x, 0.0)).xyz;
    vec3 flowRight = texture2D(uFlowTexture, vUv + vec2(flowTexel.x, 0.0)).xyz;
    vec3 flowBottom = texture2D(uFlowTexture, vUv - vec2(0.0, flowTexel.y)).xyz;
    vec3 flowTop = texture2D(uFlowTexture, vUv + vec2(0.0, flowTexel.y)).xyz;
    float flowGradient = length(flowRight.xy - flowLeft.xy) + length(flowTop.xy - flowBottom.xy);
    float energyGradient = abs(flowRight.z - flowLeft.z) + abs(flowTop.z - flowBottom.z);
    flowSurfaceDetail = smoothstep(0.015, 0.24, flowGradient + energyGradient * 0.72) * uMotion;
  }`

/** 单个 surface 内的 fluid 指针、方向、wake 与能量形态。 */
export const GLASS_FLUID_FRAGMENT_SURFACE_SHAPE = `    vec2 pointerDelta = uPointer - vUv;
    vec2 pointerDeltaAspect = pointerDelta;
    pointerDeltaAspect *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    // 三材质共享指针几何足迹；磨砂身份由位移幅度、低通扩散和材质合成表达。
    float pointerSpread = mix(26.0, 17.0, uQuality);
    pointerSpread *= dynamicRangeDensity * mix(1.0, 0.46, uMotionExpansion);
    float sharedDirectionality = smoothstep(0.015, 0.18, trailSpatialSpan);
    float pointerAlong = dot(-pointerDeltaAspect, wakeDirection);
    float pointerAcross = dot(-pointerDeltaAspect, wakePerpendicular);
    float sharedWakeTravel =
      0.08 * sharedDirectionality * mix(0.86, 1.18, uMotionExpansion);
    float radialPointerShape = exp(-dot(pointerDeltaAspect, pointerDeltaAspect) * pointerSpread);
    float directionalPointerShape =
      exp(-(
        pow(pointerAlong + sharedWakeTravel * 0.45, 2.0) * pointerSpread * 0.72 +
        pointerAcross * pointerAcross * pointerSpread * 1.35
      ));
    float pointerEnergy =
      clamp(mix(radialPointerShape, directionalPointerShape, sharedDirectionality) * uMotion, 0.0, 1.0);
    float sharedWaveDensity = mix(2.81, 1.63, uMotionExpansion);
    float radialSharedWave =
      exp(-dot(pointerDeltaAspect, pointerDeltaAspect) * sharedWaveDensity);
    float directionalSharedWave =
      exp(-(
        pow(pointerAlong + sharedWakeTravel, 2.0) * sharedWaveDensity * 0.62 +
        pointerAcross * pointerAcross * sharedWaveDensity * 2.2
      ));
    float sharedWaveEnergy =
      mix(radialSharedWave, directionalSharedWave, sharedDirectionality) *
      clamp(length(uPointerVelocity) * 14.0 * uTranslationStrength, 0.0, 1.0) *
      mix(1.0, 0.78, sharedDirectionality) *
      uMotion *
      uMotion;
    vec2 wakeDelta = vUv - uPointer;
    wakeDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float wakeAlong = dot(wakeDelta, wakeDirection);
    float wakeAcross = dot(wakeDelta, wakePerpendicular);
    float wakeTravel =
      0.014 * dynamicRangeScale *
      mix(0.82, 1.18, uQuality) *
      mix(1.0, 1.45, uMotionExpansion);
    float wakeWidth =
      mix(0.027, 0.044, uQuality) * dynamicRangeScale * mix(1.0, 1.72, uMotionExpansion);
    float wakeCoordinate = (wakeAlong + wakeTravel) / wakeWidth;
    float wakeShape = wakeCoordinate * exp(-0.5 * wakeCoordinate * wakeCoordinate);
    float wakeEnvelope =
      exp(
        -wakeAcross *
        wakeAcross *
        mix(280.0, 145.0, uQuality) *
        dynamicRangeDensity *
        mix(1.0, 0.44, uMotionExpansion)
      );
    vec2 wakeRefraction =
      wakeDirection *
      wakeShape *
      wakeEnvelope *
      mix(0.0045, 0.0075, uQuality) *
      uMotion *
      uDeformationStrength *
      uFlowStrength;
    float wakeEnergy = abs(wakeShape) * wakeEnvelope * uMotion;
    // 覆盖能量比位移核更快收敛，避免高斯尾部把真实折射扩成整块色调覆盖。
    float coverageDirectionality = max(
      sharedDirectionality,
      smoothstep(0.001, 0.012, length(uPointerVelocity))
    );
    float coverageWakeTravel =
      0.08 * coverageDirectionality * mix(0.86, 1.18, uMotionExpansion);
    float directionalCoverageAlong = pointerAlong + coverageWakeTravel * 0.45;
    float directionalCoverageShape = exp(-(
      directionalCoverageAlong * directionalCoverageAlong * pointerSpread * 0.55 +
      pointerAcross * pointerAcross * pointerSpread * 2.8
    ));
    float pointerCoverageShape = mix(
      radialPointerShape,
      directionalCoverageShape,
      coverageDirectionality
    );
    float pointerCoverageEnergy = pow(clamp(pointerCoverageShape * uMotion, 0.0, 1.0), 1.15);
    float liquidEnergy = clamp(max(
      pointerCoverageEnergy,
      max(min(1.0, trailEnergy) * 0.68, wakeEnergy * 0.82)
    ), 0.0, 1.0);`

/** 单个 surface 内的 fluid 高光与焦散响应。 */
export const GLASS_FLUID_FRAGMENT_SURFACE_OPTICS = `    float pointerStrength = mix(mix(0.0055, 0.008, uQuality), mix(0.0085, 0.012, uQuality), frosted);
    float trailStrength = mix(mix(0.78, 1.08, uQuality), mix(0.96, 1.3, uQuality), frosted);
    float temporalStrength = mix(0.032, 0.042, frosted) * uQuality * (1.0 + flowSurfaceDetail * 0.5);
    vec2 specularDelta =
      vUv - (uPointer - wakeDirection * mix(0.006, 0.022, uMotionExpansion) * dynamicRangeScale);
    specularDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float specularAlong = dot(specularDelta, wakeDirection);
    float specularAcross = dot(specularDelta, wakePerpendicular);
    float singleSpecular =
      exp(-(
        specularAlong * specularAlong * mix(58.0, 25.0, uMotionExpansion) * dynamicRangeDensity +
        specularAcross * specularAcross * mix(190.0, 78.0, uMotionExpansion) * dynamicRangeDensity
      )) *
      uMotion *
      mix(1.0, 1.24, uMotionExpansion);
    float localCaustic = singleSpecular * rectMask * surfaceDynamic * interactionMask;`

/** fluid 对共享 dynamicRefraction 的贡献；静态透镜和 ripple 响应仍由主材质合成。 */
export const GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION = `    vec2 sampleTranslation =
      uPointerVelocity *
      mix(0.055, 0.075, uQuality) *
      uMotion *
      uTranslationStrength;
    dynamicRefraction += (
      sampleTranslation +
      // 收紧高斯半径时补偿向量峰值，避免范围缩小同时削弱用户设置的形变强度。
      pointerDelta * pointerEnergy * pointerStrength * uDeformationStrength / dynamicRangeScale +
      trailRefraction * trailStrength +
      temporalFlow * temporalStrength +
      wakeRefraction
    ) * rectMask * surfaceDynamic * interactionMask;`

/** 创建仅由高质量 fluid 模式持有的时序位移场。 */
export function createGlassFluidDynamics(options: CreateGlassFluidDynamicsOptions): GlassFluidDynamics {
  const { camera, geometry, pointer, renderer, three, velocity } = options
  let disposed = false
  const createTarget = () =>
    new three.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      magFilter: three.LinearFilter,
      minFilter: three.LinearFilter,
      stencilBuffer: false,
    })
  let readTarget: WebGLRenderTarget = createTarget()
  let writeTarget: WebGLRenderTarget = createTarget()
  const uniforms: GlassFluidFieldUniforms = {
    uDecay: { value: 1 },
    uInjection: { value: 0 },
    uPointer: { value: pointer },
    uPrevious: { value: null },
    uTexelSize: { value: new three.Vector2(1, 1) },
    uVelocity: { value: velocity },
    uViewportAspect: { value: window.innerWidth / Math.max(window.innerHeight, 1) },
  }
  const material = new three.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: GLASS_FLUID_FIELD_FRAGMENT_SHADER,
    uniforms,
    vertexShader: GLASS_FLUID_VERTEX_SHADER,
  })
  const scene = new three.Scene()
  const mesh = new three.Mesh(geometry, material)
  mesh.frustumCulled = false
  scene.add(mesh)

  return {
    clearInput() {
      uniforms.uDecay.value = 0
      uniforms.uInjection.value = 0
    },
    dispose() {
      if (disposed) return
      disposed = true
      material.dispose()
      readTarget.dispose()
      writeTarget.dispose()
    },
    finishFrame() {
      uniforms.uInjection.value = 0
    },
    resize(bufferWidth, bufferHeight, viewportWidth, viewportHeight) {
      if (disposed) return
      const width = Math.max(96, Math.round(bufferWidth * GLASS_FLUID_BUFFER_SCALE))
      const height = Math.max(96, Math.round(bufferHeight * GLASS_FLUID_BUFFER_SCALE))
      if (readTarget.width !== width || readTarget.height !== height) {
        readTarget.setSize(width, height)
        writeTarget.setSize(width, height)
      }
      uniforms.uTexelSize.value.set(1 / width, 1 / height)
      uniforms.uViewportAspect.value = viewportWidth / Math.max(viewportHeight, 1)
    },
    setFrameParameters(decay, injection) {
      uniforms.uDecay.value = decay
      uniforms.uInjection.value = injection
    },
    step() {
      if (disposed) return readTarget.texture
      renderer.setScissorTest(false)
      uniforms.uPrevious.value = readTarget.texture
      renderer.setRenderTarget(writeTarget)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      const previousReadTarget = readTarget
      readTarget = writeTarget
      writeTarget = previousReadTarget

      return readTarget.texture
    },
  }
}
