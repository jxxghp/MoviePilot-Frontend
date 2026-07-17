<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { THEME_CUSTOMIZER_CHANGE_EVENT } from '@/composables/useThemeCustomizer'
import PrismaticLogo from '@/components/misc/PrismaticLogo.vue'

type WebGlMaterialMode = 'crystal' | 'chrome' | 'energy' | 'ceramic' | 'matte'
type LogoStyle = WebGlMaterialMode | 'prismatic'
type EntranceMode = 'none' | 'assemble' | 'emerge'
type StaticMotionMode = 'steady' | 'random'
type LabPhase = 'loading' | 'idle' | 'charging' | 'playing' | 'dragging' | 'fallback'
type LogoPoint = readonly [number, number]
type ThreeApi = typeof import('three')
type GsapApi = (typeof import('gsap'))['gsap']
type GsapTimeline = ReturnType<GsapApi['timeline']>
type ThreeMaterial = import('three').Material
type ThreeTexture = import('three').Texture
type ThreeBufferGeometry = import('three').BufferGeometry
type ThreeGroup = import('three').Group
type ThreeMesh = import('three').Mesh
type ThreeShaderMaterial = import('three').ShaderMaterial
type ThreeWebGLRenderer = import('three').WebGLRenderer
type ThreeWebGLRenderTarget = import('three').WebGLRenderTarget
type ThreePerspectiveCamera = import('three').PerspectiveCamera
type ThreeScene = import('three').Scene
type ThreeLight = import('three').Light
type EffectComposerInstance = import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer
type ShaderPassInstance = import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass
type UnrealBloomPassInstance = import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass

interface LogoPieceDefinition {
  points: readonly LogoPoint[]
  depth: number
  cornerRadius: number
}

interface MatteFacetDefinition {
  points: readonly LogoPoint[]
  cornerRadius: number
  lightness: number
}

interface MattePieceDefinition {
  cornerRadius: number
  depth: number
  facets: readonly MatteFacetDefinition[]
  offsetZ: number
}

interface PieceRig {
  body: ThreeMesh
  core: ThreeMesh
  group: ThreeGroup
  matteBody: ThreeMesh
  matteFacets: ThreeMesh[]
  spectral: ThreeMesh
}

interface MaterialRig {
  core: ThreeMaterial[]
  face: ThreeMaterial[]
  facets: ThreeMaterial[][]
  side: ThreeMaterial[]
}

interface PersistedState {
  bag: string[]
  lastCombination?: string
  logoSize: number
  pinned: boolean
  pinnedCombination?: string
  lightIntensity: number
  soundEnabled: boolean
  staticMotion: StaticMotionMode
  unifiedThemeFamily: boolean
  version: 2
}

interface LogoPreset {
  entrance: EntranceMode
  lightIntensity: number
  logoSize: number
  pinned: boolean
  soundEnabled: boolean
  staticMotion: StaticMotionMode
  style: LogoStyle
  unifiedThemeFamily: boolean
}

interface OpticalState {
  caustic: number
  focus: number
  membrane: number
  pulse: number
  spectral: number
}

/** 拖拽持续声的材质音色参数。 */
interface DragAudioProfile {
  baseFilter: number
  baseFrequency: number
  filterQ: number
  filterRange: number
  filterType: BiquadFilterType
  frequencyRange: number
  gainBase: number
  gainRange: number
  waveform: OscillatorType
}

interface ActiveDragAudio {
  filter: BiquadFilterNode
  gain: GainNode
  oscillator: OscillatorNode
  pan: StereoPannerNode
  profile: DragAudioProfile
}

const props = withDefaults(
  defineProps<{
    locale?: string
  }>(),
  {
    locale: 'en-US',
  },
)

const emit = defineEmits<{
  'logo-click': []
}>()

const STORAGE_KEY = 'moviepilot-optical-logo-lab-v2'
const LOGO_VIEWBOX_CENTER = 96
const LOGO_COORDINATE_SCALE = 1 / 80
const INITIAL_CAMERA_Z = 5.15
const BLOOM_RENDER_PADDING = 24
const DEFAULT_LOGO_SIZE = 112
const MIN_LOGO_SIZE = 96
const MAX_LOGO_SIZE = 160
// MSAA 只覆盖几何边缘；小尺寸 Logo 需要额外超采样来稳定旋转中的镜面高光。
const MIN_RENDER_DPR = 2
const MAX_RENDER_DPR = 3
const RENDER_SUPERSAMPLE_SCALE = 1.5
const POST_PROCESS_MSAA_SAMPLES = 4
const IDLE_RENDER_INTERVAL = 1000 / 60 - 0.75
const AUTO_REPLAY_MIN_MS = 12_000
const AUTO_REPLAY_MAX_MS = 18_000
const CRUISE_REST_PITCH = -0.025
const CRUISE_REST_YAW = -0.12
const STEADY_ROTATION_SPEED = 0.3
const DRAG_REST_PITCH = -0.06
const DRAG_REST_YAW = -0.14
const LOGO_BASE_Y = 0.4
const MATERIAL_MODES: readonly WebGlMaterialMode[] = ['crystal', 'chrome', 'energy', 'ceramic', 'matte']
const LOGO_STYLES: readonly LogoStyle[] = [...MATERIAL_MODES, 'prismatic']
const ENTRANCE_MODES: readonly EntranceMode[] = ['none', 'assemble', 'emerge']
const STATIC_MOTION_MODES: readonly StaticMotionMode[] = ['steady', 'random']

/** 代码默认值是清空本地预设后的稳定回退，Lab 面板可将新选择保存给普通登录页。 */
const DEFAULT_LOGO_PRESET: Readonly<LogoPreset> = {
  entrance: 'none',
  lightIntensity: 10,
  logoSize: DEFAULT_LOGO_SIZE,
  pinned: true,
  soundEnabled: false,
  staticMotion: 'steady',
  style: 'chrome',
  unifiedThemeFamily: true,
}

const DRAG_AUDIO_PROFILES: Record<LogoStyle, DragAudioProfile> = {
  crystal: {
    baseFilter: 520,
    baseFrequency: 420,
    filterQ: 0.7,
    filterRange: 420,
    filterType: 'highpass',
    frequencyRange: 70,
    gainBase: 0.008,
    gainRange: 0.038,
    waveform: 'sine',
  },
  chrome: {
    baseFilter: 460,
    baseFrequency: 128,
    filterQ: 0.9,
    filterRange: 700,
    filterType: 'lowpass',
    frequencyRange: 36,
    gainBase: 0.012,
    gainRange: 0.048,
    waveform: 'triangle',
  },
  energy: {
    baseFilter: 420,
    baseFrequency: 132,
    filterQ: 0.9,
    filterRange: 1200,
    filterType: 'lowpass',
    frequencyRange: 90,
    gainBase: 0.006,
    gainRange: 0.04,
    waveform: 'sawtooth',
  },
  ceramic: {
    baseFilter: 560,
    baseFrequency: 260,
    filterQ: 0.6,
    filterRange: 620,
    filterType: 'bandpass',
    frequencyRange: 55,
    gainBase: 0.009,
    gainRange: 0.04,
    waveform: 'triangle',
  },
  matte: {
    baseFilter: 420,
    baseFrequency: 154,
    filterQ: 0.72,
    filterRange: 520,
    filterType: 'lowpass',
    frequencyRange: 42,
    gainBase: 0.008,
    gainRange: 0.034,
    waveform: 'sine',
  },
  prismatic: {
    baseFilter: 640,
    baseFrequency: 520,
    filterQ: 0.62,
    filterRange: 560,
    filterType: 'highpass',
    frequencyRange: 96,
    gainBase: 0.006,
    gainRange: 0.03,
    waveform: 'sine',
  },
}

/** 常驻 Bloom 只强调材质高光，避免浅色外壳整体泛白。 */
const BLOOM_PROFILES: Record<LogoStyle, { strength: number; threshold: number }> = {
  crystal: { strength: 0.25, threshold: 1.08 },
  chrome: { strength: 0.32, threshold: 1.02 },
  energy: { strength: 0.5, threshold: 0.9 },
  ceramic: { strength: 0.06, threshold: 1.3 },
  matte: { strength: 0.08, threshold: 1.24 },
  prismatic: { strength: 0, threshold: 1.4 },
}

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
    depth: 0.25,
    cornerRadius: 4.2,
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
    depth: 0.26,
    cornerRadius: 4.2,
  },
  {
    points: [
      [76, 64],
      [136, 96],
      [76, 128],
    ],
    depth: 0.27,
    cornerRadius: 3.2,
  },
]

/** 哑光金属使用更宽的倒角与独立折面，保留材质固有的明暗层次。 */
const MATTE_LOGO_PIECES: readonly MattePieceDefinition[] = [
  {
    cornerRadius: 4.8,
    depth: 0.2,
    offsetZ: 0,
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
        cornerRadius: 2.4,
        lightness: 0.1,
      },
      {
        points: [
          [29, 61],
          [29, 130],
          [44, 139],
          [44, 78],
        ],
        cornerRadius: 2.2,
        lightness: -0.09,
      },
    ],
  },
  {
    cornerRadius: 4.8,
    depth: 0.21,
    offsetZ: 0.006,
    facets: [
      {
        points: [
          [148, 49],
          [163, 59],
          [163, 130],
          [148, 121],
        ],
        cornerRadius: 2.2,
        lightness: 0.09,
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
        cornerRadius: 2.4,
        lightness: -0.08,
      },
    ],
  },
  {
    cornerRadius: 3.6,
    depth: 0.23,
    offsetZ: 0.026,
    facets: [
      {
        points: [
          [80, 70],
          [130, 96],
          [80, 94],
        ],
        cornerRadius: 1.8,
        lightness: 0.1,
      },
      {
        points: [
          [80, 98],
          [130, 96],
          [80, 122],
        ],
        cornerRadius: 1.8,
        lightness: -0.1,
      },
    ],
  },
]

const STATIC_LOGO_PATHS = LOGO_PIECES.map(
  ({ points }) => `M ${points.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`,
)

const ASSEMBLE_OFFSETS = [
  { x: -0.7, y: 0.42, z: -0.78, rotation: 0.34 },
  { x: 0.72, y: -0.34, z: -0.5, rotation: -0.38 },
  { x: 0.06, y: 0.08, z: 0.92, rotation: 0.2 },
] as const

const rootRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLButtonElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const isReady = ref(false)
const isDragging = ref(false)
const isPinned = ref(DEFAULT_LOGO_PRESET.pinned)
const soundEnabled = ref(false)
const lightIntensity = ref(45)
const logoSize = ref(DEFAULT_LOGO_SIZE)
const unifiedThemeFamily = ref(true)
const selectedMaterial = ref<LogoStyle>(DEFAULT_LOGO_PRESET.style)
const selectedEntrance = ref<EntranceMode>(DEFAULT_LOGO_PRESET.entrance)
const selectedStaticMotion = ref<StaticMotionMode>(DEFAULT_LOGO_PRESET.staticMotion)
const prismaticReplayKey = ref(0)
const phase = ref<LabPhase>('loading')

const vuetifyTheme = useTheme()
const route = useRoute()
const showLabControls = computed(() => route.path === '/login' && route.query.lab === '1')
const isChinese = computed(() => props.locale.toLowerCase().startsWith('zh'))
const text = computed(() =>
  isChinese.value
    ? {
        assemble: '聚合',
        ceramic: '哑光釉陶',
        chrome: '液态铬',
        crystal: '全息晶体',
        emerge: '穿透',
        energy: '体积能量',
        entranceGroup: '进场方式',
        lightIntensity: 'Logo 光效强度',
        logo: '可交互的 MoviePilot 3D 光学 Logo',
        logoSize: 'Logo 尺寸',
        matte: '哑光金属',
        materialGroup: 'Logo 材质',
        mute: '关闭声音',
        none: '无动画',
        pin: '固定当前组合',
        prismatic: '光谱棱镜',
        random: '随机转向',
        resetLab: '清空预设并恢复默认',
        staticMotionGroup: '静态运动方式',
        steady: '匀速旋转',
        staticLogo: 'MoviePilot Logo',
        unmute: '开启声音',
        unpin: '取消固定组合',
        useSplitPalette: '使用分色配色',
        useUnifiedPalette: '统一主题色系',
      }
    : {
        assemble: 'Assemble',
        ceramic: 'Matte ceramic',
        chrome: 'Liquid chrome',
        crystal: 'Holographic crystal',
        emerge: 'Emerge',
        energy: 'Volumetric energy',
        entranceGroup: 'Entrance mode',
        lightIntensity: 'Logo light intensity',
        logo: 'Interactive MoviePilot 3D optical logo',
        logoSize: 'Logo size',
        matte: 'Matte metal',
        materialGroup: 'Logo material',
        mute: 'Mute sound',
        none: 'None',
        pin: 'Pin this combination',
        prismatic: 'Spectral prism',
        random: 'Random turns',
        resetLab: 'Clear preset and restore defaults',
        staticMotionGroup: 'Idle motion',
        steady: 'Steady rotation',
        staticLogo: 'MoviePilot logo',
        unmute: 'Enable sound',
        unpin: 'Unpin combination',
        useSplitPalette: 'Use split palette',
        useUnifiedPalette: 'Unify theme palette',
      },
)

const materialOptions = computed(() =>
  LOGO_STYLES.map(value => ({
    label: text.value[value],
    value,
  })),
)

function isStaticMotionMode(value: unknown): value is StaticMotionMode {
  return typeof value === 'string' && STATIC_MOTION_MODES.includes(value as StaticMotionMode)
}

let THREE: ThreeApi | null = null
let gsapApi: GsapApi | null = null
let EffectComposerClass: typeof import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer | null = null
let RenderPassClass: typeof import('three/examples/jsm/postprocessing/RenderPass.js').RenderPass | null = null
let ShaderPassClass: typeof import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass | null = null
let UnrealBloomPassClass: typeof import('three/examples/jsm/postprocessing/UnrealBloomPass.js').UnrealBloomPass | null = null
let SMAAPassClass: typeof import('three/examples/jsm/postprocessing/SMAAPass.js').SMAAPass | null = null
let OutputPassClass: typeof import('three/examples/jsm/postprocessing/OutputPass.js').OutputPass | null = null
let RoomEnvironmentClass: typeof import('three/examples/jsm/environments/RoomEnvironment.js').RoomEnvironment | null = null

let renderer: ThreeWebGLRenderer | null = null
let composer: EffectComposerInstance | null = null
let scene: ThreeScene | null = null
let camera: ThreePerspectiveCamera | null = null
let cameraRig: ThreeGroup | null = null
let entryRig: ThreeGroup | null = null
let cruiseRig: ThreeGroup | null = null
let dragRig: ThreeGroup | null = null
let logoModel: ThreeGroup | null = null
let membraneMesh: ThreeMesh | null = null
let causticMesh: ThreeMesh | null = null
let pulsePass: ShaderPassInstance | null = null
let bloomPass: UnrealBloomPassInstance | null = null
let spectralMaterial: ThreeShaderMaterial | null = null
let membraneMaterial: ThreeShaderMaterial | null = null
let causticMaterial: ThreeShaderMaterial | null = null
let chromeFlowTexture: ThreeTexture | null = null
let environmentTexture: ThreeTexture | null = null
let environmentRenderTarget: ThreeWebGLRenderTarget | null = null
let keyLight: ThreeLight | null = null
let rimLight: ThreeLight | null = null
let fillLight: ThreeLight | null = null
let bounceLight: ThreeLight | null = null
let pieceRigs: PieceRig[] = []
let materialRigs: Record<WebGlMaterialMode, MaterialRig> | null = null

