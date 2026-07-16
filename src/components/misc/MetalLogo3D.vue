<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import logoUrl from '@images/logo.png'

type LogoPoint = readonly [number, number]

interface LogoFacetDefinition {
  points: readonly LogoPoint[]
  color: number
  cornerRadius?: number
}

interface LogoPieceDefinition {
  points: readonly LogoPoint[]
  faceColor: number
  sideColor: number
  depth: number
  offsetZ: number
  cornerRadius: number
  facets: readonly LogoFacetDefinition[]
}

const LOGO_VIEWBOX_CENTER = 96
const LOGO_COORDINATE_SCALE = 1 / 80
const LOGO_BEVEL_SIZE = 0.08 // 倒角水平扩张尺寸，增大以捕获更宽的高光带
const LOGO_BEVEL_THICKNESS = 0.06 // 倒角绝对厚度
const AUTO_ROTATION_SPEED = 0.3
const MAX_TILT = 0.4
const INITIAL_ROTATION_X = -0.09
const INITIAL_ROTATION_Y = -0.16
const LOGO_BASE_Y = 0.1

const LOGO_PIECES: readonly LogoPieceDefinition[] = [
  {
    points: [
      [96, 15],
      [24, 57],
      [24, 133],
      [48, 147],
      [48, 76],
      [96, 48],
      [120, 62],
      [120, 35],
    ],
    faceColor: 0x9652e6,
    sideColor: 0x5c27ae,
    depth: 0.2,
    offsetZ: 0,
    cornerRadius: 4.8,
    facets: [
      {
        points: [
          [96, 19],
          [29, 58],
          [48, 72],
          [96, 44],
          [116, 56],
          [116, 38],
        ],
        color: 0xb978ff,
        cornerRadius: 2.4,
      },
      {
        points: [
          [29, 61],
          [29, 130],
          [44, 139],
          [44, 78],
        ],
        color: 0x7030ca,
        cornerRadius: 2.2,
      },
    ],
  },
  {
    points: [
      [144, 43],
      [168, 57],
      [168, 134],
      [96, 176],
      [72, 162],
      [72, 135],
      [96, 149],
      [144, 121],
    ],
    faceColor: 0x8140d5,
    sideColor: 0x54229f,
    depth: 0.21,
    offsetZ: 0.006,
    cornerRadius: 4.8,
    facets: [
      {
        points: [
          [148, 49],
          [163, 59],
          [163, 130],
          [148, 121],
        ],
        color: 0xa15cef,
        cornerRadius: 2.2,
      },
      {
        points: [
          [162, 134],
          [96, 171],
          [77, 159],
          [77, 141],
          [96, 153],
          [144, 125],
        ],
        color: 0x722bd0,
        cornerRadius: 2.4,
      },
    ],
  },
  {
    points: [
      [76, 64],
      [136, 96],
      [76, 128],
    ],
    faceColor: 0x9a50eb,
    sideColor: 0x622cb4,
    depth: 0.23,
    offsetZ: 0.026,
    cornerRadius: 3.6,
    facets: [
      {
        points: [
          [80, 70],
          [130, 96],
          [80, 94],
        ],
        color: 0xb978ff,
        cornerRadius: 1.8,
      },
      {
        points: [
          [80, 98],
          [130, 96],
          [80, 122],
        ],
        color: 0x6f29d1,
        cornerRadius: 1.8,
      },
    ],
  },
]

const rootRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isReady = ref(false)
const hasWebGLError = ref(false)
const isDragging = ref(false)

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let logoGroup: THREE.Group | null = null
let environmentTexture: THREE.Texture | null = null
let glowTexture: THREE.CanvasTexture | null = null
let glowMaterial: THREE.SpriteMaterial | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let reducedMotionQuery: MediaQueryList | null = null
let animationFrameId = 0
let previousFrameTime = 0
let targetRotationX = INITIAL_ROTATION_X
let targetRotationY = INITIAL_ROTATION_Y
let dragVelocityY = 0
let lastPointerX = 0
let lastPointerY = 0
let isIntersecting = true
let prefersReducedMotion = false

