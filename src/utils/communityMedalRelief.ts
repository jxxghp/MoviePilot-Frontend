import * as THREE from 'three'
import { medalSpin, medalSpinMode, spinAngleAt, type MedalArt, type MedalShape } from '@/utils/communityMedalArt'
import type { MedalEngraving } from '@/utils/communityMedals'
import { engravingLayer, loadMedalImage, planEngraving } from '@/utils/communityMedalEngrave'

/**
 * 精绘勋章的实时渲染（2.8D），打开勋章墙时才动态加载。底子是渲染图本身，渲染图自带的光影为主，
 * 只补三样渲染图给不了的东西，而且都克制，适合写实的金工首饰：
 * - 视差：按与渲染图逐像素对齐的高度图做轻微的视差遮挡映射，转动时唇边与徽记略有错位，珐琅面不游动。
 * - 光泽：由高度图算法线，按一个柔光棚算一层很淡的反射，只叠在金属上（高于珐琅与铭牌的部分），
 *   随角度缓慢移动；珐琅、宝石与铭牌不加反光。
 * - 厚度：正反面各是一张整幅平面，剪影由渲染图透明度决定；侧壁沿外轮廓略向内收挤出，
 *   颜色取唇边的实际金属色，翻面是真的翻过去。
 * 背面刻字是单独一层，按屏幕分辨率直接画，与铭牌同深度，跟着视差一起动。
 * 贴图按显示尺寸生成，最高 3 倍像素比；按外形包围框取景并留出偏转余量，宽扁的勋章也不会被裁切。
 * 正面轮廓带 spin 时（如主创的星盘外环），半径以外的外圈在着色器里绕圆心顺时针走格（缺省）或匀速转动；
 * 光泽按固定的世界光源由转过的高度场算出，不跟着外圈走；
 * 减少动态效果、页面隐藏或画布不在视口时停住，保存图片取回正的静止画面。
 */

/** 渲染图在场景里的边长 */
const WIDTH = 2.4
/** 勋章本体的厚度 */
const THICKNESS = 0.11
/** 视差深度，以贴图坐标计 */
const DEPTH = 0.012

export interface ReliefSpec {
  art: MedalArt & { heights: NonNullable<MedalArt['heights']>; shapes: NonNullable<MedalArt['shapes']> }
  engraving: MedalEngraving
  /** 系统要求减少动态效果时：不入场、不摆动、翻面直接到位 */
  reducedMotion: boolean
}