const geometries = new Set<ThreeBufferGeometry>()
const materials = new Set<ThreeMaterial>()
const textures = new Set<ThreeTexture>()
const prewarmedMaterials = new Set<WebGlMaterialMode>()
const opticalState: OpticalState = { caustic: 0.25, focus: 0, membrane: 0, pulse: 0, spectral: 0 }
const pointerState = { x: 0.5, y: 0.32, targetPitch: 0, targetYaw: 0 }
const dragState = {
  currentPitch: DRAG_REST_PITCH,
  currentYaw: DRAG_REST_YAW,
  pointerId: -1,
  pointerType: 'mouse',
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
  suppressClick: false,
  targetPitch: DRAG_REST_PITCH,
  targetYaw: DRAG_REST_YAW,
  velocityPitch: 0,
  velocityYaw: 0,
}
const cruiseState = { pitch: CRUISE_REST_PITCH, yaw: CRUISE_REST_YAW }

let activeTimeline: GsapTimeline | null = null
let previewTimeline: GsapTimeline | null = null
let materialTimeline: GsapTimeline | null = null
let autonomousTween: ReturnType<GsapApi['to']> | null = null
let previewMode: EntranceMode | null = null
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let reducedMotionQuery: MediaQueryList | null = null
let canHoverQuery: MediaQueryList | null = null
let presetPersistenceSuspended = false
let cardElement: HTMLElement | null = null
let idleTaskId: number | null = null
let firstPaintFrameId: number | null = null
let initializeFrameId: number | null = null
let generation = 0
let isIntersecting = true
let isDocumentVisible = true
let prefersReducedMotion = false
let formFocused = false
let lastRenderTime = 0
let highRefreshUntil = 0
let nextTurnAt = 0
let nextReplayAt = Number.POSITIVE_INFINITY
let currentDpr = 2
let slowFrameCount = 0
let fastFrameCount = 0
let isPrewarming = false
let lastCardVisualSignature = ''
let reducedMotionRenderPending = true

let audioContext: AudioContext | null = null
let audioMaster: GainNode | null = null
let audioCompressor: DynamicsCompressorNode | null = null
let noiseBuffer: AudioBuffer | null = null
let dragAudio: ActiveDragAudio | null = null
const activeAudioSources = new Set<AudioScheduledSourceNode>()

const OpticalPulseShader = {
  uniforms: {
    amount: { value: 0 },
    center: { value: { x: 0.5, y: 0.5 } },
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform vec2 center;
    varying vec2 vUv;
    void main() {
      vec2 direction = (vUv - center) * amount;
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 blur = base * 0.42;
      blur += texture2D(tDiffuse, vUv + direction) * 0.18;
      blur += texture2D(tDiffuse, vUv - direction) * 0.18;
      blur += texture2D(tDiffuse, vUv + direction * 2.0) * 0.11;
      blur += texture2D(tDiffuse, vUv - direction * 2.0) * 0.11;
      float red = texture2D(tDiffuse, vUv + direction * 1.5).r;
      float blue = texture2D(tDiffuse, vUv - direction * 1.5).b;
      gl_FragColor = vec4(red, blur.g, blue, max(base.a, blur.a));
    }
  `,
}

const TransparentBloomBlendFragmentShader = `
  uniform float opacity;
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    vec4 bloom = texture2D(tDiffuse, vUv);
    float intensity = max(bloom.r, max(bloom.g, bloom.b));
    float coverage = smoothstep(0.075, 0.28, intensity);
    gl_FragColor = vec4(
      bloom.rgb * coverage * opacity,
      min(intensity, 1.0) * coverage * opacity
    );
  }
`

const EnergyCoreShader = {
  uniforms: {
    uColor: { value: null },
    uOpacity: { value: 0.72 },
    uSecondary: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform vec3 uSecondary;
    uniform float uOpacity;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      float flowA = sin(vPosition.y * 13.0 + uTime * 2.2 + sin(vPosition.x * 9.0));
      float flowB = sin(vPosition.x * 17.0 - uTime * 1.7 + vPosition.z * 21.0);
      float density = smoothstep(-0.45, 0.9, flowA * 0.58 + flowB * 0.42);
      float fresnel = pow(1.0 - abs(vNormal.z), 2.2);
      vec3 color = mix(uColor, uSecondary, density * 0.65 + fresnel * 0.25);
      gl_FragColor = vec4(color * (1.1 + density * 1.45), (0.24 + density * 0.62 + fresnel * 0.24) * uOpacity);
    }
  `,
}

const SpectralShellShader = {
  uniforms: {
    uMicrostructure: { value: 0 },
    uOpacity: { value: 0 },
    uPrimary: { value: null },
    uSpectrumA: { value: null },
    uSpectrumB: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uMicrostructure;
    uniform vec3 uPrimary;
    uniform vec3 uSpectrumA;
    uniform vec3 uSpectrumB;
    uniform float uOpacity;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
      float fresnel = pow(1.0 - abs(vNormal.z), 1.65);
      float ribbon = 0.5 + 0.5 * sin(vPosition.y * 15.0 + vPosition.x * 8.0 - uTime * 4.0);
      vec3 spectrum = mix(uSpectrumA, uSpectrumB, ribbon);
      spectrum = mix(spectrum, uPrimary, 0.34);
      float diagonalA = sin((vPosition.x * 0.68 + vPosition.y) * 24.0);
      float diagonalB = sin((vPosition.x - vPosition.y * 0.72) * 19.0);
      float lineA = 1.0 - smoothstep(0.0, max(fwidth(diagonalA) * 1.35, 0.018), abs(diagonalA));
      float lineB = 1.0 - smoothstep(0.0, max(fwidth(diagonalB) * 1.35, 0.018), abs(diagonalB));
      float backFace = gl_FrontFacing ? 0.0 : 1.0;
      float microstructure = (lineA * 0.72 + lineB * 0.28) * backFace * uMicrostructure;
      vec3 microColor = mix(uPrimary, vec3(0.72, 0.88, 1.0), 0.56);
      vec3 color = mix(
        spectrum * (1.08 + fresnel * 0.72),
        microColor,
        clamp(microstructure * 2.4, 0.0, 0.72)
      );
      float shellAlpha = uOpacity * (0.02 + pow(fresnel, 2.35) * 0.98);
      gl_FragColor = vec4(color, max(shellAlpha, microstructure * 0.46));
    }
  `,
}

const MembraneShader = {
  uniforms: {
    uBulge: { value: 0 },
    uColor: { value: null },
    uPulse: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `
    uniform float uBulge;
    uniform float uPulse;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 transformed = position;
      float radius = length(uv - 0.5);
      transformed.z += exp(-radius * 8.0) * (uBulge * 0.18 + uPulse * 0.12);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uBulge;
    uniform float uPulse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      float radius = length(vUv - 0.5);
      float ring = smoothstep(0.035, 0.0, abs(radius - (0.2 + uPulse * 0.12)));
      float membrane = 1.0 - smoothstep(0.34, 0.48, radius);
      float edgeFade = 1.0 - smoothstep(0.44, 0.49, radius);
      float shimmer = 0.5 + 0.5 * sin(radius * 46.0 - uTime * 1.4);
      float alpha = (
        membrane * (uBulge * 0.105 + uPulse * 0.08) +
        ring * (uBulge * 0.035 + uPulse * 0.38)
      ) * edgeFade;
      gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.62) * (0.7 + shimmer * 0.3), alpha);
    }
  `,
}

const CausticShader = {
  uniforms: {
    uColor: { value: null },
    uPulse: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uPulse;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * vec2(1.0, 2.6);
      float radius = length(p);
      float wave = 0.5 + 0.5 * sin(p.x * 15.0 + uTime * 1.2);
      float falloff = 1.0 - smoothstep(0.0, 0.52, radius);
      float alpha = falloff * (0.08 + uPulse * 0.32) * (0.65 + wave * 0.35);
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.48), alpha);
    }
  `,
}

function isLogoStyle(value: unknown): value is LogoStyle {
  return typeof value === 'string' && LOGO_STYLES.includes(value as LogoStyle)
}

function isEntranceMode(value: unknown): value is EntranceMode {
  return typeof value === 'string' && ENTRANCE_MODES.includes(value as EntranceMode)
}

function parseCombination(value: unknown) {
  if (typeof value !== 'string') return null
  const [material, entrance] = value.split(':')
  if (!isLogoStyle(material) || !isEntranceMode(entrance)) return null
  return { entrance, material }
}

function combinationKey(material = selectedMaterial.value, entrance = selectedEntrance.value) {
  return `${material}:${entrance}`
}

function createShuffledBag(previous?: string) {
  const bag = LOGO_STYLES.flatMap(style => ENTRANCE_MODES.map(entrance => `${style}:${entrance}`))
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[bag[index], bag[target]] = [bag[target], bag[index]]
  }
  if (previous && bag[0] === previous && bag.length > 1) [bag[0], bag[1]] = [bag[1], bag[0]]
  return bag
}

function readPersistedState(): PersistedState {
  const fallback: PersistedState = {
    bag: [],
    lastCombination: combinationKey(DEFAULT_LOGO_PRESET.style, DEFAULT_LOGO_PRESET.entrance),
    lightIntensity: DEFAULT_LOGO_PRESET.lightIntensity,
    logoSize: DEFAULT_LOGO_PRESET.logoSize,
    pinned: DEFAULT_LOGO_PRESET.pinned,
    pinnedCombination: combinationKey(DEFAULT_LOGO_PRESET.style, DEFAULT_LOGO_PRESET.entrance),
    soundEnabled: DEFAULT_LOGO_PRESET.soundEnabled,
    staticMotion: DEFAULT_LOGO_PRESET.staticMotion,
    unifiedThemeFamily: DEFAULT_LOGO_PRESET.unifiedThemeFamily,
    version: 2,
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Partial<PersistedState> | null
    if (!parsed || parsed.version !== 2) return fallback
    const persistedLightIntensity = Number(parsed.lightIntensity)
    const persistedLogoSize = Number(parsed.logoSize)
    return {
      bag: Array.isArray(parsed.bag) ? parsed.bag.filter(item => parseCombination(item)) : [],
      lastCombination: parseCombination(parsed.lastCombination)?.material
        ? parsed.lastCombination
        : undefined,
      lightIntensity: Number.isFinite(persistedLightIntensity)
        ? Math.min(100, Math.max(0, persistedLightIntensity))
        : fallback.lightIntensity,
      logoSize: Number.isFinite(persistedLogoSize)
        ? Math.min(MAX_LOGO_SIZE, Math.max(MIN_LOGO_SIZE, persistedLogoSize))
        : fallback.logoSize,
      pinned: parsed.pinned !== false,
      pinnedCombination: parseCombination(parsed.pinnedCombination)?.material
        ? parsed.pinnedCombination
        : fallback.pinnedCombination,
      soundEnabled: parsed.soundEnabled === true,
      staticMotion: isStaticMotionMode(parsed.staticMotion) ? parsed.staticMotion : fallback.staticMotion,
      unifiedThemeFamily: parsed.unifiedThemeFamily !== false,
      version: 2,
    }
  } catch {
    return fallback
  }
}

function applyPreset(preset: Readonly<LogoPreset>) {
  selectedMaterial.value = preset.style
  selectedEntrance.value = preset.entrance
  lightIntensity.value = preset.lightIntensity
  logoSize.value = preset.logoSize
  isPinned.value = preset.pinned
  soundEnabled.value = preset.soundEnabled
  selectedStaticMotion.value = preset.staticMotion
  unifiedThemeFamily.value = preset.unifiedThemeFamily
}

function writePersistedState(overrides: Partial<PersistedState> = {}) {
  try {
    const current = readPersistedState()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...current,
        ...overrides,
        version: 2,
      } satisfies PersistedState),
    )
  } catch {
    // 浏览器禁用存储时仍保留当前会话交互。
  }
}

function initializeSelection() {
  presetPersistenceSuspended = true
  applyPreset(DEFAULT_LOGO_PRESET)
  const persisted = readPersistedState()
  isPinned.value = persisted.pinned
  if (persisted.pinned && persisted.pinnedCombination) {
    const pinned = parseCombination(persisted.pinnedCombination)
    if (pinned) {
      selectedMaterial.value = pinned.material
      selectedEntrance.value = pinned.entrance
    }
  } else {
    const bag = persisted.bag.length ? [...persisted.bag] : createShuffledBag(persisted.lastCombination)
    const next = parseCombination(bag.shift()) || {
      material: DEFAULT_LOGO_PRESET.style,
      entrance: DEFAULT_LOGO_PRESET.entrance,
    }
    selectedMaterial.value = next.material
    selectedEntrance.value = next.entrance
    writePersistedState({ bag, lastCombination: combinationKey(next.material, next.entrance), pinned: false })
  }
  lightIntensity.value = persisted.lightIntensity
  logoSize.value = persisted.logoSize
  soundEnabled.value = persisted.soundEnabled
  selectedStaticMotion.value = persisted.staticMotion
  unifiedThemeFamily.value = persisted.unifiedThemeFamily
  void nextTick(() => {
    presetPersistenceSuspended = false
  })
}

function persistCurrentSelection() {
  if (presetPersistenceSuspended) return
  writePersistedState({
    lastCombination: combinationKey(),
    pinnedCombination: isPinned.value ? combinationKey() : undefined,
  })
}

function requireThree() {
  if (!THREE) throw new Error('Three.js runtime is not ready')
  return THREE
}

function convertLogoPoint([sourceX, sourceY]: LogoPoint) {
  const T = requireThree()
  return new T.Vector2(
    (sourceX - LOGO_VIEWBOX_CENTER) * LOGO_COORDINATE_SCALE,
    (LOGO_VIEWBOX_CENTER - sourceY) * LOGO_COORDINATE_SCALE,
  )
}

/** 将主体点集转换为小倒角 Shape，避免官方 SVG 重复高光路径产生重叠实体。 */
function createRoundedLogoShape(points: readonly LogoPoint[], sourceCornerRadius: number) {
  const T = requireThree()
  const vertices = points.map(convertLogoPoint)
  const cornerRadius = sourceCornerRadius * LOGO_COORDINATE_SCALE
  const corners = vertices.map((current, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length]
    const next = vertices[(index + 1) % vertices.length]
    const incoming = previous.clone().sub(current)
    const outgoing = next.clone().sub(current)
    return {
      current,
      entry: current.clone().add(incoming.normalize().multiplyScalar(Math.min(cornerRadius, incoming.length() * 0.28))),
      exit: current.clone().add(outgoing.normalize().multiplyScalar(Math.min(cornerRadius, outgoing.length() * 0.28))),
    }
  })
  const shape = new T.Shape()
  shape.moveTo(corners[0].exit.x, corners[0].exit.y)
  for (let index = 1; index <= corners.length; index += 1) {
    const corner = corners[index % corners.length]
    shape.lineTo(corner.entry.x, corner.entry.y)
    shape.quadraticCurveTo(corner.current.x, corner.current.y, corner.exit.x, corner.exit.y)
  }
  shape.closePath()
  return shape
}

function registerMaterial<T extends ThreeMaterial>(material: T) {
  materials.add(material)
  return material
}

function registerGeometry<T extends ThreeBufferGeometry>(geometry: T) {
  geometries.add(geometry)
  return geometry
}

function registerTexture<T extends ThreeTexture>(texture: T) {
  textures.add(texture)
  return texture
}

