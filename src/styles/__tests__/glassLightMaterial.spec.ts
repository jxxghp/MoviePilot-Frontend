import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

const root = cwd()
const glassPath = resolve(root, 'src/styles/themes/glass.scss')
const glassV3Path = resolve(root, 'src/styles/themes/_glass-v3.scss')
const tokensPath = resolve(root, 'src/styles/tokens.scss')
const appPath = resolve(root, 'src/App.vue')
const backplatePath = resolve(root, 'src/components/theme/GlassFixedShellBackplate.vue')

const glassSource = readFileSync(glassPath, 'utf8')
const glassV3Source = readFileSync(glassV3Path, 'utf8')
const tokensSource = readFileSync(tokensPath, 'utf8')
const appSource = readFileSync(appPath, 'utf8')
const backplateSource = readFileSync(backplatePath, 'utf8')

const compiledGlassCss = compileString(glassSource, {
  url: new URL(pathToFileURL(glassPath).href),
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

const isLightSelector = (selector: string) =>
  selector.includes("[data-glass-color-scheme='light']") || selector.includes('[data-glass-color-scheme=light]')

describe('浅色玻璃材质物理模型契约', () => {
  it('浅色壁纸共享滤镜与薄纱变量且不随外观切档区分壁纸薄纱', () => {
    const parsed = postcss.parse(compiledGlassCss)
    const veilSelectors: string[] = []
    parsed.walkDecls('--glass-light-wallpaper-veil', decl => {
      if (decl.parent?.type === 'rule') veilSelectors.push(decl.parent.selector)
    })

    // 材质调色只发生在玻璃内部，壁纸薄纱不按 clear / tinted / frosted 拆分。
    expect(veilSelectors).toHaveLength(1)
    expect(isLightSelector(veilSelectors[0])).toBe(true)
    expect(veilSelectors[0]).not.toContain('data-glass-appearance')

    for (const source of [appSource, backplateSource]) {
      expect(source).toMatch(/var\(\s*--glass-light-wallpaper-filter/u)
      expect(source).toMatch(/var\(\s*--glass-light-wallpaper-veil/u)
      expect(source).not.toContain('contrast(0.92)')
    }
  })

  it('透明与色调保持零模糊，仅磨砂启用散射模糊，且全画质共用 --glass-panel-tone-filter', () => {
    const parsed = postcss.parse(compiledGlassCss)
    let clearBodyFilter = ''
    let tintedBodyFilter = ''
    let frostedBodyFilter = ''
    let panelToneFilter = ''
    let tintedChroma = ''
    let clearChroma = ''
    let nativeSurfaceFilter = ''
    let clearStylePopupBlur = ''

    parsed.walkRules(rule => {
      const sel = rule.selector
      if (!isLightSelector(sel)) return

      rule.walkDecls(decl => {
        if (decl.prop === '--glass-panel-tone-filter') panelToneFilter = decl.value
        if (decl.prop === '--glass-native-surface-backdrop-filter') nativeSurfaceFilter = decl.value
        if (sel.includes('data-glass-appearance=frosted') || sel.includes("data-glass-appearance='frosted'")) {
          if (decl.prop === '--glass-light-body-filter') frostedBodyFilter = decl.value
        } else if (sel.includes('data-glass-appearance=tinted') || sel.includes("data-glass-appearance='tinted'")) {
          if (decl.prop === '--glass-light-body-filter') tintedBodyFilter = decl.value
          if (decl.prop === '--glass-light-chroma') tintedChroma = decl.value
        } else if (sel.includes('[data-glass-appearance]')) {
          if (decl.prop === '--glass-light-body-filter') clearBodyFilter = decl.value
          if (decl.prop === '--glass-light-chroma') clearChroma = decl.value
        }
        if (
          (sel.includes('data-glass-ui-style=clear') || sel.includes("data-glass-ui-style='clear'")) &&
          decl.prop === '--glass-popup-blur'
        ) {
          clearStylePopupBlur = decl.value
        }
      })
    })

    expect(clearBodyFilter).toBe('var(--glass-light-tone-filter)')
    expect(clearBodyFilter).not.toContain('blur(')
    expect(tintedBodyFilter).not.toContain('blur(')
    expect(frostedBodyFilter).toContain('blur(')
    expect(panelToneFilter).toBe('var(--glass-light-tone-filter)')
    expect(nativeSurfaceFilter).toBe('var(--glass-light-body-filter)')
    expect(clearChroma).toContain('190%')
    expect(tintedChroma).toContain('--glass-tint-density')
    expect(clearStylePopupBlur).toBe('6px')
  })

  it('建立外层主卡、无外阴影内嵌子卡与凹井输入框层级，并禁止浅色嵌套二次采样', () => {
    expect(tokensSource).toContain('--mp-muted: rgba(15, 23, 42, 0.055);')
    expect(glassSource).not.toContain('.ai-agent-settings-card')
    expect(glassSource).toContain('.collapsible-setting-card')

    const parsed = postcss.parse(compiledGlassCss)
    let collapsibleShadow = ''
    let collapsibleBackdrop = ''
    let outlinedSelectorMatchedDesktop = false
    let outlinedSelectorExcludedMobile = true
    let nestedCardClearedBackdrop = false

    const fixture = document.implementation.createHTMLDocument('light glass layers')
    fixture.documentElement.dataset.theme = 'glass'
    fixture.documentElement.dataset.glassColorScheme = 'light'
    fixture.body.dataset.theme = 'glass'

    const pageContent = fixture.createElement('div')
    pageContent.className = 'layout-page-content'
    const outerCard = fixture.createElement('div')
    outerCard.className = 'v-card'
    const innerCard = fixture.createElement('div')
    innerCard.className = 'v-card'
    outerCard.append(innerCard)
    pageContent.append(outerCard)

    const desktopField = fixture.createElement('div')
    desktopField.className = 'v-field v-field--variant-outlined'
    outerCard.append(desktopField)

    const mobileWrapper = fixture.createElement('div')
    mobileWrapper.className = 'app-responsive-input--field'
    const mobileField = fixture.createElement('div')
    mobileField.className = 'v-field v-field--variant-outlined'
    mobileWrapper.append(mobileField)
    outerCard.append(mobileWrapper)

    fixture.body.append(pageContent)

    parsed.walkRules(rule => {
      if (!isLightSelector(rule.selector)) return

      if (rule.selector.endsWith('.collapsible-setting-card')) {
        rule.walkDecls('box-shadow', decl => {
          collapsibleShadow = decl.value
        })
        rule.walkDecls('backdrop-filter', decl => {
          collapsibleBackdrop = decl.value
        })
      }
      if (
        rule.selector.includes('.v-field--variant-outlined') &&
        !rule.selector.includes('.v-field--focused') &&
        !rule.selector.includes('.v-field--error')
      ) {
        if (desktopField.matches(rule.selector)) outlinedSelectorMatchedDesktop = true
        if (mobileField.matches(rule.selector)) outlinedSelectorExcludedMobile = false
      }
      if (rule.selector.includes('.layout-page-content') && innerCard.matches(rule.selector)) {
        rule.walkDecls('backdrop-filter', decl => {
          if (decl.value === 'none') nestedCardClearedBackdrop = true
        })
      }
    })

    expect(collapsibleBackdrop).toBe('none')
    expect(collapsibleShadow).toContain('inset')
    expect(outlinedSelectorMatchedDesktop).toBe(true)
    expect(outlinedSelectorExcludedMobile).toBe(true)
    expect(nestedCardClearedBackdrop).toBe(true)
  })

  it('在降低透明度模式下为浅色玻璃实白表面补充细边框', () => {
    const reducedStart = glassV3Source.indexOf('@media (prefers-reduced-transparency: reduce)')
    const reducedBlock = glassV3Source.slice(reducedStart)

    expect(reducedStart).toBeGreaterThanOrEqual(0)
    expect(reducedBlock).toContain("[data-glass-color-scheme='light']")
    expect(reducedBlock).toContain('border: 1px solid rgba(15, 23, 42, 0.1) !important;')
  })

  it('浅色侧栏 SVG 折射在 balanced 与 high 两档均以更高权重注入亮度带，且登录卡与卡片悬停棱边保持浅色契约', () => {
    const parsed = postcss.parse(compiledGlassCss)
    let balancedSidebarLightTone = false
    let highSidebarLightTone = false
    let lightLoginBackdrop = ''
    let lightHoverWhiteRim = false

    const makeSidebarDoc = (quality: 'balanced' | 'high') => {
      const doc = document.implementation.createHTMLDocument(`sidebar-${quality}`)
      doc.documentElement.dataset.theme = 'glass'
      doc.documentElement.dataset.glassColorScheme = 'light'
      doc.documentElement.dataset.glassAppearance = 'clear'
      doc.documentElement.dataset.glassQuality = quality
      doc.body.dataset.theme = 'glass'
      const wrapper = doc.createElement('div')
      wrapper.className = 'layout-wrapper'
      wrapper.dataset.glassNavigationRefraction = 'chromium'
      wrapper.dataset.glassSidebarRefractionReady = 'true'
      const nav = doc.createElement('aside')
      nav.className = 'layout-vertical-nav'
      wrapper.append(nav)
      doc.body.append(wrapper)
      return nav
    }

    const balancedNav = makeSidebarDoc('balanced')
    const highNav = makeSidebarDoc('high')

    parsed.walkRules(rule => {
      if (!isLightSelector(rule.selector)) return

      rule.walkDecls('--glass-sidebar-live-filter', decl => {
        if (decl.value.includes('var(--glass-panel-tone-filter)')) {
          if (
            rule.selector.includes('data-glass-quality=balanced') ||
            rule.selector.includes("data-glass-quality='balanced'")
          ) {
            if (balancedNav.matches(rule.selector)) balancedSidebarLightTone = true
          }
          if (
            rule.selector.includes('data-glass-quality=high') ||
            rule.selector.includes("data-glass-quality='high'")
          ) {
            if (highNav.matches(rule.selector)) highSidebarLightTone = true
          }
        }
      })

      if (rule.selector.endsWith('.login-card')) {
        rule.walkDecls('backdrop-filter', decl => {
          lightLoginBackdrop = decl.value
        })
      }

      if (rule.selector.includes('.v-card:hover')) {
        rule.walkDecls('--glass-v3-surface-edge', decl => {
          if (decl.value.includes('rgba(255, 255, 255,')) lightHoverWhiteRim = true
        })
      }
    })

    expect(balancedSidebarLightTone).toBe(true)
    expect(highSidebarLightTone).toBe(true)
    expect(lightLoginBackdrop).toBe('var(--glass-light-body-filter)')
    expect(lightHoverWhiteRim).toBe(true)
  })
})