const CapShader = {
  // 切线空间：u 沿物体 x（背面反向，背面图本来就是左右镜像的），v 沿物体 -y，法线沿 ±z。
  vertexShader: /* glsl */ `
    uniform float uWidth;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vNormal;
    void main() {
      // 正反面各是一张整幅平面，背面平面绕竖轴转了半圈，本地坐标正好对上左右镜像的背面图。
      float facing = 1.0;
      vUv = vec2(position.x / uWidth + 0.5, 0.5 - position.y / uWidth);
      mat3 basis = mat3(modelMatrix);
      vTangent = normalize(basis * vec3(facing, 0.0, 0.0));
      vBitangent = normalize(basis * vec3(0.0, -1.0, 0.0));
      vNormal = normalize(basis * vec3(0.0, 0.0, facing));
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uImage;
    uniform sampler2D uHeight;
    uniform float uDepth;
    uniform vec3 uAccent;
    // 外圈转动：圆心、半径（贴图坐标，半径为 0 时不转）与当前角度。
    uniform vec2 uSpinCenter;
    uniform float uSpinRadius;
    uniform float uSpinAngle;
    // 分界处的羽化宽度（贴图坐标，约 1.5 个贴图像素），内外两侧在这一窄带里渐变混合，看不出硬边。
    uniform float uSpinFeather;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vTangent;
    varying vec3 vBitangent;
    varying vec3 vNormal;

    // 循环里提前跳出时取样导数没有定义，选错 mip 会拉出横纹，所以一律用顶点坐标的导数取样。
    vec2 gx;
    vec2 gy;
    // 半径以外的取样点绕圆心反向转，画面上外圈就顺时针转了 uSpinAngle（贴图 y 向下，正角即顺时针）。
    // 颜色与高度都按同一坐标取样，法线由转过的高度场求出，光泽随之一致。
    vec2 rotated(vec2 uv) {
      vec2 d = uv - uSpinCenter;
      float c = cos(-uSpinAngle);
      float s = sin(-uSpinAngle);
      return uSpinCenter + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
    }
    // 外圈的混合比例：分界圆内为 0（静止），圆外为 1（随外圈转动），分界处羽化。
    float spinMix(vec2 uv) {
      if (uSpinRadius <= 0.0) return 0.0;
      float d = length(uv - uSpinCenter);
      return smoothstep(uSpinRadius - uSpinFeather, uSpinRadius + uSpinFeather, d);
    }
    float heightAt(vec2 uv) {
      float m = spinMix(uv);
      float still = textureGrad(uHeight, uv, gx, gy).r;
      if (m <= 0.0) return still;
      return mix(still, textureGrad(uHeight, rotated(uv), gx, gy).r, m);
    }
    vec4 imageAt(vec2 uv) {
      float m = spinMix(uv);
      vec4 still = textureGrad(uImage, uv, gx, gy);
      if (m <= 0.0) return still;
      return mix(still, textureGrad(uImage, rotated(uv), gx, gy), m);
    }

    // 柔光棚：顶上一大片柔光、左右两条宽而软的竖灯，只用来给金属一层随角度移动的柔和光泽。
    vec3 studio(vec3 r) {
      vec3 light = vec3(0.0);
      light += vec3(1.0) * smoothstep(0.2, 0.95, r.y) * 0.8;
      light += uAccent * exp(-pow((r.x + 0.6) / 0.35, 2.0)) * smoothstep(-0.6, 0.3, r.z) * 0.6;
      light += vec3(1.0) * exp(-pow((r.x - 0.6) / 0.3, 2.0)) * smoothstep(-0.6, 0.3, r.z) * 0.45;
      return light;
    }

    void main() {
      vec3 v = normalize(cameraPosition - vWorld);
      vec3 viewTs = vec3(dot(v, vTangent), dot(v, vBitangent), max(dot(v, vNormal), 0.08));
      // 视差遮挡映射：沿视线逐层下探，碰到高度图后在最后一层里二分找准交点，避免陡坡台阶。
      const float LAYERS = 48.0;
      float layer = 1.0 / LAYERS;
      vec2 shift = viewTs.xy / viewTs.z * uDepth / LAYERS;
      gx = dFdx(vUv);
      gy = dFdy(vUv);
      vec2 at = vUv;
      float depth = 0.0;
      for (int i = 0; i < 48; i++) {
        if (depth >= 1.0 - heightAt(at)) break;
        at -= shift;
        depth += layer;
      }
      vec2 delta = shift;
      float stepDepth = layer;
      for (int i = 0; i < 6; i++) {
        delta *= 0.5;
        stepDepth *= 0.5;
        if (depth >= 1.0 - heightAt(at)) {
          at += delta;
          depth -= stepDepth;
        } else {
          at -= delta;
          depth += stepDepth;
        }
      }

      // 贴图按预乘透明度上传，过滤时透明处的黑底不会混进边缘；取样后再还原成直通颜色。
      vec4 sampled = imageAt(at);
      // 透明度阈值略偏高，剪影向内收约一个像素，去掉抠图边缘残留的暗边。
      float alpha = smoothstep(0.45, 0.85, sampled.a);
      if (alpha <= 0.0) discard;
      vec3 base = sampled.rgb / max(sampled.a, 1e-4);

      float e = 3.0 / 1200.0;
      float dx = heightAt(at + vec2(e, 0.0)) - heightAt(at - vec2(e, 0.0));
      float dy = heightAt(at + vec2(0.0, e)) - heightAt(at - vec2(0.0, e));
      vec3 nTs = normalize(vec3(-dx * 2.5, -dy * 2.5, 1.0));
      vec3 n = normalize(vTangent * nTs.x + vBitangent * nTs.y + vNormal * nTs.z);
      vec3 r = reflect(-v, n);

      // 渲染图自带的光影为主，只在金属上叠一层很淡、随角度移动的光泽；珐琅与铭牌（高度 0.18）
      // 不加任何反光，否则会显得像金属。
      float h = heightAt(at);
      float metal = smoothstep(0.26, 0.45, h);
      float fresnel = 0.2 + 0.8 * pow(1.0 - max(dot(n, v), 0.0), 3.0);
      vec3 tint = mix(vec3(1.0), base * 1.6, 0.7);
      vec3 sheen = studio(r) * tint * fresnel;
      float shade = 0.93 + 0.12 * dot(n, normalize(vec3(-0.4, 0.6, 0.7)));
      vec3 rgb = base * mix(1.0, shade, metal * 0.5) + sheen * metal * 0.16;
      gl_FragColor = vec4(rgb, alpha);
      #include <colorspace_fragment>
    }
  `,
}

const GemShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    varying mat3 vBasis;
    void main() {
      vUv = uv;
      vBasis = mat3(normalize(mat3(modelMatrix)[0]), normalize(mat3(modelMatrix)[1]), normalize(mat3(modelMatrix)[2]));
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uImage;
    uniform vec3 uGem;
    uniform vec3 uAccent;
    varying vec2 vUv;
    varying vec3 vWorld;
    varying mat3 vBasis;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float d = dot(p, p);
      if (d > 1.0) discard;
      vec2 uv = uGem.xy + p * vec2(1.0, -1.0) * uGem.z;
      vec4 color = texture2D(uImage, uv);
      // 宝石当作半球算一道会动的高光。
      vec3 n = normalize(vBasis * vec3(p.x, p.y, sqrt(1.0 - d)));
      vec3 v = normalize(cameraPosition - vWorld);
      vec3 r = reflect(-v, n);
      float spark = pow(max(dot(r, normalize(vec3(-0.3, 0.7, 0.6))), 0.0), 60.0);
      float rim = smoothstep(0.75, 1.0, d);
      vec3 rgb = color.rgb + vec3(spark) * 0.9 + uAccent * rim * 0.25;
      gl_FragColor = vec4(rgb, smoothstep(1.0, 0.94, d));
      #include <colorspace_fragment>
    }
  `,
}

type Outline = THREE.Vector2[]

/** 按闭合样条重采样成 480 个等距点，再与相邻点平均几轮，得到平滑的外轮廓。 */
function resample(points: Outline): Outline {
  const curve = new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(p.x, p.y, 0)),
    true,
    'centripetal',
  )
  let current = curve
    .getSpacedPoints(480)
    .slice(0, -1)
    .map(p => new THREE.Vector2(p.x, p.y))
  for (let round = 0; round < 4; round++) {
    current = current.map((p, i) => {
      const prev = current[(i - 1 + current.length) % current.length]
      const next = current[(i + 1) % current.length]
      return new THREE.Vector2((prev.x + p.x * 2 + next.x) / 4, (prev.y + p.y * 2 + next.y) / 4)
    })
  }
  return current
}

function signedArea(pts: Outline): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    area += p.x * q.y - q.x * p.y
  }
  return area / 2
}

// 收边后在急弯处会自交成小环，环里的点删掉，在交点处接上。
function untangle(pts: Outline): Outline {
  const cross = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, d: THREE.Vector2): THREE.Vector2 | null => {
    const r = b.clone().sub(a)
    const q = d.clone().sub(c)
    const den = r.x * q.y - r.y * q.x
    if (Math.abs(den) < 1e-12) return null
    const t = ((c.x - a.x) * q.y - (c.y - a.y) * q.x) / den
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den
    return t > 0 && t < 1 && u > 0 && u < 1 ? a.clone().add(r.multiplyScalar(t)) : null
  }
  let current = pts
  for (let guard = 0; guard < 64; guard++) {
    const n = current.length
    let found = false
    for (let i = 0; i < n && !found; i++) {
      // 只找短距离内的小环，避免把大半个轮廓当成环删掉。
      for (let k = 2; k < Math.min(n - 1, n / 2); k++) {
        const j = (i + k) % n
        const hit = cross(current[i], current[(i + 1) % n], current[j], current[(j + 1) % n])
        if (!hit) continue
        const kept: Outline = []
        for (let m = 0; m < n; m++) {
          const offset = (m - i - 1 + n) % n
          if (offset < k) continue
          kept.push(current[m])
        }
        kept.splice(kept.indexOf(current[i]) + 1, 0, hit)
        current = kept
        found = true
        break
      }
    }
    if (!found) break
  }
  return current
}

// 沿各点法线向内收 d，得到与外形等距的表盘边。外形平滑、凹处半径大于 d 时成立。
function inset(pts: Outline, d: number): Outline {
  const sign = signedArea(pts) > 0 ? 1 : -1
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const next = pts[(i + 1) % pts.length]
    const t = next.clone().sub(prev).normalize()
    return p.clone().add(new THREE.Vector2(-t.y, t.x).multiplyScalar(d * sign))
  })
}

// 挤出体默认是硬边法线，转到侧面时铬边一格一格反光。同一位置上朝向相近（60° 以内）的面按面积加权平均，
// 倒角连成一片；朝向差得多的面不参与，免得正反相抵出零法线，泛光会把 NaN 扩散成一整片黑。
function smooth(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const key = (i: number) =>
    `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`
  const faces: THREE.Vector3[] = []
  const around = new Map<string, number[]>()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  for (let t = 0; t < position.count; t += 3) {
    a.fromBufferAttribute(position, t)
    b.fromBufferAttribute(position, t + 1)
    c.fromBufferAttribute(position, t + 2)
    faces.push(c.clone().sub(b).cross(a.clone().sub(b)))
    for (let k = 0; k < 3; k++) {
      const id = key(t + k)
      const list = around.get(id)
      if (list) list.push(t / 3)
      else around.set(id, [t / 3])
    }
  }
  // 封口三角化会出很细的长条三角形，叉乘朝向不可靠，先取面积加权平均作参照，再只平均与参照相近的面。
  const units = faces.map(f => (f.lengthSq() > 1e-20 ? f.clone().normalize() : null))
  const normals = new Float32Array(position.count * 3)
  const reference = new THREE.Vector3()
  const sum = new THREE.Vector3()
  const cache = new Map<string, THREE.Vector3>()
  for (let i = 0; i < position.count; i++) {
    const id = key(i)
    let normal = cache.get(id)
    if (!normal) {
      const list = around.get(id)!
      reference.set(0, 0, 0)
      for (const f of list) reference.add(faces[f])
      sum.set(0, 0, 0)
      if (reference.lengthSq() > 1e-20) {
        reference.normalize()
        for (const f of list) if (units[f] && units[f].dot(reference) > 0.5) sum.add(faces[f])
      }
      normal =
        sum.lengthSq() > 1e-20
          ? sum.clone().normalize()
          : reference.lengthSq() > 0.5
            ? reference.clone()
            : new THREE.Vector3(0, 0, 1)
      cache.set(id, normal)
    }
    normals.set([normal.x, normal.y, normal.z], i * 3)
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geometry
}

/**
 * 渲染图唇边的金属色：沿外轮廓向内一小段取正反两面的像素平均。写实美术的金、玫瑰金、银各不相同，
 * 侧壁按图取色才接得上，目录里的金属色只用于没有美术的程序化模型。
 */
function edgeMetal(images: HTMLImageElement[], shapes: MedalShape[]): THREE.Color | undefined {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  const sum = [0, 0, 0]
  let count = 0
  images.forEach((image, index) => {
    const outline = shapes[index].outline
    if (!outline.length) return
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(image, 0, 0, size, size)
    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(0, 0, size, size).data
    } catch {
      return
    }
    const cx = outline.reduce((total, [x]) => total + x, 0) / outline.length
    const cy = outline.reduce((total, [, y]) => total + y, 0) / outline.length
    for (const [x, y] of outline) {
      for (const inward of [0.03, 0.05]) {
        const px = Math.round((x + (cx - x) * inward) * (size - 1))
        const py = Math.round((y + (cy - y) * inward) * (size - 1))
        const i = (py * size + px) * 4
        if (data[i + 3] < 200) continue
        sum[0] += data[i]
        sum[1] += data[i + 1]
        sum[2] += data[i + 2]
        count++
      }
    }
  })
  if (!count) return undefined
  return new THREE.Color().setRGB(
    sum[0] / count / 255,
    sum[1] / count / 255,
    sum[2] / count / 255,
    THREE.SRGBColorSpace,
  )
}

/**
 * 把渲染图缩到显示所需的像素边长再上传，不再用 1200 的原图配多级纹理：缩小由浏览器高质量重采样一次完成，
 * 显示时贴图与屏幕像素接近一比一，线性过滤即可，画面不会在两级纹理之间发虚。
 */
function displaySized(image: HTMLImageElement, size: number): HTMLImageElement | HTMLCanvasElement {
  if (size >= image.naturalWidth) return image
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, size, size)
  return canvas
}

function texture(source: HTMLImageElement | HTMLCanvasElement, color: boolean): THREE.Texture {
  const result = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source)
  result.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  // 贴图坐标与图片一致，v 向下，与高度图、外轮廓同一套坐标。
  result.flipY = false
  // 颜色贴图预乘透明度，边缘过滤不带出黑边；着色器里再还原。
  result.premultiplyAlpha = color
  // 贴图已是显示尺寸，不生成多级纹理。
  result.generateMipmaps = false
  result.minFilter = THREE.LinearFilter
  result.magFilter = THREE.LinearFilter
  result.anisotropy = 4
  result.needsUpdate = true
  return result
}

function toObject(u: number, v: number): THREE.Vector2 {
  return new THREE.Vector2((u - 0.5) * WIDTH, (0.5 - v) * WIDTH)
}

/** 相机竖直视角 */
const FOV = 28
/** 画面四周留白 */
const MARGIN = 1.08
/** 拖动加摆动时最大的偏转角，取景时按这个角度留出近侧边缘放大的余量 */
const MAX_TILT = 0.75

/**
 * 按外形包围框取景：先求包围框半边长，再找一个相机距离，使勋章正对与偏到最大角度时都留出约 8% 的边。
 * 偏转时近侧边缘离相机更近会被放大，所以宽而扁的勋章（如启幕）需要更远的相机。
 */
function frameDistance(halfExtent: number): number {
  const tan = Math.tan(((FOV / 2) * Math.PI) / 180)
  const projected = (distance: number, tilt: number) =>
    (halfExtent * Math.cos(tilt)) / (distance - halfExtent * Math.sin(tilt)) / tan
  let distance = (halfExtent * MARGIN) / tan
  for (let guard = 0; guard < 60 && projected(distance, MAX_TILT) * MARGIN > 1; guard++) distance *= 1.02
  return Math.max(distance, (halfExtent * MARGIN) / tan + THICKNESS)
}

/** 一枚勋章在场景里的内容：网格、材质与贴图；切走后留在缓存里，超出缓存时释放。 */
interface MedalContent {
  holder: THREE.Group
  frontPlane: THREE.Mesh
  spin: ReturnType<typeof medalSpin>
  /** 这枚勋章的相机距离 */
  distance: number
  /** 贴图按这个设备像素边长生成，显示尺寸明显变大时重建 */
  pixels: number
  /** 外形包围框在画面里的上下边（正对时，按画布高度的比例） */
  bounds: { top: number; bottom: number }
}

/** 缓存键：换勋章、换档位、换刻字都算不同内容。 */
function contentKey(spec: ReliefSpec): string {
  return [spec.art.key, spec.art.tier ?? '', spec.art.front, JSON.stringify(spec.engraving)].join('|')
}

/** 加载一枚勋章的资源并搭好它的内容；资源加载失败时抛错。 */
async function buildMedal(spec: ReliefSpec, canvasPixels: number, pixelRatio: number): Promise<MedalContent> {
  const { art } = spec
  const [frontImage, backImage, frontHeight, backHeight, shapes] = await Promise.all([
    loadMedalImage(art.front),
    loadMedalImage(art.back),
    loadMedalImage(art.heights.front),
    loadMedalImage(art.heights.back),
    art.shapes(),
  ])

  // 光泽与侧壁都取渲染图唇边的实际金属色，金、玫瑰金、银各自接得上；取不到时用目录主色。
  const accent = edgeMetal([frontImage, backImage], [shapes.front, shapes.back]) ?? new THREE.Color(art.tone)

  const holder = new THREE.Group()
  const outline = shapes.front.outline.map(([u, v]) => toObject(u, v))
  const box = new THREE.Box2().setFromPoints(outline)
  const frontGem = shapes.front.gem
  if (frontGem) {
    const at = toObject(frontGem.x, frontGem.y)
    const r = frontGem.r * WIDTH
    box.expandByPoint(at.clone().addScalar(r)).expandByPoint(at.clone().subScalar(r))
  }
  const center = box.getCenter(new THREE.Vector2())
  const size = box.getSize(new THREE.Vector2())
  const distance = frameDistance(Math.max(size.x, size.y) / 2)
  // 整张图在屏幕上占的设备像素边长，贴图与刻字都按它生成。
  const visible = 2 * distance * Math.tan(((FOV / 2) * Math.PI) / 180)
  const pixels = Math.min(frontImage.naturalWidth, Math.ceil((WIDTH / visible) * canvasPixels))

  // 正反面各是一张整幅平面，剪影完全由渲染图的透明度决定（边缘用 alpha-to-coverage 抗锯齿）；
  // 侧壁沿外轮廓向内收一点挤出，正对时藏在剪影后面，不会在边缘冒出一圈别色的壁。
  // 侧壁的盖面比两张平面略薄，被平面盖住，透明处也不会看穿到勋章内部。
  // 侧壁轮廓先按样条重采样并磨圆，再向内收：原轮廓是折线，直接挤出时宽扁勋章侧转会看到一条条棱。
  const wallOutline = untangle(inset(resample(outline), WIDTH * 0.012))
  const body = new THREE.ExtrudeGeometry(new THREE.Shape(wallOutline), {
    bevelEnabled: false,
    curveSegments: 4,
    depth: THICKNESS - 0.006,
  })
  body.translate(0, 0, -(THICKNESS - 0.006) / 2)
  smooth(body)
  const spin = medalSpin(shapes.front)
  const cap = (image: THREE.Texture, height: THREE.Texture, spinning = false) =>
    new THREE.ShaderMaterial({
      alphaToCoverage: true,
      fragmentShader: CapShader.fragmentShader,
      uniforms: {
        uAccent: { value: accent },
        uDepth: { value: DEPTH },
        uHeight: { value: height },
        uImage: { value: image },
        uSpinAngle: { value: 0 },
        uSpinCenter: { value: new THREE.Vector2(spin?.x ?? 0.5, spin?.y ?? 0.5) },
        uSpinRadius: { value: spinning && spin ? spin.r : 0 },
        uSpinFeather: { value: 1.5 / pixels },
        uWidth: { value: WIDTH },
      },
      vertexShader: CapShader.vertexShader,
    })
  const frontImageTexture = texture(displaySized(frontImage, pixels), true)
  const backImageTexture = texture(displaySized(backImage, pixels), true)
  // 侧壁是与唇边同色的金属，略暗、偏粗糙，读起来是柔和的厚度而不是一圈亮边。
  const wall = new THREE.MeshPhysicalMaterial({
    color: accent.clone().multiplyScalar(0.85),
    envMapIntensity: 0.9,
    metalness: 1,
    roughness: 0.45,
  })
  holder.add(new THREE.Mesh(body, wall))
  const frontPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, WIDTH),
    cap(frontImageTexture, texture(displaySized(frontHeight, pixels), false), true),
  )
  frontPlane.position.z = THICKNESS / 2
  const backPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, WIDTH),
    cap(backImageTexture, texture(displaySized(backHeight, pixels), false)),
  )
  backPlane.rotation.y = Math.PI
  backPlane.position.z = -THICKNESS / 2
  holder.add(frontPlane, backPlane)

  // 背面刻字是单独一层，按屏幕分辨率画，不经过贴图缩放。铭牌在高度图里是表盘高度（0.18），
  // 视差让它看起来凹进背板 (1 - 0.18) × 视差深度；刻字层放在同样的深度，转动时与铭牌一起错开。
  // 这一层在背板之后，不做深度测试、最后画，并只朝背面，正面朝前时被剔除。
  const plan = planEngraving(backImage, art, shapes.back)
  const engravingTexture = texture(engravingLayer(pixels, plan, spec.engraving, pixelRatio), true)
  // 这一层用平面自带的贴图坐标（v 向上），画布要按常规方向上传，与上面按图片坐标采样的两面不同。
  engravingTexture.flipY = true
  const engraving = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, WIDTH),
    new THREE.MeshBasicMaterial({
      depthTest: false,
      map: engravingTexture,
      premultipliedAlpha: true,
      toneMapped: false,
      transparent: true,
    }),
  )
  engraving.rotation.y = Math.PI
  engraving.position.z = -THICKNESS / 2 + (1 - 0.18) * DEPTH * WIDTH
  engraving.renderOrder = 10
  holder.add(engraving)

  // 宝石：正反各一片圆，浮在本体前后，取各自那一面图里的宝石（镶嵌的宝石没有单独的圆）。
  const gem = (shape: MedalShape, image: THREE.Texture, side: number) => {
    const circle = shape.gem
    if (!circle) return
    const radius = circle.r * WIDTH * 1.04
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.ShaderMaterial({
        fragmentShader: GemShader.fragmentShader,
        transparent: true,
        uniforms: {
          uAccent: { value: accent },
          uGem: { value: new THREE.Vector3(circle.x, circle.y, circle.r * 1.04) },
          uImage: { value: image },
        },
        vertexShader: GemShader.vertexShader,
      }),
    )
    const at = toObject(side > 0 ? circle.x : 1 - circle.x, circle.y)
    mesh.position.set(at.x, at.y, side * (THICKNESS / 2 + radius * 0.9))
    if (side < 0) mesh.rotation.y = Math.PI
    holder.add(mesh)
  }
  gem(shapes.front, frontImageTexture, 1)
  gem(shapes.back, backImageTexture, -1)

  holder.position.set(-center.x, -center.y, 0)
  const halfHeight = size.y / 2 / (distance * Math.tan(((FOV / 2) * Math.PI) / 180)) / 2
  return { holder, frontPlane, spin, distance, pixels, bounds: { top: 0.5 - halfHeight, bottom: 0.5 + halfHeight } }
}

/** 释放一枚勋章的网格、材质与贴图。 */
function disposeMedal(content: MedalContent) {
  const textures = new Set<THREE.Texture>()
  content.holder.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    node.geometry.dispose()
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      if (m instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(m.uniforms))
          if (uniform.value instanceof THREE.Texture) textures.add(uniform.value)
      }
      if (m instanceof THREE.MeshBasicMaterial && m.map) textures.add(m.map)
      m.dispose()
    }
  })
  textures.forEach(item => item.dispose())
}

/** 勋章墙整个打开期间共用的精绘渲染器。 */
export interface ReliefRenderer {
  /** 换上一枚勋章：用缓存或现搭内容替换当前勋章，姿态回到正面 */
  show: (spec: ReliefSpec) => Promise<void>
  /** 后台把这些勋章（通常是当前的前后各一枚）先搭好放进缓存，切换时不再等待 */
  prepare: (specs: ReliefSpec[]) => void
  /** 按正面朝前的姿态渲染一张透明 PNG（data URL），用于保存图片；还没有勋章时为空 */
  snapshot: () => string | null
  /** 当前勋章正对时在画布里的上下边（按画布高度的比例），用于让下方文字按勋章实际外形对齐 */
  bounds: () => { top: number; bottom: number } | null
  /** 释放全部资源并主动交还 WebGL 上下文 */
  dispose: () => void
}

/** 缓存的勋章数：当前一枚加前后各一枚 */
const CACHE_SIZE = 3

/**
 * 创建精绘渲染器。勋章墙打开期间只建这一个 WebGL 上下文，共用一份环境光，切换勋章只换场景内容；
 * 每次新建上下文会累积，浏览器超过上限后会丢掉最早的上下文，包括玻璃主题自己的渲染器。
 * 浏览器不支持 WebGL 时抛错，调用方退回倾斜卡片。
 */
export function createReliefRenderer(canvas: HTMLCanvasElement): ReliefRenderer {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: 'high-performance',
  })
  // 高分屏按设备像素比渲染，最高 3 倍，手机上的勋章与刻字都清楚。
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 3)
  renderer.setPixelRatio(pixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping

  const scene = new THREE.Scene()
  // 所有勋章共用一份中性的柔光棚环境；各枚金属的颜色由侧壁材质与光泽着色器里的取色决定。
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = studio(new THREE.Color(0xd8d2c4))
  // 模糊半径超过约 0.04 时 PMREM 采样数会超出上限并逐级告警，这里取不告警的最大柔和度。
  const environment = pmrem.fromScene(room, 0.035)
  room.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose()
      ;(node.material as THREE.Material).dispose()
    }
  })
  pmrem.dispose()
  scene.environment = environment.texture

  // rig 管姿态，当前勋章挂在它下面。
  const rig = new THREE.Group()
  scene.add(rig)
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(-3, 4, 5)
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x101114, 0.4))
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50)
  camera.position.set(0, 0, 5)

  let current: MedalContent | null = null
  const cache = new Map<string, MedalContent>()
  const building = new Map<string, Promise<MedalContent>>()
  let request = 0
  let disposed = false

  let width = 0
  const resize = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (!w || !h || w === width) return
    width = w
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const render = () => renderer.render(scene, camera)
  const canvasPixels = () => Math.max(1, (canvas.clientWidth || 300) * pixelRatio)

  /** 取缓存或现搭；同一枚正在搭时复用那次。显示尺寸比搭建时大出 15% 以上就重建，保证清晰。 */
  const obtain = (spec: ReliefSpec): Promise<MedalContent> => {
    const keyOf = contentKey(spec)
    const cached = cache.get(keyOf)
    if (cached && cached.pixels >= Math.min(1200, canvasPixels() * 0.85)) {
      cache.delete(keyOf)
      cache.set(keyOf, cached)
      return Promise.resolve(cached)
    }
    const pending = building.get(keyOf)
    if (pending) return pending
    const promise = buildMedal(spec, canvasPixels(), pixelRatio).then(content => {
      building.delete(keyOf)
      if (disposed) {
        disposeMedal(content)
        return content
      }
      const stale = cache.get(keyOf)
      if (stale && stale !== current) disposeMedal(stale)
      cache.delete(keyOf)
      cache.set(keyOf, content)
      // 超出缓存的最早一枚释放；正在显示的那枚不动。
      for (const [oldKey, old] of cache) {
        if (cache.size <= CACHE_SIZE) break
        if (old === current) continue
        cache.delete(oldKey)
        disposeMedal(old)
      }
      return content
    })
    promise.catch(() => building.delete(keyOf))
    building.set(keyOf, promise)
    return promise
  }

  // 姿态：底子是正对机位的渲染图，侧得太多就看得出是贴图加侧壁，所以只在正反面附近转动。
  // 拖动越往外越拖不动，最多约 35°（上下约 23°），松手弹回；翻面只靠点击。每换一枚勋章从一侧转入并放大，
  // 之后缓慢摆动。减少动态效果时跳过入场与摆动，翻面直接到位。
  const YAW_LIMIT = 0.6
  const PITCH_LIMIT = 0.4
  const soft = (raw: number, limit: number) => limit * Math.tanh(raw / limit)
  let still = false
  let start = performance.now()
  let face = 0
  let faceAngle = 0
  let dragYaw = 0
  let dragPitch = 0
  let dragging = false
  let moved = 0
  let lastX = 0
  let lastY = 0
  let lastInput = start
  let idle = 0
  let frame = 0
  let prev = start
  let spinAngle = 0
  // 外圈累计转动的时间：只在看得见时累加，停下后从停下的位置接着走。
  let spinTime = 0
  let spinMode: 'continuous' | 'tick' = 'tick'
  let visible = true
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(entries => {
          visible = entries.some(entry => entry.isIntersecting)
        })
  observer?.observe(canvas)

  const spinUniforms = () => (current ? (current.frontPlane.material as THREE.ShaderMaterial).uniforms : null)

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    const dt = Math.min(now - prev, 50) / 1000
    prev = now
    if (!current) return
    resize()
    // 外圈只在看得见时转：减少动态效果、页面隐藏或画布不在视口里都停住，回来时从停下的角度接着转。
    const spin = current.spin
    if (spin && !still && visible && document.visibilityState === 'visible') {
      spinTime += dt
      spinAngle = spinAngleAt(spin, spinTime, spinMode)
      spinUniforms()!.uSpinAngle.value = spinAngle
    }
    const ease = still ? 1 : 1 - Math.pow(1 - Math.min((now - start) / 1300, 1), 3)
    faceAngle = still ? face : faceAngle + (face - faceAngle) * Math.min(1, dt * 9)
    if (!dragging) {
      const spring = Math.exp(-dt * 5)
      dragYaw *= spring
      dragPitch *= spring
    }
    if (!still) idle += ((!dragging && now - lastInput > 2500 ? 1 : 0) - idle) * Math.min(1, dt * 1.5)
    const t = now / 1000
    const yaw = faceAngle + soft(dragYaw, YAW_LIMIT) + idle * Math.sin(t * 0.45) * 0.15 - (1 - ease) * 0.7
    const pitch = soft(dragPitch, PITCH_LIMIT) + idle * Math.sin(t * 0.3) * 0.06
    rig.rotation.set(pitch, yaw, 0)
    rig.scale.setScalar(0.82 + ease * 0.18)
    render()
  }
  frame = requestAnimationFrame(tick)

  const onDown = (e: PointerEvent) => {
    dragging = true
    moved = 0
    lastX = e.clientX
    lastY = e.clientY
    lastInput = performance.now()
    canvas.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    moved += Math.abs(dx) + Math.abs(dy)
    dragYaw += dx * 0.01
    dragPitch += dy * 0.008
    lastInput = performance.now()
  }
  const onUp = () => {
    if (!dragging) return
    dragging = false
    lastInput = performance.now()
    if (moved < 4) face += Math.PI
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    face += Math.PI
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('keydown', onKey)

  const show = async (spec: ReliefSpec) => {
    const ticket = ++request
    const content = await obtain(spec)
    // 加载期间又换了勋章或已关闭时不切换（内容留在缓存里）。
    if (ticket !== request || disposed) return
    if (current) rig.remove(current.holder)
    current = content
    rig.add(content.holder)
    camera.position.set(0, 0, content.distance)
    still = spec.reducedMotion
    start = performance.now()
    lastInput = start
    face = 0
    faceAngle = 0
    dragYaw = 0
    dragPitch = 0
    idle = 0
    spinAngle = 0
    spinTime = 0
    if (content.spin) spinMode = medalSpinMode(content.spin)
    ;(content.frontPlane.material as THREE.ShaderMaterial).uniforms.uSpinAngle.value = 0
  }

  const prepare = (specs: ReliefSpec[]) => {
    for (const spec of specs.slice(0, CACHE_SIZE - 1)) void obtain(spec).catch(() => undefined)
  }

  // 保存图片取外圈回正的静止画面。
  const snapshot = () => {
    const uniforms = spinUniforms()
    if (!uniforms) return null
    const saved = rig.rotation.clone()
    const scale = rig.scale.clone()
    rig.rotation.set(0, 0, 0)
    rig.scale.setScalar(1)
    uniforms.uSpinAngle.value = 0
    render()
    const url = canvas.toDataURL('image/png')
    rig.rotation.copy(saved)
    rig.scale.copy(scale)
    uniforms.uSpinAngle.value = spinAngle
    return url
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    request++
    cancelAnimationFrame(frame)
    observer?.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    canvas.removeEventListener('keydown', onKey)
    for (const content of cache.values()) disposeMedal(content)
    cache.clear()
    current = null
    environment.dispose()
    renderer.dispose()
    // 主动交还上下文，不等浏览器回收。
    renderer.forceContextLoss()
  }
  return { show, prepare, snapshot, bounds: () => current?.bounds ?? null, dispose }
}

// 暗色摄影棚，给侧壁金属反光用：深灰四壁，几条长条灯带，左右按主色偏色；身后两侧各补一条，
// 侧壁转到哪边都有一道亮边。
function studio(accent: THREE.Color): THREE.Scene {
  const room = new THREE.Scene()
  room.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(20, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x24282e, side: THREE.BackSide }),
    ),
  )
  const strip = (w: number, h: number, color: THREE.Color, intensity: number, at: [number, number, number]) => {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: THREE.DoubleSide }),
    )
    light.position.set(...at)
    light.lookAt(0, 0, 0)
    room.add(light)
  }
  const white = new THREE.Color(0xffffff)
  strip(20, 9, white, 2.4, [0, 8, 4])
  strip(7, 22, accent.clone().lerp(white, 0.2), 4.5, [-8, 0, 3])
  strip(5, 20, white.clone().lerp(accent, 0.3), 3, [8, 1, 1])
  strip(22, 4, accent, 2.2, [0, -7, 5])
  strip(6, 22, white.clone().lerp(accent, 0.15), 3.2, [-8, 0, -4])
  strip(6, 22, accent.clone().lerp(white, 0.4), 3.2, [8, 0, -4])
  strip(22, 5, white, 2, [0, 8, -4])
  return room
}