function getThemeColors() {
  const T = requireThree()
  const colors = vuetifyTheme.global.current.value.colors
  const primary = new T.Color(colors.primary || '#8D51F9')
  const surface = new T.Color(colors.surface || colors.background || '#14161F')
  const onSurface = new T.Color(colors['on-surface'] || '#FFFFFF')
  const hsl = { h: 0, l: 0, s: 0 }
  primary.getHSL(hsl)
  if (!unifiedThemeFamily.value) {
    const toneOffsets = [-0.045, 0.018, 0.075]
    const tones = toneOffsets.map(offset =>
      new T.Color().setHSL(
        T.MathUtils.euclideanModulo(hsl.h + offset, 1),
        T.MathUtils.clamp(hsl.s * 0.88 + 0.06, 0.38, 0.96),
        T.MathUtils.clamp(hsl.l + offset * 0.6, 0.3, 0.76),
      ),
    )
    return { onSurface, primary, surface, tones }
  }
  // 三块共享主题色相；先将基础明度拉入可见区间，再建立不会因夹值而塌缩的分面层次。
  const baseLightness = T.MathUtils.clamp(hsl.l, 0.335, 0.715)
  const toneAdjustments = [
    { lightness: 0.045, saturationScale: 1.08 },
    { lightness: -0.035, saturationScale: 0.92 },
    { lightness: 0.025, saturationScale: 1.04 },
  ] as const
  const tones = toneAdjustments.map(({ lightness, saturationScale }) =>
    new T.Color().setHSL(
      hsl.h,
      T.MathUtils.clamp(hsl.s * saturationScale, 0, 0.96),
      baseLightness + lightness,
    ),
  )
  return { onSurface, primary, surface, tones }
}

function normalizedLightIntensity() {
  return Math.min(1, Math.max(0, lightIntensity.value / 100))
}

function preferredRenderDpr() {
  const deviceDpr = Math.max(window.devicePixelRatio || 1, 1)
  return Math.min(Math.max(deviceDpr * RENDER_SUPERSAMPLE_SCALE, MIN_RENDER_DPR), MAX_RENDER_DPR)
}

function transmissionResolutionScaleForDpr(dpr: number) {
  return dpr >= 1.9 ? 0.78 : dpr >= 1.7 ? 0.62 : 0.5
}

/** 光效滑杆统一控制场景主光、轮廓光与补光，避免各层强度彼此失配。 */
function applyLogoLightIntensity() {
  const level = normalizedLightIntensity()
  if (keyLight) keyLight.intensity = 1.4 + level * 2.2
  if (rimLight) rimLight.intensity = 0.9 + level * 2.3
  if (fillLight) fillLight.intensity = 0.55 + level * 0.8
  if (bounceLight) bounceLight.intensity = 0.25 + level * 1.55
}

function createChromeFlowTexture() {
  const T = requireThree()
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return null
  const image = context.createImageData(size, size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const wave = Math.sin(x * 0.24 + Math.sin(y * 0.18)) * 14
      image.data[index] = 128 + wave
      image.data[index + 1] = 128 + Math.cos(y * 0.2 + x * 0.06) * 10
      image.data[index + 2] = 246
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const texture = registerTexture(new T.CanvasTexture(canvas))
  texture.wrapS = T.RepeatWrapping
  texture.wrapT = T.RepeatWrapping
  texture.repeat.set(2.4, 2.4)
  return texture
}

function createPhysicalMaterial(mode: WebGlMaterialMode, toneIndex: number, side: boolean, lightness = 0) {
  const T = requireThree()
  const { primary, tones } = getThemeColors()
  const tone = tones[toneIndex]
  const white = new T.Color(0xffffff)
  let material: import('three').MeshPhysicalMaterial

  if (mode === 'crystal') {
    material = new T.MeshPhysicalMaterial({
      attenuationColor: tone.clone().offsetHSL(0, -0.04, 0.04),
      attenuationDistance: side ? 0.9 : 1.1,
      clearcoat: 0.32,
      clearcoatRoughness: 0.12,
      color: tone.clone().offsetHSL(0, -0.08, side ? -0.1 : -0.16),
      dispersion: side ? 0.18 : 0.22,
      envMapIntensity: side ? 1.28 : 1.18,
      ior: 1.5,
      iridescence: side ? 0.16 : 0.22,
      iridescenceIOR: 1.36,
      iridescenceThicknessRange: [120 + toneIndex * 28, 520 + toneIndex * 58],
      metalness: 0,
      roughness: side ? 0.16 : 0.12,
      specularColor: tone.clone().lerp(white, 0.82),
      specularIntensity: 0.82,
      thickness: side ? 0.36 : 0.44,
      transmission: side ? 0.78 : 0.84,
    })
  } else if (mode === 'chrome') {
    material = new T.MeshPhysicalMaterial({
      clearcoat: 0.62,
      clearcoatRoughness: 0.11,
      color: new T.Color(0x596171).lerp(tone, side ? 0.34 : 0.26),
      envMapIntensity: 2.15,
      iridescence: side ? 0.22 : 0.34,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [90, 260 + toneIndex * 40],
      metalness: 1,
      normalMap: chromeFlowTexture,
      normalScale: new T.Vector2(side ? 0.055 : 0.035, side ? 0.055 : 0.035),
      roughness: side ? 0.16 : 0.12,
    })
  } else if (mode === 'energy') {
    material = new T.MeshPhysicalMaterial({
      clearcoat: 0.45,
      clearcoatRoughness: 0.14,
      color: new T.Color(0x11131f).lerp(tone, 0.18),
      dispersion: 0.08,
      emissive: primary.clone().multiplyScalar(0.08 + toneIndex * 0.02),
      envMapIntensity: 1.2,
      ior: 1.32,
      iridescence: 0.24,
      metalness: 0.05,
      roughness: side ? 0.19 : 0.13,
      thickness: 0.2,
      transmission: side ? 0.68 : 0.76,
    })
  } else if (mode === 'matte') {
    material = new T.MeshPhysicalMaterial({
      color: tone.clone().offsetHSL(0, side ? -0.04 : 0, side ? -0.12 : lightness),
      envMapIntensity: side ? 1.8 : 1.6,
      metalness: side ? 0.95 : 1,
      roughness: side ? 0.42 : 0.32,
    })
  } else if (side) {
    material = new T.MeshPhysicalMaterial({
      clearcoat: 0.16,
      clearcoatRoughness: 0.38,
      color: tone.clone().offsetHSL(0, -0.12, -0.24),
      envMapIntensity: 0.62,
      metalness: 0,
      roughness: 0.44,
    })
  } else {
    material = new T.MeshPhysicalMaterial({
      clearcoat: 0.1,
      clearcoatRoughness: 0.55,
      color: tone.clone().offsetHSL(0, -0.16, -0.13 - toneIndex * 0.015),
      envMapIntensity: 0.56,
      metalness: 0,
      roughness: 0.62,
      sheen: 0,
    })
  }

  material.userData.opticalMode = mode
  material.userData.lightness = lightness
  material.userData.toneIndex = toneIndex
  material.userData.side = side
  return registerMaterial(material)
}

function createCoreMaterial(mode: WebGlMaterialMode, toneIndex: number) {
  const T = requireThree()
  const { primary, tones } = getThemeColors()
  if (mode === 'energy') {
    const material = new T.ShaderMaterial({
      blending: T.AdditiveBlending,
      depthWrite: false,
      fragmentShader: EnergyCoreShader.fragmentShader,
      side: T.DoubleSide,
      transparent: true,
      uniforms: T.UniformsUtils.clone(EnergyCoreShader.uniforms),
      vertexShader: EnergyCoreShader.vertexShader,
    })
    material.uniforms.uColor.value = tones[toneIndex].clone()
    material.uniforms.uSecondary.value = primary.clone().offsetHSL(0.11, 0, 0.12)
    material.userData.opticalMode = mode
    material.userData.toneIndex = toneIndex
    return registerMaterial(material)
  }

  const opacity = mode === 'crystal' ? 0.08 : 0
  const material = new T.MeshBasicMaterial({
    blending: T.AdditiveBlending,
    color: tones[toneIndex],
    depthWrite: false,
    opacity,
    side: T.DoubleSide,
    transparent: true,
  })
  material.userData.opticalMode = mode
  material.userData.toneIndex = toneIndex
  return registerMaterial(material)
}

function createMaterialLibrary() {
  const entries = MATERIAL_MODES.map(mode => [
    mode,
    {
      core: LOGO_PIECES.map((_, index) => createCoreMaterial(mode, index)),
      face: LOGO_PIECES.map((_, index) => createPhysicalMaterial(mode, index, false)),
      facets: MATTE_LOGO_PIECES.map((piece, index) =>
        mode === 'matte'
          ? piece.facets.map(facet => createPhysicalMaterial(mode, index, false, facet.lightness))
          : [],
      ),
      side: LOGO_PIECES.map((_, index) => createPhysicalMaterial(mode, index, true)),
    },
  ])
  materialRigs = Object.fromEntries(entries) as Record<WebGlMaterialMode, MaterialRig>
}

function applyMaterial(mode: LogoStyle) {
  if (!materialRigs) return
  const webGlMode = mode === 'prismatic' ? null : mode
  const rig = webGlMode ? materialRigs[webGlMode] : null
  pieceRigs.forEach((piece, index) => {
    if (rig) {
      piece.body.material = [rig.face[index], rig.side[index]]
      piece.core.material = rig.core[index]
    }
    piece.body.visible = webGlMode !== null && mode !== 'matte'
    piece.core.visible = webGlMode !== null && mode !== 'chrome' && mode !== 'matte'
    piece.matteBody.visible = mode === 'matte'
    piece.matteFacets.forEach(facet => {
      facet.visible = mode === 'matte'
    })
    piece.spectral.visible = webGlMode !== null
  })
  if (causticMesh) causticMesh.visible = webGlMode !== null
}

function updateThemeMaterials() {
  if (!THREE || !materialRigs) return
  const T = requireThree()
  const { onSurface, primary, surface, tones } = getThemeColors()
  const white = new T.Color(0xffffff)
  MATERIAL_MODES.forEach(mode => {
    const rig = materialRigs?.[mode]
    rig?.face.concat(rig.side, ...rig.facets).forEach(material => {
      if (!(material instanceof T.MeshPhysicalMaterial)) return
      const toneIndex = Number(material.userData.toneIndex || 0)
      const lightness = Number(material.userData.lightness || 0)
      const side = material.userData.side === true
      const tone = tones[toneIndex]
      if (mode === 'crystal') {
        material.color.copy(tone).offsetHSL(0, -0.08, side ? -0.1 : -0.16)
        material.attenuationColor.copy(tone).offsetHSL(0, -0.04, 0.04)
        material.specularColor.copy(tone).lerp(white, 0.82)
      } else if (mode === 'chrome') material.color.set(0x596171).lerp(tone, side ? 0.34 : 0.26)
      else if (mode === 'energy') {
        material.color.copy(new T.Color(0x11131f).lerp(tone, 0.18))
        material.emissive.copy(primary).multiplyScalar(0.08 + toneIndex * 0.02)
      } else if (mode === 'matte') {
        material.color.copy(tone).offsetHSL(0, side ? -0.04 : 0, side ? -0.12 : lightness)
      } else if (side) {
        material.color.copy(tone).offsetHSL(0, -0.12, -0.24)
      } else {
        material.color.copy(tone).offsetHSL(0, -0.16, -0.13 - toneIndex * 0.015)
      }
    })
    rig?.core.forEach((material, toneIndex) => {
      if (material instanceof T.ShaderMaterial) {
        material.uniforms.uColor.value.copy(tones[toneIndex])
        material.uniforms.uSecondary.value.copy(primary).offsetHSL(0.11, 0, 0.12)
      } else if (material instanceof T.MeshBasicMaterial) material.color.copy(tones[toneIndex])
    })
  })
  spectralMaterial?.uniforms.uPrimary.value.copy(primary)
  spectralMaterial?.uniforms.uSpectrumA.value.copy(primary).offsetHSL(-0.055, -0.06, 0.1)
  spectralMaterial?.uniforms.uSpectrumB.value.copy(primary).offsetHSL(0.055, -0.08, 0.08)
  membraneMaterial?.uniforms.uColor.value.copy(primary)
  causticMaterial?.uniforms.uColor.value.copy(primary)
  if (keyLight) keyLight.color.copy(primary).lerp(new T.Color(0xffffff), 0.6)
  if (rimLight) rimLight.color.copy(onSurface).lerp(primary, 0.32)
  if (fillLight) fillLight.color.copy(surface).lerp(primary, 0.22).offsetHSL(0.08, 0.05, 0.2)
  if (bounceLight) bounceLight.color.copy(primary)
}

function createPieceRigs() {
  const T = requireThree()
  if (!logoModel || !materialRigs || !spectralMaterial) return
  const rigs = materialRigs
  const spectralShell = spectralMaterial
  pieceRigs = LOGO_PIECES.map((definition, index) => {
    const geometry = registerGeometry(
      new T.ExtrudeGeometry(createRoundedLogoShape(definition.points, definition.cornerRadius), {
        bevelEnabled: true,
        bevelOffset: -0.012,
        bevelSegments: 12,
        bevelSize: 0.055,
        bevelThickness: 0.042,
        curveSegments: 12,
        depth: definition.depth,
        steps: 1,
      }),
    )
    geometry.translate(0, 0, -definition.depth / 2)
    geometry.computeVertexNormals()

    const group = new T.Group()
    const initialWebGlMode = selectedMaterial.value === 'prismatic' ? 'crystal' : selectedMaterial.value
    const rig = rigs[initialWebGlMode]
    const body = new T.Mesh(geometry, [rig.face[index], rig.side[index]])
    body.renderOrder = 2
    body.visible = selectedMaterial.value !== 'matte'
    const core = new T.Mesh(geometry, rig.core[index])
    core.renderOrder = 1
    core.scale.set(0.91, 0.91, 0.78)
    core.visible = selectedMaterial.value !== 'chrome' && selectedMaterial.value !== 'matte'

    const matteDefinition = MATTE_LOGO_PIECES[index]
    const matteRig = rigs.matte
    const matteGeometry = registerGeometry(
      new T.ExtrudeGeometry(createRoundedLogoShape(definition.points, matteDefinition.cornerRadius), {
        bevelEnabled: true,
        bevelOffset: -0.016,
        bevelSegments: 12,
        bevelSize: 0.08,
        bevelThickness: 0.06,
        curveSegments: 12,
        depth: matteDefinition.depth,
        steps: 1,
      }),
    )
    matteGeometry.translate(0, 0, matteDefinition.offsetZ - matteDefinition.depth / 2)
    matteGeometry.computeVertexNormals()
    const matteBody = new T.Mesh(matteGeometry, [matteRig.face[index], matteRig.side[index]])
    matteBody.renderOrder = 2
    matteBody.visible = selectedMaterial.value === 'matte'
    const matteFrontZ = matteDefinition.offsetZ + matteDefinition.depth / 2 + 0.064
    const matteFacets = matteDefinition.facets.map((facet, facetIndex) => {
      const facetGeometry = registerGeometry(
        new T.ShapeGeometry(createRoundedLogoShape(facet.points, facet.cornerRadius), 8),
      )
      facetGeometry.translate(0, 0, matteFrontZ)
      const facetMaterial = matteRig.facets[index][facetIndex]
      facetMaterial.polygonOffset = true
      facetMaterial.polygonOffsetFactor = -1
      facetMaterial.polygonOffsetUnits = -1
      const facetMesh = new T.Mesh(facetGeometry, facetMaterial)
      facetMesh.renderOrder = 3
      facetMesh.visible = selectedMaterial.value === 'matte'
      return facetMesh
    })
    const spectral = new T.Mesh(geometry, spectralShell)
    spectral.renderOrder = 4
    spectral.scale.setScalar(1)

    group.add(core, body, matteBody, ...matteFacets, spectral)
    logoModel?.add(group)
    return { body, core, group, matteBody, matteFacets, spectral }
  })
}

function createSceneGraph() {
  const T = requireThree()
  if (!scene || !camera || !renderer || !RoomEnvironmentClass) return
  cameraRig = new T.Group()
  entryRig = new T.Group()
  cruiseRig = new T.Group()
  dragRig = new T.Group()
  logoModel = new T.Group()
  logoModel.position.y = LOGO_BASE_Y
  cameraRig.add(camera)
  entryRig.add(cruiseRig)
  cruiseRig.add(dragRig)
  dragRig.add(logoModel)
  scene.add(cameraRig, entryRig)

  chromeFlowTexture = createChromeFlowTexture()
  const pmrem = new T.PMREMGenerator(renderer)
  const room = new RoomEnvironmentClass()
  environmentRenderTarget = pmrem.fromScene(room, 0.035)
  environmentTexture = environmentRenderTarget.texture
  scene.environment = environmentTexture
  room.dispose()
  pmrem.dispose()

  const colors = getThemeColors()
  keyLight = new T.DirectionalLight(colors.primary.clone().lerp(new T.Color(0xffffff), 0.6), 1)
  keyLight.position.set(-3.4, 4.4, 5.2)
  rimLight = new T.DirectionalLight(colors.onSurface.clone().lerp(colors.primary, 0.32), 1)
  rimLight.position.set(3.8, 2.6, -4.2)
  fillLight = new T.DirectionalLight(colors.surface.clone().lerp(colors.primary, 0.2).offsetHSL(0.08, 0.05, 0.2), 1)
  fillLight.position.set(-4.0, -1.8, 2.4)
  bounceLight = new T.PointLight(colors.primary, 1, 7, 2)
  bounceLight.position.set(1.8, -2.0, 2.5)
  scene.add(keyLight, rimLight, fillLight, bounceLight, new T.HemisphereLight(colors.onSurface, colors.surface, 0.56))
  applyLogoLightIntensity()

  spectralMaterial = registerMaterial(
    new T.ShaderMaterial({
      blending: T.AdditiveBlending,
      depthWrite: false,
      fragmentShader: SpectralShellShader.fragmentShader,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: T.DoubleSide,
      transparent: true,
      uniforms: T.UniformsUtils.clone(SpectralShellShader.uniforms),
      vertexShader: SpectralShellShader.vertexShader,
    }),
  )
  spectralMaterial.uniforms.uPrimary.value = colors.primary.clone()
  spectralMaterial.uniforms.uSpectrumA.value = colors.primary.clone().offsetHSL(-0.055, -0.06, 0.1)
  spectralMaterial.uniforms.uSpectrumB.value = colors.primary.clone().offsetHSL(0.055, -0.08, 0.08)

  membraneMaterial = registerMaterial(
    new T.ShaderMaterial({
      blending: T.AdditiveBlending,
      depthWrite: false,
      fragmentShader: MembraneShader.fragmentShader,
      side: T.DoubleSide,
      transparent: true,
      uniforms: T.UniformsUtils.clone(MembraneShader.uniforms),
      vertexShader: MembraneShader.vertexShader,
    }),
  )
  membraneMaterial.uniforms.uColor.value = colors.primary.clone()
  membraneMesh = new T.Mesh(registerGeometry(new T.PlaneGeometry(3.4, 3.0, 32, 32)), membraneMaterial)
  membraneMesh.position.set(0, LOGO_BASE_Y, -0.56)
  membraneMesh.renderOrder = -1
  membraneMesh.visible = false
  entryRig.add(membraneMesh)

  causticMaterial = registerMaterial(
    new T.ShaderMaterial({
      blending: T.AdditiveBlending,
      depthWrite: false,
      fragmentShader: CausticShader.fragmentShader,
      transparent: true,
      uniforms: T.UniformsUtils.clone(CausticShader.uniforms),
      vertexShader: CausticShader.vertexShader,
    }),
  )
  causticMaterial.uniforms.uColor.value = colors.primary.clone()
  causticMesh = new T.Mesh(registerGeometry(new T.PlaneGeometry(2.5, 0.74)), causticMaterial)
  causticMesh.position.set(0, -0.94, -0.24)
  causticMesh.renderOrder = 0
  causticMesh.visible = true
  entryRig.add(causticMesh)

  createMaterialLibrary()
  createPieceRigs()
  applyMaterial(selectedMaterial.value)
}

function createPostProcessing(width: number, height: number) {
  const T = requireThree()
  if (
    !renderer ||
    !scene ||
    !camera ||
    !EffectComposerClass ||
    !RenderPassClass ||
    !ShaderPassClass ||
    !UnrealBloomPassClass ||
    !SMAAPassClass
  )
    return
  // 后处理绕过默认 framebuffer，必须在 composer 的渲染目标上单独启用 MSAA。
  const renderTarget = new T.WebGLRenderTarget(width, height, {
    samples: Math.min(POST_PROCESS_MSAA_SAMPLES, renderer.capabilities.maxSamples),
    type: T.HalfFloatType,
  })
  composer = new EffectComposerClass(renderer, renderTarget)
  composer.setPixelRatio(currentDpr)
  composer.setSize(width, height)
  const renderPass = new RenderPassClass(scene, camera)
  renderPass.clearAlpha = 0
  pulsePass = new ShaderPassClass(OpticalPulseShader)
  bloomPass = new UnrealBloomPassClass(new T.Vector2(width, height), 0.32, 0.68, 0.96)
  // 透明画布只保留贴近 Logo 的高频辉光，避免最宽 mip 将低亮 alpha 铺满整个渲染目标。
  const bloomMipWeights = [1, 0.9, 0.58, 0.1, 0]
  bloomPass.bloomTintColors.forEach((tint, index) => tint.setScalar(bloomMipWeights[index] ?? 0))
  bloomPass.blendMaterial.fragmentShader = TransparentBloomBlendFragmentShader
  bloomPass.blendMaterial.blending = T.CustomBlending
  bloomPass.blendMaterial.blendEquation = T.AddEquation
  bloomPass.blendMaterial.blendSrc = T.OneFactor
  bloomPass.blendMaterial.blendDst = T.OneFactor
  bloomPass.blendMaterial.blendEquationAlpha = T.AddEquation
  bloomPass.blendMaterial.blendSrcAlpha = T.OneFactor
  bloomPass.blendMaterial.blendDstAlpha = T.OneMinusSrcAlphaFactor
  bloomPass.blendMaterial.needsUpdate = true
  composer.addPass(renderPass)
  composer.addPass(pulsePass)
  composer.addPass(bloomPass)
  composer.addPass(new SMAAPassClass())
  if (OutputPassClass) composer.addPass(new OutputPassClass())
}

function updateRendererSize() {
  if (!renderer || !composer || !camera || !rootRef.value) return
  const bounds = rootRef.value.querySelector<HTMLElement>('.optical-logo-lab__stage')?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height) return
  const renderWidth = bounds.width + BLOOM_RENDER_PADDING * 2
  const renderHeight = bounds.height + BLOOM_RENDER_PADDING * 2
  const maximumDpr = preferredRenderDpr()
  if (currentDpr > maximumDpr) {
    currentDpr = maximumDpr
    renderer.transmissionResolutionScale = transmissionResolutionScaleForDpr(currentDpr)
  }
  renderer.setPixelRatio(currentDpr)
  renderer.setSize(renderWidth, renderHeight, false)
  composer.setPixelRatio(currentDpr)
  composer.setSize(renderWidth, renderHeight)
  camera.aspect = renderWidth / renderHeight
  camera.position.z = INITIAL_CAMERA_Z * (renderHeight / bounds.height)
  camera.updateProjectionMatrix()
  reducedMotionRenderPending = true
}

