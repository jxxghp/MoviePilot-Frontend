/**
 * 为可降级的装饰效果申请 WebGL2，拒绝浏览器标记为显著性能受限的上下文。
 * 返回空值后应保留静态呈现，不能交给渲染库按默认参数重新申请上下文。
 */
export function createDecorativeWebGLContext(
  canvas: HTMLCanvasElement,
  attributes: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  if (typeof WebGL2RenderingContext === 'undefined') return null

  const context = canvas.getContext('webgl2', {
    ...attributes,
    failIfMajorPerformanceCaveat: true,
  })
  return context && !context.isContextLost() ? context : null
}