/** 将原 Logo 的二维坐标转换到以画布中心为原点的 Three.js 坐标系。 */
function convertLogoPoint([sourceX, sourceY]: LogoPoint) {
  return new THREE.Vector2(
    (sourceX - LOGO_VIEWBOX_CENTER) * LOGO_COORDINATE_SCALE,
    (LOGO_VIEWBOX_CENTER - sourceY) * LOGO_COORDINATE_SCALE,
  )
}

/** 根据多边形轮廓生成带圆角的二维 Logo 形状。 */
function createRoundedLogoShape(points: readonly LogoPoint[], sourceCornerRadius: number) {
  const vertices = points.map(convertLogoPoint)
  const cornerRadius = sourceCornerRadius * LOGO_COORDINATE_SCALE
  const corners = vertices.map((current, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length]
    const next = vertices[(index + 1) % vertices.length]
    const incoming = previous.clone().sub(current)
    const outgoing = next.clone().sub(current)
    const entryDistance = Math.min(cornerRadius, incoming.length() * 0.32)
    const exitDistance = Math.min(cornerRadius, outgoing.length() * 0.32)

    return {
      current,
      entry: current.clone().add(incoming.normalize().multiplyScalar(entryDistance)),
      exit: current.clone().add(outgoing.normalize().multiplyScalar(exitDistance)),
    }
  })
  const shape = new THREE.Shape()
  shape.moveTo(corners[0].exit.x, corners[0].exit.y)

  for (let step = 1; step <= corners.length; step += 1) {
    const corner = corners[step % corners.length]
    shape.lineTo(corner.entry.x, corner.entry.y)
    shape.quadraticCurveTo(corner.current.x, corner.current.y, corner.exit.x, corner.exit.y)
  }

  shape.closePath()
  return shape
}

/** 创建紫色镜面金属的正面材质。 */
function createFaceMaterial(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 1.0, // 物理纯金属
    roughness: 0.15, // 恰到好处的哑光丝滑，捕获细腻高光
    clearcoat: 1.0, // 顶层覆盖清漆釉面
    clearcoatRoughness: 0.04, // 极其光滑的漆面
    envMapIntensity: 2.2, // 增强对周围环境贴图的反射强度，让金属更明亮亮丽
    iridescence: 0.35, // 虹彩干涉，模拟高级阳极氧化膜
    iridescenceIOR: 1.45, // 折射率
    iridescenceThicknessRange: [100, 380], // 呈现紫红、深蓝至冰蓝的微弱折射虹彩
    sheen: 0.2, // 边缘微弱绒光，增加金属边缘的漫反射质感
    sheenColor: 0xd8c6ff,
    sheenRoughness: 0.25,
  })
}

/** 创建偏深紫的挤出侧面材质，让转到侧面时保留参考图的通透高光。 */
function createSideMaterial(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.95, // 纯粹侧边拉丝金属
    roughness: 0.25, // 侧面稍微粗糙，与光洁正面形成强烈对比，提升层次感
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.5, // 增强侧面在旋转时对环境光的敏感度
    iridescence: 0.2, // 侧面也有微弱虹彩
    iridescenceIOR: 1.4,
    iridescenceThicknessRange: [100, 300],
  })
}

/** 在挤出主体正面叠加略微内收的金属折面，复现设计图中的明暗分区。 */
function createFacetMesh(definition: LogoFacetDefinition, frontZ: number) {
  const geometry = new THREE.ShapeGeometry(createRoundedLogoShape(definition.points, definition.cornerRadius ?? 1.8), 8)
  geometry.translate(0, 0, frontZ)
  const material = createFaceMaterial(definition.color)
  material.polygonOffset = true
  material.polygonOffsetFactor = -1
  material.polygonOffsetUnits = -1
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 2
  return mesh
}