function setQualityDpr(next: number) {
  const maximumDpr = preferredRenderDpr()
  const capped = Math.max(MIN_RENDER_DPR, Math.min(maximumDpr, next))
  if (Math.abs(capped - currentDpr) < 0.01) return
  currentDpr = capped
  if (renderer) renderer.transmissionResolutionScale = transmissionResolutionScaleForDpr(currentDpr)
  updateRendererSize()
}

function updateAdaptiveQuality(deltaMs: number) {
  if (phase.value !== 'idle' || isPrewarming) return
  const maximumDpr = preferredRenderDpr()
  if (currentDpr > maximumDpr) {
    setQualityDpr(maximumDpr)
    slowFrameCount = 0
    fastFrameCount = 0
    return
  }
  if (deltaMs > 23) {
    fastFrameCount = 0
    if (currentDpr <= MIN_RENDER_DPR) {
      slowFrameCount = 0
      return
    }
    slowFrameCount += 1
    if (slowFrameCount > 90) {
      setQualityDpr(currentDpr - 0.25)
      slowFrameCount = 0
    }
  } else if (deltaMs < 18) {
    slowFrameCount = Math.max(0, slowFrameCount - 1)
    if (currentDpr >= maximumDpr) {
      fastFrameCount = 0
      return
    }
    fastFrameCount += 1
    if (fastFrameCount > 360) {
      setQualityDpr(currentDpr + 0.25)
      fastFrameCount = 0
    }
  }
}

function syncCardVisuals() {
  if (!cardElement) return
  const energy = THREE?.MathUtils.clamp(0.22 + opticalState.membrane * 0.28 + opticalState.pulse * 0.34, 0, 1) ?? 0.24
  const pulse = THREE?.MathUtils.clamp(opticalState.pulse, 0, 1) ?? 0
  const x = pointerState.x
  const y = 0.14 + pointerState.y * 0.34
  const values: Record<string, string> = {
    '--optical-glass-blur': `${(22 + energy * 8).toFixed(2)}px`,
    '--optical-glass-caustic-highlight-alpha': (0.13 + pulse * 0.28).toFixed(3),
    '--optical-glass-caustic-opacity': (0.18 + energy * 0.3).toFixed(3),
    '--optical-glass-caustic-primary-alpha': (0.07 + energy * 0.17).toFixed(3),
    '--optical-glass-caustic-scale': (0.82 + pulse * 0.34).toFixed(3),
    '--optical-glass-contrast': `${(102 + energy * 8).toFixed(2)}%`,
    '--optical-glass-glow-opacity': (0.28 + energy * 0.34 + pulse * 0.28).toFixed(3),
    '--optical-glass-pulse-blur': `${(13 - pulse * 4).toFixed(2)}px`,
    '--optical-glass-rotation': `${(-8 + energy * 12).toFixed(2)}deg`,
    '--optical-glass-saturate': `${(138 + energy * 34).toFixed(2)}%`,
    '--optical-glass-scale': (1 + pulse * 0.08).toFixed(3),
    '--optical-glass-shift-x': `${((x - 0.5) * 18).toFixed(2)}px`,
    '--optical-glass-shift-y': `${((y - 0.5) * 14).toFixed(2)}px`,
    '--optical-glass-x': `${(x * 100).toFixed(2)}%`,
    '--optical-glass-y': `${(y * 100).toFixed(2)}%`,
  }
  const signature = Object.values(values).join('|')
  if (signature === lastCardVisualSignature) return
  lastCardVisualSignature = signature
  Object.entries(values).forEach(([name, value]) => cardElement?.style.setProperty(name, value))
}

function clearCardVisuals() {
  if (!cardElement) return
  lastCardVisualSignature = ''
  ;[
    '--optical-glass-blur',
    '--optical-glass-caustic-highlight-alpha',
    '--optical-glass-caustic-opacity',
    '--optical-glass-caustic-primary-alpha',
    '--optical-glass-caustic-scale',
    '--optical-glass-contrast',
    '--optical-glass-glow-opacity',
    '--optical-glass-pulse-blur',
    '--optical-glass-rotation',
    '--optical-glass-saturate',
    '--optical-glass-scale',
    '--optical-glass-shift-x',
    '--optical-glass-shift-y',
    '--optical-glass-x',
    '--optical-glass-y',
  ].forEach(name => cardElement?.style.removeProperty(name))
}

function stopAutonomousTurn() {
  autonomousTween?.kill()
  autonomousTween = null
}

/** 匀速旋转以最终合成姿态对齐上游俯仰边界，随机转向保留原有大角度交互。 */
function clampDragPitch(pitch: number) {
  const minimum = selectedStaticMotion.value === 'steady' ? -0.4 - CRUISE_REST_PITCH : -1.1
  const maximum = selectedStaticMotion.value === 'steady' ? 0.4 - CRUISE_REST_PITCH : 1.1
  return Math.max(minimum, Math.min(maximum, pitch))
}

/** 完整进场始终从品牌正面开始，避免自主转向或拖拽姿态削弱入场识别度。 */
function resetViewingPoseForEntrance() {
  stopAutonomousTurn()
  cruiseState.pitch = CRUISE_REST_PITCH
  cruiseState.yaw = CRUISE_REST_YAW
  cruiseRig?.rotation.set(CRUISE_REST_PITCH, CRUISE_REST_YAW, 0)
  pointerState.targetPitch = 0
  pointerState.targetYaw = 0
  dragState.currentPitch = DRAG_REST_PITCH
  dragState.currentYaw = DRAG_REST_YAW
  dragState.targetPitch = DRAG_REST_PITCH
  dragState.targetYaw = DRAG_REST_YAW
  dragState.velocityPitch = 0
  dragState.velocityYaw = 0
  dragRig?.rotation.set(DRAG_REST_PITCH, DRAG_REST_YAW, 0)
}

function pauseAutomaticReplay() {
  nextReplayAt = Number.POSITIVE_INFINITY
}

/** 自动重播以一次完整的空闲窗口计时，用户交互不会继承已经消耗的等待时间。 */
function scheduleAutomaticReplay(now = performance.now()) {
  if (!isReady.value || prefersReducedMotion || selectedEntrance.value === 'none') {
    pauseAutomaticReplay()
    return
  }
  nextReplayAt = now + AUTO_REPLAY_MIN_MS + Math.random() * (AUTO_REPLAY_MAX_MS - AUTO_REPLAY_MIN_MS)
}

function playAutomaticReplayIfDue(now: number) {
  if (
    now < nextReplayAt ||
    prefersReducedMotion ||
    isDragging.value ||
    dragState.pointerId !== -1 ||
    formFocused ||
    phase.value !== 'idle' ||
    !isDocumentVisible ||
    !isIntersecting
  )
    return false
  pauseAutomaticReplay()
  playEntrance(selectedEntrance.value)
  return true
}

function scheduleAutonomousTurn(now: number) {
  if (
    selectedStaticMotion.value !== 'random' ||
    !gsapApi ||
    prefersReducedMotion ||
    isDragging.value ||
    formFocused ||
    phase.value !== 'idle'
  )
    return
  if (now < nextTurnAt || autonomousTween?.isActive()) return
  const quickTurn = Math.random() < 0.6
  const duration = quickTurn ? 1.15 + Math.random() * 0.85 : 2.6 + Math.random() * 1.8
  const pause = 0.12 + Math.random() * 0.58
  const step = quickTurn ? 0.9 + Math.random() * 0.76 : 0.55 + Math.random() * 0.55
  const yawLimit = Math.PI * 0.86
  let direction = Math.random() > 0.5 ? 1 : -1
  let yaw = cruiseState.yaw + direction * step
  if (yaw < -yawLimit || yaw > yawLimit) {
    direction *= -1
    yaw = cruiseState.yaw + direction * step
  }
  yaw = Math.max(-yawLimit, Math.min(yawLimit, yaw))
  const pitch = -0.22 + Math.random() * 0.46
  autonomousTween = gsapApi.to(cruiseState, {
    duration,
    ease: quickTurn ? 'power3.inOut' : 'sine.inOut',
    onComplete: () => {
      autonomousTween = null
    },
    overwrite: 'auto',
    pitch,
    yaw,
  })
  nextTurnAt = now + (duration + pause) * 1000
}

