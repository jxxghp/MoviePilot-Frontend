/**
 * 勋章外形的平面几何：缺图后备的六边形外形。坐标是相对整张图的比例（0–1），x 向右、y 向下，
 * 与 build_maps.py 输出的轮廓一致。
 */

export type Point = [number, number]

/** 圆角多边形：每个角按半径 radius 以圆弧过渡，返回闭合轮廓（首尾不重复）。 */
export function roundedPolygon(vertices: Point[], radius: number, segments = 8): Point[] {
  const result: Point[] = []
  const count = vertices.length
  for (let i = 0; i < count; i++) {
    const prev = vertices[(i - 1 + count) % count]
    const at = vertices[i]
    const next = vertices[(i + 1) % count]
    const toPrev = normalize([prev[0] - at[0], prev[1] - at[1]])
    const toNext = normalize([next[0] - at[0], next[1] - at[1]])
    const start: Point = [at[0] + toPrev[0] * radius, at[1] + toPrev[1] * radius]
    const end: Point = [at[0] + toNext[0] * radius, at[1] + toNext[1] * radius]
    // 二次贝塞尔以顶点为控制点，近似圆角且不需要求圆心。
    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      const a = (1 - t) * (1 - t)
      const b = 2 * (1 - t) * t
      const c = t * t
      result.push([a * start[0] + b * at[0] + c * end[0], a * start[1] + b * at[1] + c * end[1]])
    }
  }
  return result
}

function normalize([x, y]: Point): Point {
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

/** 平顶六边形的顶点，中心 (cx, cy)，外接圆半径 r。 */
export function hexagonVertices(cx: number, cy: number, r: number): Point[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as Point
  })
}

/** 缺图时的外形：取自 MoviePilot Logo 的六边形，勋章约占画面八成。 */
export const FALLBACK_OUTLINE: Point[] = roundedPolygon(hexagonVertices(0.5, 0.5, 0.44), 0.06)