/** 创建一段带厚挤出、宽倒角和分区高光的紫色金属 Logo。 */
function createLogoPiece(definition: LogoPieceDefinition) {
  const pieceGroup = new THREE.Group()
  const geometry = new THREE.ExtrudeGeometry(createRoundedLogoShape(definition.points, definition.cornerRadius), {
    depth: definition.depth,
    steps: 1,
    curveSegments: 12, // 提升折点平滑度
    bevelEnabled: true,
    bevelSegments: 12, // 大幅度提升倒角分段，打造极其圆润圆滑的边缘过渡
    bevelSize: LOGO_BEVEL_SIZE,
    bevelThickness: LOGO_BEVEL_THICKNESS,
    bevelOffset: -0.016, // 微调倒角向内偏移，控制体积膨胀感
  })
  geometry.translate(0, 0, definition.offsetZ - definition.depth / 2)
  geometry.computeVertexNormals()

  const body = new THREE.Mesh(geometry, [
    createFaceMaterial(definition.faceColor),
    createSideMaterial(definition.sideColor),
  ])
  body.renderOrder = 1
  pieceGroup.add(body)

  const frontZ = definition.offsetZ + definition.depth / 2 + LOGO_BEVEL_THICKNESS + 0.004
  definition.facets.forEach(facet => pieceGroup.add(createFacetMesh(facet, frontZ)))
  return pieceGroup
}

/** 组合断开六边形折带与双折面播放符号，形成完整 MoviePilot Logo。 */
function createLogoModel() {
  const group = new THREE.Group()
  LOGO_PIECES.forEach(definition => group.add(createLogoPiece(definition)))
  group.position.y = LOGO_BASE_Y
  group.rotation.set(targetRotationX, targetRotationY, 0)
  return group
}