function renderTick(time: number, deltaMs: number) {
  if (!renderer || !composer || !scene || !camera || !isReady.value || !isIntersecting || !isDocumentVisible) return
  const maximumDpr = preferredRenderDpr()
  if (currentDpr > maximumDpr) {
    setQualityDpr(maximumDpr)
    slowFrameCount = 0
    fastFrameCount = 0
  }
  if (prefersReducedMotion && !isDragging.value && !reducedMotionRenderPending) return
  const now = performance.now()
  const interactive = phase.value !== 'idle' || isDragging.value || now < highRefreshUntil
  if (!interactive && now - lastRenderTime < IDLE_RENDER_INTERVAL) return
  const renderedIntervalMs = lastRenderTime > 0 ? now - lastRenderTime : deltaMs
  const delta = Math.min(renderedIntervalMs / 1000, 0.05)
  lastRenderTime = now
  if (!playAutomaticReplayIfDue(now)) {
    if (selectedStaticMotion.value === 'random') scheduleAutonomousTurn(now)
    else {
      if (autonomousTween) stopAutonomousTurn()
      cruiseState.pitch = CRUISE_REST_PITCH
      cruiseState.yaw += STEADY_ROTATION_SPEED * delta
    }
  }

  if (cruiseRig && dragRig && !prefersReducedMotion) {
    const focusDamping = formFocused ? 0.34 : 1
    const pointerPitch = selectedStaticMotion.value === 'random' ? pointerState.targetPitch * focusDamping : 0
    const pointerYaw = selectedStaticMotion.value === 'random' ? pointerState.targetYaw * focusDamping : 0
    pointerState.targetPitch += (0 - pointerState.targetPitch) * Math.min(1, delta * 0.4)
    pointerState.targetYaw += (0 - pointerState.targetYaw) * Math.min(1, delta * 0.4)
    cruiseRig.rotation.x += (cruiseState.pitch + pointerPitch - cruiseRig.rotation.x) * Math.min(1, delta * 3.4)
    cruiseRig.rotation.y += (cruiseState.yaw + pointerYaw - cruiseRig.rotation.y) * Math.min(1, delta * 3.4)
    const floatAmplitude = selectedStaticMotion.value === 'steady' ? 0.018 : formFocused ? 0.012 : 0.032
    cruiseRig.position.y = Math.sin(time * 0.72) * floatAmplitude

    if (!isDragging.value) {
      dragState.targetYaw += dragState.velocityYaw * delta
      dragState.targetPitch += dragState.velocityPitch * delta
      dragState.velocityYaw *= Math.exp(-3.5 * delta)
      dragState.velocityPitch *= Math.exp(-4.2 * delta)
      if (Math.abs(dragState.velocityYaw) < 0.015 && Math.abs(dragState.velocityPitch) < 0.015) {
        dragState.targetYaw += (0 - dragState.targetYaw) * Math.min(1, delta * 0.16)
        dragState.targetPitch += (-0.06 - dragState.targetPitch) * Math.min(1, delta * 0.22)
      }
      if (selectedStaticMotion.value === 'steady') {
        dragState.targetPitch = clampDragPitch(dragState.targetPitch)
      }
    } else {
      dragState.velocityYaw *= Math.exp(-7 * delta)
      dragState.velocityPitch *= Math.exp(-7 * delta)
    }
    dragState.currentYaw += (dragState.targetYaw - dragState.currentYaw) * Math.min(1, delta * 12)
    dragState.currentPitch += (dragState.targetPitch - dragState.currentPitch) * Math.min(1, delta * 12)
    dragRig.rotation.set(dragState.currentPitch, dragState.currentYaw, 0)
  } else if (dragRig) {
    if (prefersReducedMotion && (isDragging.value || reducedMotionRenderPending)) {
      dragState.currentPitch = dragState.targetPitch
      dragState.currentYaw = dragState.targetYaw
    }
    dragRig.rotation.set(dragState.currentPitch, dragState.currentYaw, 0)
  }

  if (spectralMaterial) {
    const lightLevel = normalizedLightIntensity()
    spectralMaterial.uniforms.uTime.value = time
    spectralMaterial.uniforms.uMicrostructure.value = selectedMaterial.value === 'chrome' ? 0.055 : 0
    spectralMaterial.uniforms.uOpacity.value = Math.max(
      opticalState.spectral,
      selectedMaterial.value === 'crystal' ? 0.07 + lightLevel * 0.09 : 0,
    )
  }
  if (membraneMaterial) {
    const membraneActive = opticalState.membrane > 0.001
    membraneMaterial.uniforms.uTime.value = time
    membraneMaterial.uniforms.uBulge.value = opticalState.membrane
    membraneMaterial.uniforms.uPulse.value = membraneActive ? opticalState.pulse : 0
  }
  if (membraneMesh) membraneMesh.visible = opticalState.membrane > 0.001
  if (causticMaterial) {
    causticMaterial.uniforms.uTime.value = time
    causticMaterial.uniforms.uPulse.value = opticalState.caustic + opticalState.pulse * 0.7
  }
  materialRigs?.energy.core.forEach(material => {
    if (THREE && material instanceof THREE.ShaderMaterial) material.uniforms.uTime.value = time
  })
  if (chromeFlowTexture) {
    chromeFlowTexture.offset.x = (chromeFlowTexture.offset.x + delta * 0.012) % 1
    chromeFlowTexture.offset.y = (chromeFlowTexture.offset.y + delta * 0.007) % 1
  }
  if (pulsePass) pulsePass.uniforms.amount.value = opticalState.focus * 0.012 + opticalState.pulse * 0.006
  if (bloomPass) {
    const lightLevel = normalizedLightIntensity()
    const bloomProfile = BLOOM_PROFILES[selectedMaterial.value]
    bloomPass.threshold = bloomProfile.threshold
    bloomPass.strength = lightLevel * (bloomProfile.strength + opticalState.pulse * 0.52)
  }
  syncCardVisuals()
  const renderStartedAt = performance.now()
  composer.render(delta)
  const renderCostMs = performance.now() - renderStartedAt
  reducedMotionRenderPending = false
  updateAdaptiveQuality(Math.max(renderedIntervalMs, renderCostMs))
  updateDragAudio()
}

function killMotionTimelines() {
  activeTimeline?.kill()
  previewTimeline?.kill()
  if (materialTimeline) {
    materialTimeline.kill()
    applyMaterial(selectedMaterial.value)
    opticalState.spectral = 0
  }
  activeTimeline = null
  previewTimeline = null
  materialTimeline = null
  previewMode = null
}

function resetPieceTransforms() {
  pieceRigs.forEach(piece => {
    piece.group.position.set(0, 0, 0)
    piece.group.rotation.set(0, 0, 0)
    piece.group.scale.setScalar(1)
  })
}

/** 将可中断进场收敛到稳定展示姿态，避免后续交互继承半程变换。 */
function resetEntrancePose() {
  resetPieceTransforms()
  entryRig?.position.set(0, 0, 0)
  entryRig?.rotation.set(0, 0, 0)
  entryRig?.scale.setScalar(1)
  cameraRig?.position.set(0, 0, 0)
  cameraRig?.rotation.set(0, 0, 0)
  opticalState.caustic = 0.25
  opticalState.focus = 0
  opticalState.membrane = 0
  opticalState.pulse = 0
  opticalState.spectral = 0
}

function finishEntrance() {
  activeTimeline = null
  resetEntrancePose()
  phase.value = 'idle'
  nextTurnAt = performance.now() + 700 + Math.random() * 700
  scheduleAutomaticReplay()
  highRefreshUntil = performance.now() + 500
  scheduleMaterialPrewarm()
}

/** 播放可中断的完整进场；所有路径最终归一到同一悬浮姿态。 */
function playEntrance(mode: EntranceMode, fromPreview = false, userInitiated = false) {
  if (!gsapApi || !isReady.value || prefersReducedMotion || !entryRig || !cameraRig) return
  killMotionTimelines()
  pauseAutomaticReplay()
  resetViewingPoseForEntrance()
  if (!fromPreview) resetEntrancePose()
  if (mode === 'none') {
    phase.value = 'idle'
    highRefreshUntil = performance.now() + 300
    scheduleMaterialPrewarm()
    return
  }
  phase.value = 'playing'
  highRefreshUntil = performance.now() + 2200
  if (userInitiated) playEntranceSound(mode)

  const timeline = gsapApi.timeline({ onComplete: finishEntrance, defaults: { overwrite: 'auto' } })
  activeTimeline = timeline
  if (mode === 'assemble') {
    entryRig.position.set(0, 0, 0)
    entryRig.rotation.set(0, 0, 0)
    entryRig.scale.setScalar(1)
    opticalState.membrane = 0
    pieceRigs.forEach((piece, index) => {
      const offset = ASSEMBLE_OFFSETS[index]
      if (!fromPreview) {
        piece.group.position.set(offset.x, offset.y, offset.z)
        piece.group.rotation.z = offset.rotation
        piece.group.scale.setScalar(index === 2 ? 0.82 : 0.88)
      }
      const start = index * 0.09
      timeline.to(piece.group.position, { duration: 0.78, ease: 'power3.inOut', x: 0, y: 0, z: 0 }, start)
      timeline.to(piece.group.rotation, { duration: 0.82, ease: 'power3.inOut', z: 0 }, start)
      timeline.to(piece.group.scale, { duration: 0.82, ease: 'back.out(1.35)', x: 1, y: 1, z: 1 }, start)
    })
    timeline.fromTo(cameraRig.position, { z: 0.48 }, { duration: 1.08, ease: 'power2.out', z: 0 }, 0)
    timeline.fromTo(cameraRig.rotation, { y: -0.08 }, { duration: 1.08, ease: 'power2.out', y: 0 }, 0)
    timeline.fromTo(opticalState, { focus: 0.72 }, { duration: 0.86, ease: 'power2.out', focus: 0 }, 0)
    timeline.to(opticalState, { caustic: 0.82, duration: 0.16, pulse: 1, spectral: 0.72 }, 0.76)
    timeline.to(opticalState, { caustic: 0.25, duration: 0.34, ease: 'power2.out', pulse: 0, spectral: 0 }, 0.92)
  } else {
    resetPieceTransforms()
    if (!fromPreview) {
      entryRig.position.set(0, 0, -1.18)
      entryRig.rotation.set(-0.08, 0.46, 0)
      entryRig.scale.setScalar(0.76)
      opticalState.membrane = 0.18
    }
    timeline.to(opticalState, { duration: 0.52, ease: 'power2.in', focus: 0.56, membrane: 1 }, 0)
    timeline.to(entryRig.position, { duration: 0.92, ease: 'power3.inOut', z: 0.18 }, 0.16)
    timeline.to(entryRig.rotation, { duration: 0.98, ease: 'power3.inOut', x: 0, y: -0.06 }, 0.12)
    timeline.to(entryRig.scale, { duration: 0.96, ease: 'back.out(1.18)', x: 1.035, y: 1.035, z: 1.035 }, 0.14)
    timeline.to(opticalState, { caustic: 0.95, duration: 0.18, pulse: 1, spectral: 0.86 }, 0.74)
    timeline.to(entryRig.position, { duration: 0.34, ease: 'back.out(1.7)', z: 0 }, 0.9)
    timeline.to(entryRig.rotation, { duration: 0.34, ease: 'power2.out', y: 0 }, 0.9)
    timeline.to(entryRig.scale, { duration: 0.34, ease: 'power2.out', x: 1, y: 1, z: 1 }, 0.9)
    timeline.to(
      opticalState,
      { caustic: 0.25, duration: 0.46, ease: 'power2.out', focus: 0, membrane: 0, pulse: 0, spectral: 0 },
      0.92,
    )
    timeline.fromTo(cameraRig.position, { z: -0.18 }, { duration: 1.28, ease: 'power2.out', z: 0 }, 0)
    timeline.fromTo(cameraRig.rotation, { y: 0.07 }, { duration: 1.2, ease: 'power2.out', y: 0 }, 0)
  }
}

function previewEntrance(mode: EntranceMode) {
  if (!gsapApi || !isReady.value || !canHoverQuery?.matches || prefersReducedMotion || phase.value === 'playing') return
  if (mode === 'none') return
  previewTimeline?.kill()
  previewMode = mode
  phase.value = 'charging'
  highRefreshUntil = performance.now() + 900
  const timeline = gsapApi.timeline({ defaults: { duration: 0.34, ease: 'power2.out', overwrite: 'auto' } })
  previewTimeline = timeline
  if (mode === 'assemble') {
    timeline.to(pieceRigs[0].group.position, { x: -0.1, y: 0.05, z: -0.08 }, 0)
    timeline.to(pieceRigs[1].group.position, { x: 0.1, y: -0.04, z: -0.05 }, 0)
    timeline.to(pieceRigs[2].group.position, { x: 0.01, y: 0.02, z: 0.12 }, 0)
    timeline.to(opticalState, { spectral: 0.2 }, 0)
  } else if (entryRig) {
    timeline.to(entryRig.position, { z: -0.16 }, 0)
    timeline.to(entryRig.scale, { x: 0.97, y: 0.97, z: 0.97 }, 0)
    timeline.to(opticalState, { focus: 0.18, membrane: 0.38, spectral: 0.24 }, 0)
  }
}

function clearEntrancePreview() {
  if (!previewTimeline || phase.value !== 'charging') return
  previewTimeline.eventCallback('onReverseComplete', () => {
    previewTimeline = null
    phase.value = 'idle'
    previewMode = null
    resetEntrancePose()
    scheduleAutomaticReplay()
    scheduleMaterialPrewarm()
  })
  previewTimeline.reverse()
}

function handleEntranceSelection(mode: EntranceMode) {
  void unlockAudioFromGesture()
  const fromPreview = previewMode === mode && phase.value === 'charging'
  selectedEntrance.value = mode
  persistCurrentSelection()
  playEntrance(mode, fromPreview, true)
}

/** 在匀速水平转台与随机转向间切换，两者都保持 Logo 零滚转。 */
function handleStaticMotionSelection(mode: StaticMotionMode) {
  if (mode === selectedStaticMotion.value) return
  selectedStaticMotion.value = mode
  stopAutonomousTurn()
  cruiseState.pitch = CRUISE_REST_PITCH
  if (mode === 'steady') pointerState.targetPitch = 0
  nextTurnAt = performance.now() + 500
  if (!presetPersistenceSuspended) writePersistedState({ staticMotion: mode })
  highRefreshUntil = performance.now() + 900
  reducedMotionRenderPending = true
}

