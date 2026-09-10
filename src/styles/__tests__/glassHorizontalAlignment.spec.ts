import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'
import { parse as parseComponent } from '@vue/compiler-sfc'
import { compileString } from 'sass'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

const root = cwd()
const glassPath = resolve(root, 'src/styles/themes/glass.scss')
const layoutPath = resolve(root, 'src/@layouts/components/VerticalNavLayout.vue')
const glassSource = readFileSync(glassPath, 'utf8')

function compileScss(source: string, sourcePath: string) {
  return compileString(source, {
    url: new URL(pathToFileURL(sourcePath).href),
    loadPaths: [resolve(root, 'node_modules')],
    importers: [
      {
        findFileUrl: url => {
          if (url === '@configured-variables')
            return new URL(pathToFileURL(resolve(root, 'src/styles/variables/_template.scss')).href)
          return url.startsWith('@layouts/') || url.startsWith('@core/')
            ? new URL(pathToFileURL(resolve(root, 'src', url)).href)
            : null
        },
      },
    ],
    logger: { warn: () => undefined, debug: () => undefined },
  }).css
}

function compileGlassTheme() {
  return compileScss(glassSource, glassPath)
}

function compileVerticalLayout() {
  const style = parseComponent(readFileSync(layoutPath, 'utf8')).descriptor.styles.find(block => block.lang === 'scss')
  expect(style).toBeDefined()
  return compileScss(style?.content ?? '', layoutPath)
}

function findHorizontalAlignmentRule(css: string): Rule {
  const matches: Rule[] = []
  postcss.parse(css).walkRules(rule => {
    const declarations = new Map<string, string>()
    rule.walkDecls(declaration => {
      declarations.set(declaration.prop, declaration.value)
    })

    if (
      declarations.get('max-inline-size') === 'none' &&
      declarations.get('padding-inline')?.includes('--shell-navbar-content-top-gutter')
    ) {
      matches.push(rule)
    }
  })

  expect(matches).toHaveLength(1)
  return matches[0]
}

function createNavbarFixture() {
  const fixture = document.implementation.createHTMLDocument('glass horizontal alignment')
  const shell = fixture.createElement('div')
  shell.className =
    'layout-wrapper layout-nav-type-vertical layout-horizontal-nav-active layout-navbar-fixed layout-navbar-floating-eligible'

  const navbar = fixture.createElement('header')
  navbar.className = 'layout-navbar'
  const content = fixture.createElement('div')
  content.className = 'navbar-content-container'
  navbar.append(content)
  shell.append(navbar)
  fixture.body.append(shell)

  return { fixture, shell, navbar, content }
}