/** 生成透明椭圆光斑纹理，作为 Logo 下方的紫色悬浮投影。 */
function createGroundGlowTexture() {
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 256
  glowCanvas.height = 256
  const context = glowCanvas.getContext('2d')
  if (!context) return null

  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
  gradient.addColorStop(0, 'rgba(177, 116, 255, 0.55)')
  gradient.addColorStop(0.34, 'rgba(119, 48, 255, 0.28)')
  gradient.addColorStop(1, 'rgba(65, 15, 132, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)

  const texture = new THREE.CanvasTexture(glowCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 在场景中添加始终位于模型下方的柔和紫色光斑。 */
function addGroundGlow(activeScene: THREE.Scene) {
  glowTexture = createGroundGlowTexture()
  if (!glowTexture) return

  glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xb06dff,
    opacity: 0.58,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const glow = new THREE.Sprite(glowMaterial)
  glow.position.set(0, -1.08, -0.7)
  glow.scale.set(2.25, 0.34, 1)
  glow.renderOrder = 0
  activeScene.add(glow)
}

/** 配置突出紫色镜面、银紫倒角与背部轮廓的摄影棚布光。 */
function configureLighting(activeRenderer: THREE.WebGLRenderer, activeScene: THREE.Scene) {
  const pmremGenerator = new THREE.PMREMGenerator(activeRenderer)
  const roomEnvironment = new RoomEnvironment()
  environmentTexture = pmremGenerator.fromScene(roomEnvironment, 0.035).texture
  activeScene.environment = environmentTexture
  activeScene.environmentIntensity = 1.15
  roomEnvironment.dispose()
  pmremGenerator.dispose()

  const keyLight = new THREE.DirectionalLight(0xfff8ef, 4.6)
  keyLight.position.set(-3.6, 4.7, 5.4)
  activeScene.add(keyLight)

  const coolFillLight = new THREE.DirectionalLight(0x9bc7ff, 1.35)
  coolFillLight.position.set(-4.4, -1.2, 3.2)
  activeScene.add(coolFillLight)

  const rimLight = new THREE.DirectionalLight(0xe6b7ff, 4.1)
  rimLight.position.set(3.8, 2.8, -4.8)
  activeScene.add(rimLight)

  const violetBounceLight = new THREE.PointLight(0x6422c9, 3.2, 7, 2)
  violetBounceLight.position.set(2.5, -2.4, 2.4)
  activeScene.add(violetBounceLight)

  activeScene.add(new THREE.HemisphereLight(0xe9f2ff, 0x260441, 0.62))
}

/** 按容器实际尺寸与设备像素比同步渲染器。 */
function resizeRenderer() {
  if (!renderer || !camera || !rootRef.value) return

  const { width, height } = rootRef.value.getBoundingClientRect()
  if (!width || !height) return

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

/** 逐帧更新完整转台旋转、拖拽惯性与轻微悬浮位移。 */
function renderFrame(frameTime: number) {
  animationFrameId = window.requestAnimationFrame(renderFrame)
  if (!renderer || !scene || !camera || !logoGroup || !isIntersecting) return

  const delta = previousFrameTime ? Math.min((frameTime - previousFrameTime) / 1000, 0.05) : 0
  previousFrameTime = frameTime

  if (!isDragging.value && !prefersReducedMotion) {
    targetRotationY += (AUTO_ROTATION_SPEED + dragVelocityY) * delta
    dragVelocityY *= Math.exp(-4.2 * delta)
  }

  if (prefersReducedMotion) {
    logoGroup.rotation.set(targetRotationX, targetRotationY, 0)
    logoGroup.position.y = LOGO_BASE_Y
  } else {
    const easing = 1 - Math.exp(-12 * delta)
    logoGroup.rotation.x += (targetRotationX - logoGroup.rotation.x) * easing
    logoGroup.rotation.y += (targetRotationY - logoGroup.rotation.y) * easing
    logoGroup.position.y = LOGO_BASE_Y + Math.sin(frameTime * 0.0011) * 0.018
  }

  renderer.render(scene, camera)
}

/** 初始化 Three.js 场景；不支持 WebGL 时切换到静态 Logo。 */
function initializeScene() {
  const canvas = canvasRef.value
  if (!canvas) return

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100)
    camera.position.set(0, 0.02, 5.05)
    camera.lookAt(0, 0, 0)
    configureLighting(renderer, scene)
    addGroundGlow(scene)

    logoGroup = createLogoModel()
    scene.add(logoGroup)
    resizeRenderer()
    renderer.render(scene, camera)
    isReady.value = true
    animationFrameId = window.requestAnimationFrame(renderFrame)
  } catch (error) {
    console.warn('无法初始化登录页 3D Logo，已回退到静态图标。', error)
    hasWebGLError.value = true
    isReady.value = false
    disposeScene()
  }
}

/** 处理拖拽开始并捕获指针，保证触屏滑动连续。 */
function handlePointerDown(event: PointerEvent) {
  if (!isReady.value) return
  isDragging.value = true
  dragVelocityY = 0
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  rootRef.value?.setPointerCapture(event.pointerId)
}

/** 根据指针位移更新 Logo 水平旋转与受限俯仰角。 */
function handlePointerMove(event: PointerEvent) {
  if (!isDragging.value) return

  const deltaX = event.clientX - lastPointerX
  const deltaY = event.clientY - lastPointerY
  targetRotationY += deltaX * 0.012
  targetRotationX = THREE.MathUtils.clamp(targetRotationX + deltaY * 0.008, -MAX_TILT, MAX_TILT)
  dragVelocityY = THREE.MathUtils.clamp(deltaX * 0.08, -2.4, 2.4)
  lastPointerX = event.clientX
  lastPointerY = event.clientY
}

/** 结束指针拖拽并释放捕获。 */
function handlePointerUp(event: PointerEvent) {
  if (!isDragging.value) return
  isDragging.value = false
  if (rootRef.value?.hasPointerCapture(event.pointerId)) rootRef.value.releasePointerCapture(event.pointerId)
}

/** 支持方向键旋转 Logo，提供无鼠标交互能力。 */
function handleKeydown(event: KeyboardEvent) {
  const rotationStep = Math.PI / 10
  if (event.key === 'ArrowLeft') targetRotationY -= rotationStep
  else if (event.key === 'ArrowRight') targetRotationY += rotationStep
  else if (event.key === 'ArrowUp') targetRotationX = Math.max(targetRotationX - rotationStep / 2, -MAX_TILT)
  else if (event.key === 'ArrowDown') targetRotationX = Math.min(targetRotationX + rotationStep / 2, MAX_TILT)
  else return

  event.preventDefault()
}

/** 同步系统减少动态偏好，关闭自动旋转但保留手动交互。 */
function handleReducedMotionChange(event?: MediaQueryListEvent) {
  prefersReducedMotion = event?.matches ?? reducedMotionQuery?.matches ?? false
}

/** 仅在组件进入视口时持续渲染，降低后台 GPU 占用。 */
function handleIntersection(entries: IntersectionObserverEntry[]) {
  isIntersecting = entries[0]?.isIntersecting ?? true
  if (isIntersecting) previousFrameTime = performance.now()
}

/** WebGL 上下文丢失时停止渲染并显示静态回退 Logo。 */
function handleContextLost(event: Event) {
  event.preventDefault()
  if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
  hasWebGLError.value = true
  isReady.value = false
}

/** 释放指定 3D 对象树中的几何体、材质与贴图资源。 */
function disposeObjectResources(root: THREE.Object3D) {
  const disposedGeometries = new Set<THREE.BufferGeometry>()
  const disposedMaterials = new Set<THREE.Material>()
  const disposedTextures = new Set<THREE.Texture>()

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return

    if (!disposedGeometries.has(object.geometry)) {
      object.geometry.dispose()
      disposedGeometries.add(object.geometry)
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => {
      if (disposedMaterials.has(material)) return
      const mappedMaterial = material as THREE.Material & { map?: THREE.Texture | null }
      if (mappedMaterial.map && !disposedTextures.has(mappedMaterial.map)) {
        mappedMaterial.map.dispose()
        disposedTextures.add(mappedMaterial.map)
      }
      material.dispose()
      disposedMaterials.add(material)
    })
  })
}