function handleMaterialSelection(mode: LogoStyle) {
  if (!gsapApi || !isReady.value || mode === selectedMaterial.value) return
  void unlockAudioFromGesture()
  killMotionTimelines()
  resetEntrancePose()
  phase.value = 'playing'
  highRefreshUntil = performance.now() + 1000
  selectedMaterial.value = mode
  persistCurrentSelection()
  playMaterialSound(mode)
  if (prefersReducedMotion) {
    applyMaterial(mode)
    phase.value = 'idle'
    reducedMotionRenderPending = true
    scheduleAutomaticReplay()
    scheduleMaterialPrewarm()
    return
  }
  materialTimeline = gsapApi.timeline({
    onComplete: () => {
      opticalState.spectral = 0
      phase.value = 'idle'
      if (mode !== 'prismatic') prewarmedMaterials.add(mode)
      materialTimeline = null
      scheduleAutomaticReplay()
      scheduleMaterialPrewarm()
    },
  })
  materialTimeline.to(opticalState, { duration: 0.22, ease: 'power2.in', spectral: 0.92 })
  materialTimeline.call(() => applyMaterial(mode))
  materialTimeline.to(opticalState, { duration: 0.34, ease: 'power2.out', spectral: 0 })
}

function replayEntrance() {
  void unlockAudioFromGesture()
  playEntrance(selectedEntrance.value, false, true)
}

function togglePinned() {
  isPinned.value = !isPinned.value
  if (presetPersistenceSuspended) return
  writePersistedState({
    pinned: isPinned.value,
    pinnedCombination: isPinned.value ? combinationKey() : undefined,
  })
}

/** 删除本地预设并还原代码默认值，不影响其他登录页偏好。 */
function resetLabPreset() {
  presetPersistenceSuspended = true
  killMotionTimelines()
  resetEntrancePose()
  phase.value = 'idle'
  stopAllAudio()
  void audioContext?.suspend().catch(() => undefined)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 浏览器禁用存储时仍可在当前会话恢复默认值。
  }
  applyPreset(DEFAULT_LOGO_PRESET)
  applyMaterial(selectedMaterial.value)
  handleThemeRefresh()
  applyLogoLightIntensity()
  prismaticReplayKey.value += 1
  void nextTick(() => {
    updateRendererSize()
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 同上，存储不可用时仅恢复当前会话。
    }
    presetPersistenceSuspended = false
  })
}

/** 在统一主题色家族与分色配色之间切换，并立即刷新所有预编译材质。 */
function toggleThemeFamily() {
  unifiedThemeFamily.value = !unifiedThemeFamily.value
  if (!presetPersistenceSuspended) {
    writePersistedState({ unifiedThemeFamily: unifiedThemeFamily.value })
  }
  handleThemeRefresh()
}

function createAudioBuffer(context: AudioContext) {
  const duration = 0.7
  const length = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 2719
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 16807) % 2147483647
    const random = (seed / 2147483647) * 2 - 1
    const envelope = Math.exp((-index / length) * 4.5)
    data[index] = random * envelope
  }
  return buffer
}

/** AudioContext 只在可信用户手势中创建或恢复，页面首次自动进场始终静音。 */
async function ensureAudioContext() {
  if (!soundEnabled.value) return null
  if (!audioContext) {
    const webkitAudioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextClass = window.AudioContext || webkitAudioWindow.webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
    audioMaster = audioContext.createGain()
    audioMaster.gain.value = 0.42
    audioCompressor = audioContext.createDynamicsCompressor()
    audioCompressor.threshold.value = -18
    audioCompressor.knee.value = 12
    audioCompressor.ratio.value = 5
    audioCompressor.attack.value = 0.006
    audioCompressor.release.value = 0.22
    audioMaster.connect(audioCompressor).connect(audioContext.destination)
    noiseBuffer = createAudioBuffer(audioContext)
  }
  if (audioContext.state === 'suspended') await audioContext.resume()
  return audioContext
}

async function unlockAudioFromGesture() {
  if (!soundEnabled.value) return
  try {
    await ensureAudioContext()
  } catch {
    // 浏览器拒绝声音解锁时保持视觉功能可用。
  }
}

function trackAudioSource<T extends AudioScheduledSourceNode>(source: T) {
  activeAudioSources.add(source)
  source.addEventListener('ended', () => activeAudioSources.delete(source), { once: true })
  return source
}

function playTone(frequency: number, duration: number, gainValue: number, delay = 0, type: OscillatorType = 'sine', end?: number) {
  if (!audioContext || !audioMaster) return
  const start = audioContext.currentTime + delay
  const oscillator = trackAudioSource(audioContext.createOscillator())
  const gain = audioContext.createGain()
  const pan = audioContext.createStereoPanner()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (end) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, end), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + Math.min(0.035, duration * 0.22))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  pan.pan.value = Math.sin(frequency) * 0.28
  oscillator.connect(gain).connect(pan).connect(audioMaster)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

function playNoise(duration: number, gainValue: number, frequency: number, delay = 0) {
  if (!audioContext || !audioMaster) return
  if (!noiseBuffer) return
  const start = audioContext.currentTime + delay
  const source = trackAudioSource(audioContext.createBufferSource())
  const filter = audioContext.createBiquadFilter()
  const gain = audioContext.createGain()
  source.buffer = noiseBuffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(frequency, start)
  filter.frequency.exponentialRampToValueAtTime(Math.max(90, frequency * 0.55), start + duration)
  filter.Q.value = 2.2
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + Math.min(0.055, duration * 0.22))
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter).connect(gain).connect(audioMaster)
  source.start(start)
  source.stop(start + duration + 0.02)
}

function playMaterialSound(mode: LogoStyle) {
  if (!audioContext) return
  if (mode === 'crystal') {
    playTone(760, 0.58, 0.045, 0, 'sine', 920)
    playTone(1260, 0.46, 0.024, 0.05, 'sine', 1420)
    playNoise(0.34, 0.018, 3000, 0.03)
  } else if (mode === 'chrome') {
    playTone(110, 0.62, 0.07, 0, 'sine', 84)
    playNoise(0.52, 0.04, 620)
  } else if (mode === 'energy') {
    playTone(164, 0.62, 0.075, 0, 'sawtooth', 292)
    playTone(420, 0.5, 0.04, 0.08, 'sine', 620)
    playNoise(0.35, 0.03, 1700, 0.04)
  } else if (mode === 'matte') {
    playTone(168, 0.54, 0.042, 0, 'sine', 132)
    playNoise(0.34, 0.018, 720, 0.02)
  } else if (mode === 'prismatic') {
    playTone(680, 0.5, 0.032, 0, 'sine', 940)
    playTone(1040, 0.42, 0.018, 0.06, 'sine', 1320)
  } else {
    playNoise(0.32, 0.022, 1600)
    playTone(520, 0.56, 0.045, 0.02, 'sine', 480)
    playTone(780, 0.44, 0.022, 0.06, 'sine', 700)
  }
}

function playEntranceSound(mode: EntranceMode) {
  if (!audioContext || mode === 'none') return
  playMaterialSound(selectedMaterial.value)
  if (mode === 'assemble') {
    ;[0, 0.09, 0.18].forEach((delay, index) => playTone(210 + index * 76, 0.26, 0.025, delay, 'sine', 320 + index * 96))
    playNoise(0.34, 0.035, 1300, 0.62)
    playTone(82, 0.52, 0.1, 0.68, 'sine', 52)
  } else {
    playNoise(0.76, 0.04, 520)
    playTone(72, 0.96, 0.1, 0, 'sine', 38)
    playNoise(0.36, 0.025, 2200, 0.62)
    playTone(980, 0.48, 0.035, 0.7, 'sine', 1240)
  }
}

async function startDragAudio() {
  let context: AudioContext | null = null
  try {
    context = await ensureAudioContext()
  } catch {
    // 声音恢复失败不影响 Logo 的拖拽交互。
    return
  }
  if (!context || !audioMaster || dragAudio || !isDragging.value || !soundEnabled.value) return
  const profile = DRAG_AUDIO_PROFILES[selectedMaterial.value]
  const oscillator = context.createOscillator()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  const pan = context.createStereoPanner()
  oscillator.type = profile.waveform
  oscillator.frequency.value = profile.baseFrequency
  filter.type = profile.filterType
  filter.frequency.value = profile.baseFilter
  filter.Q.value = profile.filterQ
  gain.gain.value = 0.0001
  oscillator.connect(filter).connect(gain).connect(pan).connect(audioMaster)
  oscillator.start()
  dragAudio = { filter, gain, oscillator, pan, profile }
}

function updateDragAudio() {
  if (!audioContext || !dragAudio) return
  const speed = Math.min(1, Math.abs(dragState.velocityYaw) * 0.32 + Math.abs(dragState.velocityPitch) * 0.4)
  const now = audioContext.currentTime
  const { profile } = dragAudio
  dragAudio.gain.gain.setTargetAtTime(isDragging.value ? profile.gainBase + speed * profile.gainRange : 0.0001, now, 0.045)
  dragAudio.filter.frequency.setTargetAtTime(profile.baseFilter + speed * profile.filterRange, now, 0.05)
  dragAudio.oscillator.frequency.setTargetAtTime(profile.baseFrequency + speed * profile.frequencyRange, now, 0.045)
  dragAudio.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, dragState.velocityYaw * 0.18)), now, 0.06)
}

function stopDragAudio() {
  if (!dragAudio || !audioContext) return
  const voice = dragAudio
  dragAudio = null
  voice.gain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.035)
  window.setTimeout(() => {
    try {
      voice.oscillator.stop()
    } catch {
      // 已停止的 oscillator 无需重复处理。
    }
    voice.oscillator.disconnect()
    voice.filter.disconnect()
    voice.gain.disconnect()
    voice.pan.disconnect()
  }, 160)
}

async function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  if (!presetPersistenceSuspended) writePersistedState({ soundEnabled: soundEnabled.value })
  if (soundEnabled.value) {
    await unlockAudioFromGesture()
    playMaterialSound(selectedMaterial.value)
  } else {
    stopAllAudio()
    await audioContext?.suspend().catch(() => undefined)
  }
}

function stopAllAudio() {
  stopDragAudio()
  activeAudioSources.forEach(source => {
    try {
      source.stop()
    } catch {
      // source 已自然结束时忽略 InvalidStateError。
    }
  })
  activeAudioSources.clear()
}

function handleCardPointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' || !cardElement) return
  const bounds = cardElement.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  pointerState.x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  pointerState.y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  pointerState.targetYaw = (pointerState.x - 0.5) * 0.24
  pointerState.targetPitch = (0.5 - pointerState.y) * 0.15
  highRefreshUntil = performance.now() + 260
}

function handleCardPointerLeave() {
  pointerState.x = 0.5
  pointerState.y = 0.32
  pointerState.targetYaw = 0
  pointerState.targetPitch = 0
}

function isFormInput(element: Element | null) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
}

function handleCardFocusIn(event: FocusEvent) {
  formFocused = event.target instanceof Element && isFormInput(event.target)
  if (formFocused) pauseAutomaticReplay()
}

function handleCardFocusOut() {
  window.setTimeout(() => {
    const activeElement = document.activeElement
    formFocused = Boolean(activeElement && cardElement?.contains(activeElement) && isFormInput(activeElement))
    if (formFocused) pauseAutomaticReplay()
    else scheduleAutomaticReplay()
  }, 0)
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0 || !isReady.value || selectedMaterial.value === 'prismatic') return
  void unlockAudioFromGesture()
  dragState.pointerId = event.pointerId
  dragState.pointerType = event.pointerType
  dragState.startX = event.clientX
  dragState.startY = event.clientY
  dragState.lastX = event.clientX
  dragState.lastY = event.clientY
  dragState.moved = false
  dragState.suppressClick = false
  pauseAutomaticReplay()
  stageRef.value?.setPointerCapture(event.pointerId)
  highRefreshUntil = performance.now() + 1200
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerId !== dragState.pointerId || !stageRef.value?.hasPointerCapture(event.pointerId)) return
  const deltaX = event.clientX - dragState.lastX
  const deltaY = event.clientY - dragState.lastY
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)
  const threshold = dragState.pointerType === 'touch' ? 8 : 4
  if (!dragState.moved && distance >= threshold) {
    dragState.moved = true
    dragState.suppressClick = true
    isDragging.value = true
    phase.value = 'dragging'
    killMotionTimelines()
    stopAutonomousTurn()
    resetEntrancePose()
    void startDragAudio()
  }
  if (!dragState.moved) return
  dragState.targetYaw += deltaX * 0.012
  const nextPitch = dragState.targetPitch + deltaY * 0.009
  dragState.targetPitch = clampDragPitch(nextPitch)
  dragState.velocityYaw = Math.max(-5, Math.min(5, deltaX * 0.085))
  dragState.velocityPitch = Math.max(-3, Math.min(3, deltaY * 0.055))
  dragState.lastX = event.clientX
  dragState.lastY = event.clientY
  highRefreshUntil = performance.now() + 900
  reducedMotionRenderPending = true
}

function finishPointerInteraction(event?: PointerEvent) {
  if (event && stageRef.value?.hasPointerCapture(event.pointerId)) stageRef.value.releasePointerCapture(event.pointerId)
  if (dragState.moved) {
    isDragging.value = false
    phase.value = 'idle'
    stopDragAudio()
    nextTurnAt = performance.now() + 400 + Math.random() * 500
    highRefreshUntil = performance.now() + 1400
    reducedMotionRenderPending = true
  }
  dragState.pointerId = -1
  scheduleAutomaticReplay()
}

function handleLostPointerCapture() {
  if (dragState.pointerId === -1) return
  finishPointerInteraction()
}

function handleStageClick() {
  if (dragState.suppressClick) {
    dragState.suppressClick = false
    return
  }
  emit('logo-click')
  if (selectedMaterial.value === 'prismatic') {
    if (selectedEntrance.value !== 'none') prismaticReplayKey.value += 1
    return
  }
  if (prefersReducedMotion) {
    dragState.targetYaw += Math.PI / 12
    reducedMotionRenderPending = true
    return
  }
  replayEntrance()
}

function handleStageKeydown(event: KeyboardEvent) {
  const step = Math.PI / 12
  if (event.key === 'ArrowLeft') dragState.targetYaw -= step
  else if (event.key === 'ArrowRight') dragState.targetYaw += step
  else if (event.key === 'ArrowUp') dragState.targetPitch = clampDragPitch(dragState.targetPitch - step / 2)
  else if (event.key === 'ArrowDown') dragState.targetPitch = clampDragPitch(dragState.targetPitch + step / 2)
  else return
  highRefreshUntil = performance.now() + 900
  reducedMotionRenderPending = true
  scheduleAutomaticReplay()
  event.preventDefault()
}

function getRadioStep(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return 1
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return -1
  return 0
}

