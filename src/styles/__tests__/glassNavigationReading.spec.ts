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
  it('keeps resting navigation clear and applies stronger reading diffusion to adaptive overlap', () => {
    expect(surfaces).toContain('--glass-navbar-reading-filter: saturate(100%)')
    expect(surfaces).toContain('--glass-navbar-reading-filter: blur(2px) brightness(92%)')
    expect(surfaces).toContain('--glass-navbar-reading-filter: blur(3px) brightness(92%)')
    expect(surfaces).toContain('--glass-navbar-reading-filter: blur(6px) brightness(92%)')
    expect(surfaces).toContain(
      'backdrop-filter: var(--glass-navbar-reading-filter, saturate(100%)) var(--glass-panel-filter)',
    )
    for (const quality of ['high', 'balanced']) {
      expect(styles.replace(/\s+/gu, ' ')).toContain(
        `var(--glass-navbar-reading-filter, saturate(100%)) url('#glass-navbar-live-refraction-${quality}')`,
      )
    }
  })

  it('shares overlap reading across shells and qualities without changing frosted material', () => {
    const compiled = compileString(styles, {
      url: new URL(pathToFileURL(resolve('src/styles/themes/glass.scss')).href),
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
    const readingRules: Record<string, string[]> = {}
    postcss.parse(compiled.css).walkRules(rule => {
      rule.walkDecls('--glass-navbar-reading-filter', declaration => {
        const selector = rule.selector.replace(/["']/gu, '').replace(/\s+/gu, ' ')
        const selectors = (readingRules[declaration.value] ??= [])
        selectors.push(selector)
        if (!declaration.value.includes('brightness(92%)')) return

        expect(selector).toContain(':is([data-glass-appearance=clear], [data-glass-appearance=tinted])')
        expect(selector).toContain('[data-shell-mode]')
        expect(selector).toContain('.layout-navbar-away-from-top .layout-navbar')
        expect(selector).not.toContain('layout-horizontal-nav-active')
        expect(selector).not.toContain('data-glass-quality')
        expect(rule.nodes).toHaveLength(1)
      })
    })

    expect(Object.keys(readingRules)).toEqual([
      'saturate(100%)',
      'blur(2px) brightness(92%)',
      'blur(3px) brightness(92%)',
      'blur(6px) brightness(92%)',
    ])
    for (const selectors of Object.values(readingRules)) expect(selectors).toHaveLength(1)
    expect(readingRules['blur(2px) brightness(92%)'][0]).not.toContain('[data-glass-navbar-style=clear]')
    expect(readingRules['blur(3px) brightness(92%)'][0]).toContain(':not([data-shell-mode=desktop])')
    expect(readingRules['blur(6px) brightness(92%)'][0]).toContain('[data-glass-navbar-style=adaptive]')

    // 用编译后的选择器覆盖 Shell 状态与主题组合，防止移动端例外绕过共同阅读规则。
    const fixture = document.implementation.createHTMLDocument()
    fixture.documentElement.dataset.theme = 'glass'
    fixture.body.dataset.theme = 'glass'
    const shell = fixture.createElement('div')
    shell.className = 'layout-wrapper'
    const navbar = fixture.createElement('header')
    navbar.className = 'layout-navbar'
    shell.append(navbar)
    fixture.body.append(shell)

    for (const appearance of ['clear', 'tinted', 'frosted']) {
      fixture.documentElement.dataset.glassAppearance = appearance
      for (const quality of ['css', 'balanced', 'high']) {
        fixture.documentElement.dataset.glassQuality = quality
        for (const style of ['clear', 'adaptive']) {
          fixture.documentElement.dataset.glassNavbarStyle = style
          for (const mode of ['desktop', 'app', 'drawer']) {
            shell.dataset.shellMode = mode
            const clearBlur = mode === 'desktop' ? 2 : 3
            for (const state of ['expanded', 'compact', 'revealed']) {
              shell.classList.toggle('layout-navbar-away-from-top', state !== 'expanded')
              const matches = Object.entries(readingRules).filter(([, selectors]) =>
                selectors.some(selector => navbar.matches(selector)),
              )
              const expected =
                appearance === 'frosted' || state === 'expanded'
                  ? 'saturate(100%)'
                  : `blur(${style === 'clear' ? clearBlur : 6}px) brightness(92%)`

              expect(matches.at(-1)?.[0], `${appearance}/${quality}/${style}/${mode}/${state}`).toBe(expected)
            }
          }
        }
      }
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
    expect(surfaces).not.toContain("[data-glass-appearance='frosted']:not([data-glass-navbar-style='clear'])")
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