/** 释放场景中的几何体、材质、环境贴图和 WebGL 上下文。 */
function disposeScene() {
  if (animationFrameId) window.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0

  if (scene) disposeObjectResources(scene)
  environmentTexture?.dispose()
  glowMaterial?.dispose()
  glowTexture?.dispose()
  renderer?.dispose()
  scene = null
  camera = null
  logoGroup = null
  renderer = null
  environmentTexture = null
  glowTexture = null
  glowMaterial = null
}

/** 注册尺寸、可见性和动态偏好监听并启动场景。 */
function handleMounted() {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  handleReducedMotionChange()
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

  if (rootRef.value) {
    resizeObserver = new ResizeObserver(resizeRenderer)
    resizeObserver.observe(rootRef.value)
    intersectionObserver = new IntersectionObserver(handleIntersection, { threshold: 0.05 })
    intersectionObserver.observe(rootRef.value)
  }

  canvasRef.value?.addEventListener('webglcontextlost', handleContextLost)
  initializeScene()
}

/** 移除监听器并完整销毁 Three.js 场景。 */
function handleBeforeUnmount() {
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  canvasRef.value?.removeEventListener('webglcontextlost', handleContextLost)
  disposeScene()
}

onMounted(handleMounted)
onBeforeUnmount(handleBeforeUnmount)
</script>

<template>
  <div
    ref="rootRef"
    class="metal-logo-3d"
    :class="{ 'metal-logo-3d--dragging': isDragging, 'metal-logo-3d--ready': isReady }"
    role="img"
    tabindex="0"
    aria-label="MoviePilot 3D metal logo"
    @keydown="handleKeydown"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
  >
    <canvas ref="canvasRef" class="metal-logo-3d__canvas" aria-hidden="true" />
    <img v-if="hasWebGLError" :src="logoUrl" class="metal-logo-3d__fallback" alt="MoviePilot" />
  </div>
</template>

<style scoped lang="scss">
.metal-logo-3d {
  position: relative;
  display: block;
  overflow: visible;
  block-size: 112px;
  cursor: grab;
  inline-size: 112px;
  outline: none;
  touch-action: none;

  &:focus-visible {
    border-radius: 8px;
    outline: 2px solid rgba(var(--v-theme-primary), 0.78);
    outline-offset: 4px;
  }
}

.metal-logo-3d--dragging {
  cursor: grabbing;
}

.metal-logo-3d__canvas,
.metal-logo-3d__fallback {
  display: block;
  block-size: 100%;
  inline-size: 100%;
}

.metal-logo-3d__canvas {
  filter: drop-shadow(0 9px 9px rgba(16, 6, 34, 24%)) drop-shadow(0 0 7px rgba(132, 70, 255, 16%));
  opacity: 0;
  transition: opacity 350ms ease;
}

.metal-logo-3d--ready .metal-logo-3d__canvas {
  opacity: 1;
}

.metal-logo-3d__fallback {
  padding: 12px;
  object-fit: contain;
}

@media (width <= 480px) {
  .metal-logo-3d {
    block-size: 104px;
    inline-size: 104px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .metal-logo-3d__canvas {
    transition: none;
  }
}
</style>