function handleMaterialKeydown(event: KeyboardEvent, current: LogoStyle) {
  const step = getRadioStep(event)
  if (!step && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const currentIndex = LOGO_STYLES.indexOf(current)
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? LOGO_STYLES.length - 1
        : (currentIndex + step + LOGO_STYLES.length) % LOGO_STYLES.length
  const nextMode = LOGO_STYLES[nextIndex]
  handleMaterialSelection(nextMode)
  void nextTick(() => rootRef.value?.querySelector<HTMLButtonElement>(`[data-material="${nextMode}"]`)?.focus())
}

function handleEntranceKeydown(event: KeyboardEvent, current: EntranceMode) {
  const step = getRadioStep(event)
  if (!step && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const currentIndex = ENTRANCE_MODES.indexOf(current)
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? ENTRANCE_MODES.length - 1
        : (currentIndex + step + ENTRANCE_MODES.length) % ENTRANCE_MODES.length
  const nextMode = ENTRANCE_MODES[nextIndex]
  handleEntranceSelection(nextMode)
  void nextTick(() => rootRef.value?.querySelector<HTMLButtonElement>(`[data-entrance="${nextMode}"]`)?.focus())
}

function handleStaticMotionKeydown(event: KeyboardEvent, current: StaticMotionMode) {
  const step = getRadioStep(event)
  if (!step && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const currentIndex = STATIC_MOTION_MODES.indexOf(current)
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? STATIC_MOTION_MODES.length - 1
        : (currentIndex + step + STATIC_MOTION_MODES.length) % STATIC_MOTION_MODES.length
  const nextMode = STATIC_MOTION_MODES[nextIndex]
  handleStaticMotionSelection(nextMode)
  void nextTick(() => rootRef.value?.querySelector<HTMLButtonElement>(`[data-static-motion="${nextMode}"]`)?.focus())
}

function suspendAudioForInvisibility() {
  stopAllAudio()
  void audioContext?.suspend().catch(() => undefined)
}

function handleVisibilityChange() {
  isDocumentVisible = !document.hidden
  if (!isDocumentVisible) {
    pauseAutomaticReplay()
    suspendAudioForInvisibility()
  }
  else {
    lastRenderTime = 0
    highRefreshUntil = performance.now() + 500
    reducedMotionRenderPending = true
    scheduleAutomaticReplay()
  }
}

function handleIntersection(entries: IntersectionObserverEntry[]) {
  isIntersecting = entries[0]?.isIntersecting ?? true
  if (!isIntersecting) {
    pauseAutomaticReplay()
    suspendAudioForInvisibility()
  }
  else {
    lastRenderTime = 0
    highRefreshUntil = performance.now() + 500
    reducedMotionRenderPending = true
    scheduleAutomaticReplay()
  }
}

function handleReducedMotionChange(event?: MediaQueryListEvent) {
  prefersReducedMotion = event?.matches ?? reducedMotionQuery?.matches ?? false
  if (prefersReducedMotion) {
    killMotionTimelines()
    stopAutonomousTurn()
    pauseAutomaticReplay()
    phase.value = isReady.value ? 'idle' : phase.value
    resetEntrancePose()
    reducedMotionRenderPending = true
  } else {
    lastRenderTime = 0
    highRefreshUntil = performance.now() + 500
    scheduleAutomaticReplay()
  }
}

function handleContextLost(event: Event) {
  event.preventDefault()
  generation += 1
  isReady.value = false
  phase.value = 'fallback'
  pauseAutomaticReplay()
  if (gsapApi) gsapApi.ticker.remove(renderTick)
}

function handleContextRestored() {
  destroyScene(false)
  void initializeScene()
}

async function loadRuntime() {
  if (THREE && gsapApi) return
  const [
    threeModule,
    gsapModule,
    composerModule,
    renderPassModule,
    shaderPassModule,
    bloomModule,
    smaaModule,
    outputModule,
    roomModule,
  ] = await Promise.all([
    import('three'),
    import('gsap'),
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/ShaderPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/SMAAPass.js'),
    import('three/examples/jsm/postprocessing/OutputPass.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ])
  THREE = threeModule
  gsapApi = gsapModule.gsap
  EffectComposerClass = composerModule.EffectComposer
  RenderPassClass = renderPassModule.RenderPass
  ShaderPassClass = shaderPassModule.ShaderPass
  UnrealBloomPassClass = bloomModule.UnrealBloomPass
  SMAAPassClass = smaaModule.SMAAPass
  OutputPassClass = outputModule.OutputPass
  RoomEnvironmentClass = roomModule.RoomEnvironment
}

async function prewarmRemainingMaterials() {
  if (
    !renderer ||
    !scene ||
    !camera ||
    !materialRigs ||
    isPrewarming ||
    prefersReducedMotion ||
    phase.value !== 'idle' ||
    isDragging.value ||
    !isIntersecting ||
    !isDocumentVisible ||
    prewarmedMaterials.size === MATERIAL_MODES.length
  )
    return
  isPrewarming = true
  const token = generation
  const T = requireThree()
  try {
    for (const mode of MATERIAL_MODES) {
      if (prewarmedMaterials.has(mode) || token !== generation || !renderer || !scene || !camera || !materialRigs) continue
      const rig = materialRigs[mode]
      const prewarmGroup = new T.Group()
      pieceRigs.forEach((piece, index) => {
        const bodyGeometry = mode === 'matte' ? piece.matteBody.geometry : piece.body.geometry
        const body = new T.Mesh(bodyGeometry, [rig.face[index], rig.side[index]])
        const core = new T.Mesh(piece.core.geometry, rig.core[index])
        core.visible = mode !== 'chrome' && mode !== 'matte'
        prewarmGroup.add(body, core)
        if (mode === 'matte') {
          piece.matteFacets.forEach((facet, facetIndex) => {
            prewarmGroup.add(new T.Mesh(facet.geometry, rig.facets[index][facetIndex]))
          })
        }
      })
      await renderer.compileAsync(prewarmGroup, camera, scene)
      prewarmGroup.clear()
      if (token === generation) prewarmedMaterials.add(mode)
    }
  } catch {
    // 预编译失败不影响当前材质继续渲染。
  } finally {
    isPrewarming = false
    highRefreshUntil = performance.now() + 300
  }
}

function scheduleMaterialPrewarm() {
  if (idleTaskId !== null || isPrewarming || prewarmedMaterials.size === MATERIAL_MODES.length) return
  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleTaskId = idleWindow.requestIdleCallback(
      () => {
        idleTaskId = null
        void prewarmRemainingMaterials()
      },
      { timeout: 1800 },
    )
  } else {
    idleTaskId = window.setTimeout(() => {
      idleTaskId = null
      void prewarmRemainingMaterials()
    }, 900)
  }
}

async function initializeScene() {
  const token = ++generation
  const canvas = canvasRef.value
  if (!canvas) return
  phase.value = 'loading'
  try {
    await loadRuntime()
    if (token !== generation) return
    const T = requireThree()
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true, canvas, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = T.SRGBColorSpace
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    currentDpr = preferredRenderDpr()
    renderer.transmissionResolutionScale = transmissionResolutionScaleForDpr(currentDpr)

    scene = new T.Scene()
    camera = new T.PerspectiveCamera(27, 1, 0.1, 100)
    camera.position.set(0, 0.02, INITIAL_CAMERA_Z)
    camera.lookAt(0, 0, 0)
    createSceneGraph()
    const stageBounds = rootRef.value?.querySelector<HTMLElement>('.optical-logo-lab__stage')?.getBoundingClientRect()
    createPostProcessing(
      (stageBounds?.width || 160) + BLOOM_RENDER_PADDING * 2,
      (stageBounds?.height || 160) + BLOOM_RENDER_PADDING * 2,
    )
    updateRendererSize()
    updateThemeMaterials()
    await renderer.compileAsync(scene, camera)
    if (token !== generation) return
    if (selectedMaterial.value !== 'prismatic') prewarmedMaterials.add(selectedMaterial.value)
    isReady.value = true
    phase.value = 'idle'
    gsapApi?.ticker.remove(renderTick)
    gsapApi?.ticker.add(renderTick)
    highRefreshUntil = performance.now() + 2200
    if (!prefersReducedMotion) playEntrance(selectedEntrance.value)
    else {
      composer?.render(0)
      reducedMotionRenderPending = false
    }
  } catch (error) {
    console.warn('无法初始化登录页 3D 光学 Logo，已回退到静态版本。', error)
    isReady.value = false
    phase.value = 'fallback'
    destroyScene(false)
  }
}

function destroyScene(forceContextLoss: boolean) {
  gsapApi?.ticker.remove(renderTick)
  killMotionTimelines()
  stopAutonomousTurn()
  pauseAutomaticReplay()
  composer?.passes.forEach(pass => pass.dispose?.())
  composer?.dispose()
  composer = null
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
  textures.forEach(texture => texture.dispose())
  environmentRenderTarget?.dispose()
  geometries.clear()
  materials.clear()
  textures.clear()
  prewarmedMaterials.clear()
  environmentTexture = null
  environmentRenderTarget = null
  chromeFlowTexture = null
  if (forceContextLoss) renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  scene = null
  camera = null
  cameraRig = null
  entryRig = null
  cruiseRig = null
  dragRig = null
  logoModel = null
  membraneMesh = null
  causticMesh = null
  membraneMaterial = null
  causticMaterial = null
  spectralMaterial = null
  pulsePass = null
  bloomPass = null
  pieceRigs = []
  materialRigs = null
  keyLight = null
  rimLight = null
  fillLight = null
  bounceLight = null
  isPrewarming = false
  lastRenderTime = 0
  reducedMotionRenderPending = true
}

function handleThemeRefresh() {
  updateThemeMaterials()
  highRefreshUntil = performance.now() + 500
  reducedMotionRenderPending = true
}

function handleLightIntensityChange(value: number) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0))
  if (clamped !== value) {
    lightIntensity.value = clamped
    return
  }
  applyLogoLightIntensity()
  if (!presetPersistenceSuspended) writePersistedState({ lightIntensity: clamped })
  highRefreshUntil = performance.now() + 500
  reducedMotionRenderPending = true
}

/** Logo 尺寸变化后同步画布与后处理目标，避免仅放大 CSS 导致画面变糊。 */
function handleLogoSizeChange(value: number) {
  const clamped = Math.min(MAX_LOGO_SIZE, Math.max(MIN_LOGO_SIZE, Number(value) || DEFAULT_LOGO_SIZE))
  if (clamped !== value) {
    logoSize.value = clamped
    return
  }
  if (!presetPersistenceSuspended) writePersistedState({ logoSize: clamped })
  highRefreshUntil = performance.now() + 500
  reducedMotionRenderPending = true
  void nextTick(updateRendererSize)
}

watch(
  () => [
    vuetifyTheme.global.name.value,
    vuetifyTheme.global.current.value.colors.primary,
    vuetifyTheme.global.current.value.colors.surface,
    vuetifyTheme.global.current.value.colors['on-surface'],
  ],
  handleThemeRefresh,
)

watch(lightIntensity, handleLightIntensityChange)
watch(logoSize, handleLogoSizeChange)

onMounted(async () => {
  initializeSelection()
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  canHoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
  handleReducedMotionChange()
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeRefresh)
  cardElement = rootRef.value?.closest<HTMLElement>('.login-card') || null
  cardElement?.addEventListener('pointermove', handleCardPointerMove, { passive: true })
  cardElement?.addEventListener('pointerleave', handleCardPointerLeave)
  cardElement?.addEventListener('focusin', handleCardFocusIn)
  cardElement?.addEventListener('focusout', handleCardFocusOut)
  if (rootRef.value) {
    resizeObserver = new ResizeObserver(updateRendererSize)
    resizeObserver.observe(rootRef.value)
    intersectionObserver = new IntersectionObserver(handleIntersection, { threshold: 0.05 })
    intersectionObserver.observe(rootRef.value)
  }
  canvasRef.value?.addEventListener('webglcontextlost', handleContextLost)
  canvasRef.value?.addEventListener('webglcontextrestored', handleContextRestored)
  await nextTick()
  firstPaintFrameId = window.requestAnimationFrame(() => {
    firstPaintFrameId = null
    initializeFrameId = window.requestAnimationFrame(() => {
      initializeFrameId = null
      if (rootRef.value) void initializeScene()
    })
  })
})

onBeforeUnmount(() => {
  generation += 1
  if (firstPaintFrameId !== null) window.cancelAnimationFrame(firstPaintFrameId)
  if (initializeFrameId !== null) window.cancelAnimationFrame(initializeFrameId)
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
  reducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeRefresh)
  cardElement?.removeEventListener('pointermove', handleCardPointerMove)
  cardElement?.removeEventListener('pointerleave', handleCardPointerLeave)
  cardElement?.removeEventListener('focusin', handleCardFocusIn)
  cardElement?.removeEventListener('focusout', handleCardFocusOut)
  canvasRef.value?.removeEventListener('webglcontextlost', handleContextLost)
  canvasRef.value?.removeEventListener('webglcontextrestored', handleContextRestored)
  if (idleTaskId !== null) {
    const idleWindow = window as typeof window & { cancelIdleCallback?: (handle: number) => void }
    if (typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(idleTaskId)
    else window.clearTimeout(idleTaskId)
  }
  clearCardVisuals()
  stopAllAudio()
  void audioContext?.close().catch(() => undefined)
  audioContext = null
  audioMaster = null
  audioCompressor = null
  noiseBuffer = null
  destroyScene(true)
})
</script>

<template>
  <div
    ref="rootRef"
    class="optical-logo-lab"
    :style="{ '--optical-logo-size': `${logoSize}px` }"
    :class="[
      `optical-logo-lab--${selectedMaterial}`,
      `optical-logo-lab--${phase}`,
      { 'optical-logo-lab--ready': isReady, 'optical-logo-lab--dragging': isDragging },
    ]"
  >
    <button
      ref="stageRef"
      class="optical-logo-lab__stage"
      type="button"
      :aria-label="isReady ? text.logo : text.staticLogo"
      :disabled="!isReady"
      @click="handleStageClick"
      @keydown="handleStageKeydown"
      @lostpointercapture="handleLostPointerCapture"
      @pointercancel="finishPointerInteraction"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="finishPointerInteraction"
    >
      <canvas ref="canvasRef" class="optical-logo-lab__canvas" aria-hidden="true" />
      <span v-if="selectedMaterial === 'prismatic'" class="optical-logo-lab__prismatic-wrap">
        <span class="optical-logo-lab__prismatic-float">
          <PrismaticLogo
            :key="`${selectedEntrance}-${prismaticReplayKey}`"
            :animate="selectedEntrance !== 'none'"
            :intensity="lightIntensity"
          />
        </span>
      </span>
      <svg
        class="optical-logo-lab__fallback"
        viewBox="0 0 192 192"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="optical-logo-fallback-fill" x1="24" y1="22" x2="168" y2="170" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="rgb(var(--v-theme-on-surface))" stop-opacity="0.74" />
            <stop offset="0.46" stop-color="rgb(var(--v-theme-primary))" />
            <stop offset="1" stop-color="rgb(var(--v-theme-primary))" stop-opacity="0.5" />
          </linearGradient>
          <radialGradient id="optical-logo-fallback-specular" cx="0" cy="0" r="1" gradientTransform="translate(76 58) rotate(50) scale(86 64)" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ffffff" stop-opacity="0.72" />
            <stop offset="0.42" stop-color="#ffffff" stop-opacity="0.16" />
            <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <g class="optical-logo-lab__fallback-body">
          <path v-for="path in STATIC_LOGO_PATHS" :key="path" :d="path" />
        </g>
        <g class="optical-logo-lab__fallback-specular">
          <path v-for="path in STATIC_LOGO_PATHS" :key="`specular-${path}`" :d="path" />
        </g>
      </svg>
      <span class="optical-logo-lab__status" aria-hidden="true" />
    </button>

    <div class="optical-logo-lab__identity">
      <slot />
    </div>

    <div v-if="showLabControls" class="optical-logo-lab__controls">
      <div class="optical-logo-lab__materials" role="radiogroup" :aria-label="text.materialGroup">
        <VTooltip v-for="option in materialOptions" :key="option.value" :text="option.label" location="top">
          <template #activator="{ props: tooltipProps }">
            <button
              v-bind="tooltipProps"
              class="optical-logo-lab__swatch"
              :class="`optical-logo-lab__swatch--${option.value}`"
              type="button"
              role="radio"
              :aria-checked="selectedMaterial === option.value"
              :aria-label="option.label"
              :data-material="option.value"
              :disabled="!isReady"
              :tabindex="selectedMaterial === option.value ? 0 : -1"
              @click="handleMaterialSelection(option.value)"
              @keydown="handleMaterialKeydown($event, option.value)"
            >
              <span aria-hidden="true" />
            </button>
          </template>
        </VTooltip>
      </div>

      <div class="optical-logo-lab__light-control">
        <VIcon icon="mdi-white-balance-sunny" size="16" aria-hidden="true" />
        <VSlider
          id="optical-logo-light-intensity"
          v-model="lightIntensity"
          class="optical-logo-lab__light-slider"
          :aria-label="text.lightIntensity"
          color="primary"
          density="compact"
          :disabled="!isReady"
          hide-details
          :max="100"
          :min="0"
          :step="5"
          thumb-label
          :thumb-size="12"
          track-color="on-surface"
          :track-size="2"
        />
        <output
          class="optical-logo-lab__light-value"
          for="optical-logo-light-intensity"
          :aria-label="text.lightIntensity"
        >
          {{ lightIntensity }}
        </output>
      </div>

      <div class="optical-logo-lab__size-control">
        <VIcon icon="mdi-resize" size="16" aria-hidden="true" />
        <VSlider
          id="optical-logo-size"
          v-model="logoSize"
          class="optical-logo-lab__size-slider"
          :aria-label="text.logoSize"
          color="primary"
          density="compact"
          :disabled="!isReady"
          hide-details
          :max="MAX_LOGO_SIZE"
          :min="MIN_LOGO_SIZE"
          :step="4"
          thumb-label
          :thumb-size="12"
          track-color="on-surface"
          :track-size="2"
        />
        <output
          class="optical-logo-lab__size-value"
          for="optical-logo-size"
          :aria-label="text.logoSize"
        >
          {{ logoSize }}
        </output>
      </div>

      <div class="optical-logo-lab__static-motions" role="radiogroup" :aria-label="text.staticMotionGroup">
        <button
          v-for="mode in STATIC_MOTION_MODES"
          :key="mode"
          class="optical-logo-lab__entrance optical-logo-lab__static-motion"
          type="button"
          role="radio"
          :aria-checked="selectedStaticMotion === mode"
          :data-static-motion="mode"
          :disabled="!isReady"
          :tabindex="selectedStaticMotion === mode ? 0 : -1"
          @click="handleStaticMotionSelection(mode)"
          @keydown="handleStaticMotionKeydown($event, mode)"
        >
          {{ text[mode] }}
        </button>
      </div>

      <div class="optical-logo-lab__command-row">
        <div class="optical-logo-lab__entrances" role="radiogroup" :aria-label="text.entranceGroup">
          <button
            v-for="mode in ENTRANCE_MODES"
            :key="mode"
            class="optical-logo-lab__entrance"
            type="button"
            role="radio"
            :aria-checked="selectedEntrance === mode"
            :data-entrance="mode"
            :disabled="!isReady"
            :tabindex="selectedEntrance === mode ? 0 : -1"
            @click="handleEntranceSelection(mode)"
            @keydown="handleEntranceKeydown($event, mode)"
            @pointerenter="previewEntrance(mode)"
            @pointerleave="clearEntrancePreview"
          >
            {{ text[mode] }}
          </button>
        </div>

        <div class="optical-logo-lab__tools">
          <VTooltip :text="text.resetLab" location="top">
            <template #activator="{ props: tooltipProps }">
              <button
                v-bind="tooltipProps"
                class="optical-logo-lab__tool"
                type="button"
                :aria-label="text.resetLab"
                :disabled="!isReady"
                @click="resetLabPreset"
              >
                <VIcon icon="mdi-restore" size="17" />
              </button>
            </template>
          </VTooltip>

          <VTooltip :text="isPinned ? text.unpin : text.pin" location="top">
            <template #activator="{ props: tooltipProps }">
              <button
                v-bind="tooltipProps"
                class="optical-logo-lab__tool"
                type="button"
                :aria-label="isPinned ? text.unpin : text.pin"
                :aria-pressed="isPinned"
                :disabled="!isReady"
                @click="togglePinned"
              >
                <VIcon :icon="isPinned ? 'mdi-pin' : 'mdi-pin-outline'" size="17" />
              </button>
            </template>
          </VTooltip>

          <VTooltip :text="soundEnabled ? text.mute : text.unmute" location="top">
            <template #activator="{ props: tooltipProps }">
              <button
                v-bind="tooltipProps"
                class="optical-logo-lab__tool"
                type="button"
                :aria-label="soundEnabled ? text.mute : text.unmute"
                :aria-pressed="soundEnabled"
                :disabled="!isReady"
                @click="toggleSound"
              >
                <VIcon :icon="soundEnabled ? 'mdi-volume-high' : 'mdi-volume-off'" size="17" />
              </button>
            </template>
          </VTooltip>

          <VTooltip
            :text="unifiedThemeFamily ? text.useSplitPalette : text.useUnifiedPalette"
            location="top"
          >
            <template #activator="{ props: tooltipProps }">
              <button
                v-bind="tooltipProps"
                class="optical-logo-lab__tool"
                type="button"
                :aria-label="unifiedThemeFamily ? text.useSplitPalette : text.useUnifiedPalette"
                :aria-pressed="unifiedThemeFamily"
                :disabled="!isReady"
                @click="toggleThemeFamily"
              >
                <VIcon :icon="unifiedThemeFamily ? 'mdi-palette' : 'mdi-palette-outline'" size="17" />
              </button>
            </template>
          </VTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.optical-logo-lab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  inline-size: 100%;
  isolation: isolate;
}

