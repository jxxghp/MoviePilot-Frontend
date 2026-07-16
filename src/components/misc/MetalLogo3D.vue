<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import logoUrl from '@images/logo.png'

type LogoPoint = readonly [number, number]

interface LogoPieceDefinition {
  points: readonly LogoPoint[]
  faceColor: number
  sideColor: number
  depth: number
  offsetZ: number
}

const LOGO_VIEWBOX_CENTER = 96
const LOGO_COORDINATE_SCALE = 1 / 80
const AUTO_ROTATION_SPEED = 0.68
const AUTO_ROTATION_RANGE = 0.24
const MAX_TILT = 0.58

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
    faceColor: 0xa565ff,
    sideColor: 0xdde3ec,
    depth: 0.2,
    offsetZ: 0,
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
    faceColor: 0x7330dc,
    sideColor: 0xaeb7c5,
    depth: 0.22,
    offsetZ: 0.012,
  },
  {
    points: [
      [76, 64],
      [136, 96],
      [76, 128],
    ],
    faceColor: 0xb879ff,
    sideColor: 0xe7ebf2,
    depth: 0.27,
    offsetZ: 0.075,
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
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let reducedMotionQuery: MediaQueryList | null = null
let animationFrameId = 0
let previousFrameTime = 0
let targetRotationX = -0.12
let targetRotationY = -0.1
let autoRotationPhase = -0.9
let dragVelocityY = 0
let lastPointerX = 0
let lastPointerY = 0
let isIntersecting = true
let prefersReducedMotion = false

/** 将原 Logo 的二维坐标转换为以画布中心为原点的 Three.js 形状。 */
function createLogoShape(points: readonly LogoPoint[]) {
  const shape = new THREE.Shape()

  points.forEach(([sourceX, sourceY], index) => {
    const x = (sourceX - LOGO_VIEWBOX_CENTER) * LOGO_COORDINATE_SCALE
    const y = (LOGO_VIEWBOX_CENTER - sourceY) * LOGO_COORDINATE_SCALE
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()

  return shape
}

/** 创建一段带银色倒角侧面的紫色金属 Logo 几何体。 */
function createLogoPiece(definition: LogoPieceDefinition) {
  const geometry = new THREE.ExtrudeGeometry(createLogoShape(definition.points), {
    depth: definition.depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: 0.032,
    bevelThickness: 0.038,
    bevelOffset: -0.006,
  })
  geometry.translate(0, 0, definition.offsetZ - definition.depth / 2)
  geometry.computeVertexNormals()

  const faceMaterial = new THREE.MeshPhysicalMaterial({
    color: definition.faceColor,
    metalness: 0.9,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.45,
    iridescence: 0.16,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [120, 340],
  })
  const sideMaterial = new THREE.MeshPhysicalMaterial({
    color: definition.sideColor,
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.7,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.65,
  })

  return new THREE.Mesh(geometry, [faceMaterial, sideMaterial])
}

/** 组合 MoviePilot 外框与播放符号，形成完整立体 Logo。 */
function createLogoModel() {
  const group = new THREE.Group()
  LOGO_PIECES.forEach(definition => group.add(createLogoPiece(definition)))
  group.rotation.set(
    targetRotationX,
    targetRotationY + Math.sin(autoRotationPhase) * AUTO_ROTATION_RANGE,
    0,
  )

  return group
}

/** 配置突出金属反射与倒角轮廓的环境贴图和三点布光。 */
function configureLighting(activeRenderer: THREE.WebGLRenderer, activeScene: THREE.Scene) {
  const pmremGenerator = new THREE.PMREMGenerator(activeRenderer)
  const roomEnvironment = new RoomEnvironment()
  environmentTexture = pmremGenerator.fromScene(roomEnvironment, 0.035).texture
  activeScene.environment = environmentTexture
  roomEnvironment.dispose()
  pmremGenerator.dispose()

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.4)
  keyLight.position.set(-3.5, 4.5, 5)
  activeScene.add(keyLight)

  const purpleFillLight = new THREE.DirectionalLight(0x8f5cff, 2.6)
  purpleFillLight.position.set(4, -2, 3)
  activeScene.add(purpleFillLight)

  const rimLight = new THREE.DirectionalLight(0xdce8ff, 2.2)
  rimLight.position.set(2.5, 4, -3)
  activeScene.add(rimLight)

  activeScene.add(new THREE.AmbientLight(0xcbd3df, 0.78))
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

/** 逐帧更新 Logo 的轻微摆转、拖拽惯性和金属反光。 */
function renderFrame(frameTime: number) {
  animationFrameId = window.requestAnimationFrame(renderFrame)
  if (!renderer || !scene || !camera || !logoGroup || !isIntersecting) return

  const delta = previousFrameTime ? Math.min((frameTime - previousFrameTime) / 1000, 0.05) : 0
  previousFrameTime = frameTime

  if (!isDragging.value && !prefersReducedMotion) {
    autoRotationPhase += AUTO_ROTATION_SPEED * delta
    targetRotationY += dragVelocityY * delta
    dragVelocityY *= Math.exp(-5.5 * delta)
  }

  if (prefersReducedMotion) {
    logoGroup.rotation.set(targetRotationX, targetRotationY, 0)
  } else {
    const easing = 1 - Math.exp(-10 * delta)
    const autoRotationOffset = isDragging.value ? 0 : Math.sin(autoRotationPhase) * AUTO_ROTATION_RANGE
    logoGroup.rotation.x += (targetRotationX - logoGroup.rotation.x) * easing
    logoGroup.rotation.y += (targetRotationY + autoRotationOffset - logoGroup.rotation.y) * easing
    logoGroup.rotation.z = Math.sin(frameTime * 0.0004) * 0.018
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
    renderer.toneMappingExposure = 1.08

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100)
    camera.position.set(0, 0, 5.7)
    configureLighting(renderer, scene)

    logoGroup = createLogoModel()
    scene.add(logoGroup)
    resizeRenderer()
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
  targetRotationY += deltaX * 0.014
  targetRotationX = THREE.MathUtils.clamp(targetRotationX + deltaY * 0.01, -MAX_TILT, MAX_TILT)
  dragVelocityY = deltaX * 0.9
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

/** 同步系统减少动态偏好，关闭自动摆转但保留手动交互。 */
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
  renderer?.dispose()
  scene = null
  camera = null
  logoGroup = null
  renderer = null
  environmentTexture = null
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
  block-size: 96px;
  cursor: grab;
  inline-size: 96px;
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
  filter: drop-shadow(0 11px 10px rgba(12, 10, 22, 34%));
  opacity: 0;
  transition: opacity 350ms ease;
}

.metal-logo-3d--ready .metal-logo-3d__canvas {
  opacity: 1;
}

.metal-logo-3d__fallback {
  object-fit: contain;
  padding: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .metal-logo-3d__canvas {
    transition: none;
  }
}
</style>