describe('glass horizontal navbar alignment', () => {
  it('centers the page-top controls with symmetric gutters instead of a second translation', () => {
    const alignmentRule = findHorizontalAlignmentRule(compileGlassTheme())
    const baseLayoutRule = postcss
      .parse(compileVerticalLayout())
      .nodes.find(
        node =>
          node.type === 'rule' &&
          node.selector ===
            '.layout-wrapper.layout-nav-type-vertical.layout-horizontal-nav-active .navbar-content-container',
      ) as Rule | undefined
    const declarations = new Map<string, string>()
    alignmentRule.walkDecls(declaration => {
      declarations.set(declaration.prop, declaration.value)
    })

    expect(alignmentRule.selector).toContain('html[data-theme=glass]')
    expect(alignmentRule.selector).toContain('body[data-theme=glass]')
    expect(alignmentRule.selector).toContain(
      '.layout-wrapper.layout-nav-type-vertical.layout-horizontal-nav-active.layout-navbar-floating-eligible',
    )
    expect(alignmentRule.selector).toContain('.layout-navbar .navbar-content-container')
    expect(alignmentRule.selector).not.toContain('layout-navbar-away-from-top')

    expect(baseLayoutRule).toBeDefined()
    expect(baseLayoutRule?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ prop: 'display', value: 'grid' }),
        expect.objectContaining({ prop: 'grid-template-columns', value: 'auto minmax(0, 1fr) auto' }),
        expect.objectContaining({ prop: 'margin-inline', value: '0' }),
      ]),
    )
    expect(Object.fromEntries(declarations)).toMatchObject({
      position: 'relative',
      'inline-size': '100%',
      'margin-inline': '0',
      'max-inline-size': 'none',
    })
    expect(declarations.get('padding-inline')).toContain('var(--shell-navbar-content-top-gutter, 0px)')
    expect(declarations.get('padding-inline')).toContain('(1 - var(--shell-navbar-expand-progress))')
    expect(declarations.get('padding-inline')).toContain('var(--shell-navbar-content-floating-gutter, 16px)')
    expect(declarations.get('padding-inline')).toContain('var(--shell-navbar-content-inset-compensation)')
    expect(declarations.has('inset-inline-start')).toBe(false)
    expect(declarations.has('transform')).toBe(false)
    expect(declarations.has('display')).toBe(false)
    expect(declarations.has('grid-template-columns')).toBe(false)
    expect(declarations.has('column-gap')).toBe(false)

    expect(declarations.has('transition')).toBe(false)
  })

  it('shares the alignment across all glass materials, qualities and navbar styles only in desktop horizontal mode', () => {
    const alignmentRule = findHorizontalAlignmentRule(compileGlassTheme())
    const { fixture, shell, content } = createNavbarFixture()
    const appearances = ['clear', 'tinted', 'frosted'] as const
    const qualities = ['css', 'balanced', 'high'] as const
    const navbarStyles = ['clear', 'adaptive'] as const

    for (const appearance of appearances) {
      fixture.documentElement.dataset.theme = 'glass'
      fixture.body.dataset.theme = 'glass'
      fixture.documentElement.dataset.glassAppearance = appearance
      fixture.body.dataset.glassAppearance = appearance

      for (const quality of qualities) {
        fixture.documentElement.dataset.glassQuality = quality
        fixture.body.dataset.glassQuality = quality

        for (const navbarStyle of navbarStyles) {
          fixture.documentElement.dataset.glassNavbarStyle = navbarStyle
          fixture.body.dataset.glassNavbarStyle = navbarStyle

          for (const away of [false, true]) {
            shell.classList.toggle('layout-navbar-away-from-top', away)
            expect(content.matches(alignmentRule.selector), `${appearance}/${quality}/${navbarStyle}/${away}`).toBe(
              true,
            )
          }
        }
      }
    }

    const nonMatchingStates = [
      { name: 'ordinary theme', theme: 'light', appearance: 'clear', eligible: true },
      { name: 'separate transparent theme', theme: 'transparent', appearance: 'clear', eligible: true },
      { name: 'non-eligible horizontal navbar', theme: 'glass', appearance: 'clear', eligible: false },
    ] as const

    for (const state of nonMatchingStates) {
      fixture.documentElement.dataset.theme = state.theme
      fixture.body.dataset.theme = state.theme
      fixture.documentElement.dataset.glassAppearance = state.appearance
      fixture.body.dataset.glassAppearance = state.appearance
      shell.classList.toggle('layout-navbar-floating-eligible', state.eligible)
      shell.classList.add('layout-navbar-away-from-top')

      expect(content.matches(alignmentRule.selector), state.name).toBe(false)
    }

    fixture.documentElement.dataset.theme = 'glass'
    fixture.body.dataset.theme = 'glass'
    shell.classList.add('layout-navbar-floating-eligible')
    shell.classList.remove('layout-horizontal-nav-active')
    expect(content.matches(alignmentRule.selector)).toBe(false)
  })

  it('unboxes the floating controls and accounts for the existing frosted scale compensation', () => {
    const css = postcss.parse(compileGlassTheme())
    const { fixture, shell, navbar, content } = createNavbarFixture()
    fixture.documentElement.dataset.theme = 'glass'
    fixture.body.dataset.theme = 'glass'
    shell.classList.add('layout-navbar-away-from-top')

    for (const appearance of ['clear', 'tinted', 'frosted']) {
      fixture.documentElement.dataset.glassAppearance = appearance
      fixture.body.dataset.glassAppearance = appearance
      const compensation: string[] = []
      const motionProperties: string[] = []
      css.walkRules(rule => {
        if (!rule.selector.includes('layout-navbar-floating-eligible')) return
        if (navbar.matches(rule.selector)) {
          rule.walkDecls('--shell-navbar-content-inset-compensation', declaration => {
            compensation.push(declaration.value)
          })
        }
        // 该规则额外限定布局类型，优先级高于主题末尾的通用浮动动画规则。
        if (rule.selector.includes('.layout-nav-type-vertical') && content.matches(rule.selector)) {
          rule.walkDecls('transition-property', declaration => {
            motionProperties.push(declaration.value)
            expect(declaration.important).toBe(true)
          })
        }
      })
      expect(compensation.at(-1), appearance).toBe(
        appearance === 'frosted' ? '0px' : 'var(--shell-navbar-motion-inset)',
      )
      expect(motionProperties.at(-1)).toBe('background-color, border-color, box-shadow, opacity')
    }
  })

  it('retains reduced-motion handling for the same content container', () => {
    const css = postcss.parse(compileVerticalLayout())
    let covered = false
    css.walkAtRules('media', rule => {
      if (rule.params !== '(prefers-reduced-motion: reduce)') return
      rule.walkRules(child => {
        if (!child.selector.includes('.navbar-content-container')) return
        child.walkDecls('transition-duration', declaration => {
          covered = declaration.value === '0.01ms' && Boolean(declaration.important)
        })
      })
    })
    expect(covered).toBe(true)

    let centered = false
    postcss.parse(compileGlassTheme()).walkAtRules('media', rule => {
      if (rule.params !== '(prefers-reduced-motion: reduce)') return
      rule.walkDecls('--shell-navbar-expand-progress', declaration => {
        centered = declaration.value === '0' && Boolean(declaration.important)
      })
    })
    expect(centered).toBe(true)
  })
})
