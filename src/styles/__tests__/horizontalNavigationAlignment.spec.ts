import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('horizontal navigation alignment', () => {
  it('keeps the horizontal navbar full width while page content remains boxed', () => {
    const layout = readFileSync(resolve('src/@layouts/components/VerticalNavLayout.vue'), 'utf8')
    const horizontalLayout = layout.slice(
      layout.indexOf('  &.layout-horizontal-nav-active {'),
      layout.indexOf('  @at-root {', layout.indexOf('  &.layout-horizontal-nav-active {')),
    )
    const glass = readFileSync(resolve('src/styles/themes/glass.scss'), 'utf8')
    const floatingNavbar = glass.slice(
      glass.indexOf('// 浮动顶栏使用同一布局坐标系'),
      glass.indexOf('// 基础材质由单一真实表面承载'),
    )

    expect(horizontalLayout).toContain('grid-template-columns: auto minmax(0, 1fr) auto')
    expect(horizontalLayout).toContain('max-inline-size: none')
    expect(horizontalLayout).toContain('max-inline-size: variables.$layout-boxed-content-width')
    expect(floatingNavbar).toContain('inline-size: 100%')
    expect(floatingNavbar).toContain('--shell-navbar-content-top-gutter')
    expect(floatingNavbar).toContain('--shell-navbar-content-floating-gutter')
    expect(floatingNavbar).not.toContain('variables.$layout-boxed-content-width')
  })
})