.optical-logo-lab__stage {
  position: relative;
  display: grid;
  overflow: visible;
  border: 0;
  appearance: none;
  background: transparent;
  block-size: var(--optical-logo-size, 144px);
  cursor: default;
  inline-size: var(--optical-logo-size, 144px);
  padding: 0;
  place-items: center;
  touch-action: pan-y;
  user-select: none;

  &:focus-visible {
    border-radius: 8px;
    outline: 2px solid rgba(var(--v-theme-primary), 0.84);
    outline-offset: 3px;
  }
}

.optical-logo-lab--ready .optical-logo-lab__stage {
  cursor: grab;
  touch-action: none;
}

.optical-logo-lab--dragging .optical-logo-lab__stage {
  cursor: grabbing;
}

.optical-logo-lab__canvas {
  position: absolute;
  display: block;
  block-size: calc(100% + 48px);
  inline-size: calc(100% + 48px);
  inset: 50% auto auto 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.optical-logo-lab__canvas {
  opacity: 0;
  transition: opacity 280ms ease;
}

.optical-logo-lab--ready .optical-logo-lab__canvas {
  opacity: 1;
}

.optical-logo-lab--prismatic .optical-logo-lab__canvas {
  opacity: 0;
}

.optical-logo-lab__prismatic-wrap {
  position: absolute;
  display: block;
  block-size: var(--optical-logo-size, 144px);
  inline-size: var(--optical-logo-size, 144px);
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
}

/** 静态悬浮与入场、指针倾角分层，避免多组 transform 动画相互覆盖。 */
.optical-logo-lab__prismatic-float {
  display: block;
  block-size: 100%;
  inline-size: 100%;
  animation: optical-logo-prismatic-float 5.7s ease-in-out infinite;
  will-change: transform;
}

@keyframes optical-logo-prismatic-float {
  0%,
  100% {
    transform: translate3d(0, 1.5px, 0);
  }

  50% {
    transform: translate3d(0, -1.5px, 0);
  }
}

.optical-logo-lab__fallback {
  position: absolute;
  display: block;
  block-size: var(--optical-logo-size, 144px);
  filter:
    drop-shadow(0 9px 15px rgba(16, 8, 38, 0.26))
    drop-shadow(0 0 14px rgba(var(--v-theme-primary), 0.2));
  inline-size: var(--optical-logo-size, 144px);
  inset: 50% auto auto 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(1);
  transition:
    opacity 220ms ease,
    transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}

.optical-logo-lab__fallback-body {
  fill: url('#optical-logo-fallback-fill');
}

.optical-logo-lab__fallback-specular {
  fill: url('#optical-logo-fallback-specular');
  mix-blend-mode: screen;
}

.optical-logo-lab--ready .optical-logo-lab__fallback {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.96);
}

.optical-logo-lab--fallback .optical-logo-lab__fallback {
  opacity: 0.92;
  transform: translate(-50%, -50%) scale(1);
}

.optical-logo-lab__status {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.84), rgba(var(--v-theme-primary), 0.36) 38%, transparent 74%);
  block-size: 14px;
  filter: blur(5px);
  inline-size: 14px;
  inset-block-end: 20px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}

.optical-logo-lab--loading .optical-logo-lab__status {
  opacity: 0.42;
}

.optical-logo-lab__identity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  inline-size: 100%;
  margin-block-start: -9px;
}

.optical-logo-lab__controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.055), transparent 48%),
    rgba(var(--v-theme-surface), 0.16);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 24px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.08);
  gap: 7px;
  inline-size: min(100%, 294px);
  margin-block-start: 13px;
  padding: 8px 9px;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;

  &:hover,
  &:focus-within {
    border-color: rgba(var(--v-theme-primary), 0.28);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.075), transparent 48%),
      rgba(var(--v-theme-surface), 0.26);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 10px 28px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.12);
  }
}

.optical-logo-lab__materials,
.optical-logo-lab__command-row,
.optical-logo-lab__tools,
.optical-logo-lab__entrances,
.optical-logo-lab__static-motions {
  display: flex;
  align-items: center;
}

.optical-logo-lab__materials {
  justify-content: center;
  gap: 12px;
}

.optical-logo-lab__light-control,
.optical-logo-lab__size-control {
  display: flex;
  align-items: center;
  block-size: 22px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  gap: 6px;
  inline-size: 100%;
  padding-inline: 2px;
}

.optical-logo-lab__light-slider,
.optical-logo-lab__size-slider {
  flex: 1 1 auto;
  min-inline-size: 0;
}

:deep(.optical-logo-lab__light-slider .v-input__control),
:deep(.optical-logo-lab__size-slider .v-input__control) {
  min-block-size: 22px;
}

:deep(.optical-logo-lab__light-slider .v-slider-track__background),
:deep(.optical-logo-lab__size-slider .v-slider-track__background) {
  opacity: 0.24;
}

.optical-logo-lab__light-value,
.optical-logo-lab__size-value {
  flex: 0 0 24px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: end;
}

.optical-logo-lab__swatch {
  position: relative;
  display: grid;
  flex: none;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 50%;
  background: transparent;
  block-size: 24px;
  box-shadow: 0 3px 8px rgba(var(--app-shadow-rgb, 0, 0, 0), 0.18);
  cursor: pointer;
  inline-size: 24px;
  padding: 0;
  place-items: center;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);

  > span {
    border-radius: inherit;
    block-size: 18px;
    inline-size: 18px;
  }

  &[aria-checked='true'] {
    border-color: rgba(var(--v-theme-primary), 0.9);
    box-shadow:
      0 0 0 2px rgba(var(--v-theme-primary), 0.18),
      0 4px 12px rgba(var(--v-theme-primary), 0.24);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid rgba(var(--v-theme-primary), 0.78);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.58;
  }
}

.optical-logo-lab__swatch--crystal > span {
  background:
    radial-gradient(circle at 30% 25%, white, transparent 28%),
    conic-gradient(
      from 210deg,
      rgba(var(--v-theme-primary), 0.52),
      rgba(var(--v-theme-on-surface), 0.9),
      rgb(var(--v-theme-primary)),
      rgba(var(--v-theme-primary), 0.34),
      rgba(var(--v-theme-primary), 0.52)
    );
  filter: saturate(1.05);
}

.optical-logo-lab__swatch--chrome > span {
  background: linear-gradient(135deg, #424956, #f8fbff 34%, #7e8796 52%, rgba(var(--v-theme-primary), 0.48) 72%, #373d47);
}

.optical-logo-lab__swatch--energy > span {
  background:
    radial-gradient(
      circle,
      rgb(var(--v-theme-on-surface)) 0 8%,
      rgb(var(--v-theme-primary)) 28%,
      rgba(var(--v-theme-primary), 0.54) 54%,
      rgba(var(--v-theme-surface), 0.96) 76%
    );
  box-shadow: inset 0 0 7px rgba(255, 255, 255, 0.58);
}

.optical-logo-lab__swatch--ceramic > span {
  background:
    radial-gradient(circle at 30% 22%, rgba(255, 255, 255, 0.38), transparent 28%),
    linear-gradient(135deg, rgb(var(--v-theme-primary)), rgba(var(--v-theme-primary), 0.66));
  box-shadow: inset 0 0 5px rgba(255, 255, 255, 0.16);
  filter: brightness(0.72) saturate(0.9);
}

.optical-logo-lab__swatch--matte > span {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.28), transparent 34%),
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.92), rgba(var(--v-theme-primary), 0.48));
  box-shadow: inset 0 0 0 1px rgba(var(--v-theme-on-surface), 0.1);
  filter: brightness(0.82) saturate(0.88);
}

.optical-logo-lab__swatch--prismatic > span {
  background:
    radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.96), transparent 27%),
    conic-gradient(
      from 215deg,
      rgba(var(--v-theme-primary), 0.86),
      #77d4ff,
      #b18bff,
      #ff69d2,
      rgba(var(--v-theme-primary), 0.86)
    );
  filter: saturate(1.12);
}

.optical-logo-lab__command-row {
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  inline-size: 100%;
}

.optical-logo-lab__static-motions {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), 0.24);
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.18);
  padding: 2px;
}

.optical-logo-lab__static-motion {
  inline-size: 104px;
}

.optical-logo-lab__entrances {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), 0.24);
  border-radius: 6px;
  background: rgba(var(--v-theme-surface), 0.18);
  padding: 2px;
}

.optical-logo-lab__entrance {
  border: 0;
  border-radius: 4px;
  background: transparent;
  block-size: 28px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  inline-size: 70px;
  letter-spacing: 0;
  padding: 0 4px;
  transition:
    background 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;

  &[aria-checked='true'] {
    background: rgba(var(--v-theme-primary), 0.16);
    box-shadow: inset 0 0 0 1px rgba(var(--v-theme-primary), 0.22);
    color: rgb(var(--v-theme-on-surface));
  }

  &:focus-visible {
    outline: 2px solid rgba(var(--v-theme-primary), 0.72);
    outline-offset: -1px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.58;
  }
}

.optical-logo-lab__tools {
  gap: 4px;
}

.optical-logo-lab__tool {
  display: inline-grid;
  flex: none;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  block-size: 30px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  cursor: pointer;
  inline-size: 30px;
  padding: 0;
  place-items: center;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;

  &:hover,
  &:focus-visible,
  &[aria-pressed='true'] {
    border-color: rgba(var(--v-theme-primary), 0.18);
    background: rgba(var(--v-theme-primary), 0.1);
    color: rgb(var(--v-theme-primary));
    outline: none;
  }

  &:focus-visible {
    outline: 2px solid rgba(var(--v-theme-primary), 0.78);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
}

@media (width <= 480px) {
  .optical-logo-lab__controls {
    inline-size: min(100%, 278px);
  }

  .optical-logo-lab__entrance {
    inline-size: 64px;
    font-size: 0.7rem;
    padding-inline: 3px;
  }
}

@media (width <= 360px) {
  .optical-logo-lab__static-motion {
    inline-size: 96px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .optical-logo-lab__canvas,
  .optical-logo-lab__controls,
  .optical-logo-lab__swatch,
  .optical-logo-lab__entrance,
  .optical-logo-lab__tool {
    transition: none !important;
  }

  .optical-logo-lab__prismatic-float {
    animation: none !important;
    transform: none !important;
  }
}
</style>
