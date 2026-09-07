import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseComponent } from '@vue/compiler-sfc'
import { compileString } from 'sass'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve('src/styles/themes/glass.scss'), 'utf8')
const surfaces = readFileSync(resolve('src/styles/themes/_glass-v3.scss'), 'utf8')

describe('glass navigation reading material', () => {
  it('keeps clear refraction selectable while adaptive navigation protects top and overlapping states', () => {
    expect(surfaces).toContain(":not([data-glass-navbar-style='clear']) body[data-theme='glass']")
    expect(surfaces).toContain('--glass-navbar-reading-filter: saturate(100%)')
    expect(surfaces).toContain('--glass-navbar-reading-filter: blur(6px)')
    expect(surfaces).toContain('--glass-navbar-reading-filter: blur(14px)')
    expect(surfaces).toContain(
      'backdrop-filter: var(--glass-navbar-reading-filter, saturate(100%)) var(--glass-panel-filter)',
    )
    for (const quality of ['high', 'balanced']) {
      expect(styles.replace(/\s+/gu, ' ')).toContain(
        `var(--glass-navbar-reading-filter, saturate(100%)) url('#glass-navbar-live-refraction-${quality}')`,
      )
    }
  })

  it('retains native frosted diffusion without a stable backplate in every quality', () => {
    expect(surfaces).toMatch(
      /:not\(\.layout-fixed-shell-backplate-active\) \.layout-navbar\s*\{\s*backdrop-filter: var\(--glass-sidebar-backdrop-filter\) !important;/u,
    )
    const frosted = styles.slice(styles.indexOf('// 稳定背板已持有磨砂'), styles.indexOf('// 滚动表面由原生 backdrop'))
    expect(frosted).not.toContain('--glass-navbar-scrolled-backdrop-filter')
    expect(frosted).toContain('--glass-native-surface-backdrop-filter')
  })

  it('keeps Dock reading protection independent of the navbar style and avoids nested glass buttons', () => {
    expect(surfaces).not.toMatch(/\[data-shell-mode='app'\] \.layout-navbar,\s*\.footer-nav-card\s*\{/u)
    expect(surfaces).toContain('background: var(--glass-sheen), var(--glass-popup-surface) !important')
    expect(surfaces).toContain('.footer-nav-card.dynamic-btn-card')
    expect(surfaces).toContain('.footer-nav-card .footer-nav-btn')
    expect(surfaces).toContain('&.footer-nav-btn-active')
    expect(surfaces).toContain('inline-size: min(100%, 26rem)')
  })

  it('separates overlapping frosted navigation without a second diffusion pass', () => {
    expect(surfaces).toContain('--glass-navbar-frosted-separation: 0')
    expect(surfaces).toContain('--glass-navbar-frosted-separation: 0.08')
    expect(surfaces).toContain("[data-glass-appearance='frosted']:not([data-glass-navbar-style='clear'])")
    expect(surfaces).toContain('var(--glass-v3-card-background) !important')
    const backplate = readFileSync(resolve('src/components/theme/GlassFixedShellBackplate.vue'), 'utf8')
    const style = parseComponent(backplate).descriptor.styles[0]
    const compiled = compileString(style.content, {
      loadPaths: [resolve('node_modules')],
      importers: [
        {
          findFileUrl: url => {
            if (url === '@configured-variables')
              return new URL(pathToFileURL(resolve('src/styles/variables/_template.scss')).href)
            return url.startsWith('@layouts/') || url.startsWith('@core/')
              ? new URL(pathToFileURL(resolve('src', url)).href)
              : null
          },
        },
      ],
      logger: { warn: () => undefined, debug: () => undefined },
    })
    let background: string | undefined
    postcss.parse(compiled.css).walkRules('.glass-fixed-shell-backplate--main', rule => {
      rule.walkDecls('background-color', declaration => {
        background = declaration.value
      })
    })
    expect(background).toBe('rgb(23, 27, 32)')
  })
})
