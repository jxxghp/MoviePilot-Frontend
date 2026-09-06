import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass overlay material styles', () => {
  it('shares the soft contour between content cards and detached navigation', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/_glass-v3.scss'), 'utf8')

    expect(styles).toContain('box-shadow: var(--glass-v3-surface-edge), var(--glass-v3-shadow)')
    expect(styles).toContain('box-shadow: var(--glass-v3-surface-edge), var(--glass-v3-navigation-shadow)')
    expect(styles).toMatch(
      /&::before\s*\{[\s\S]*?border-radius: inherit;[\s\S]*?box-shadow: var\(--glass-v3-surface-edge\)/u,
    )
  })

  it('reserves space below detached desktop navigation and follows the compact theme radius', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/_glass-v3.scss'), 'utf8')

    expect(styles).toContain('--glass-v3-navigation-radius: var(--app-field-radius, 16px)')
    expect(styles).toContain('--glass-v3-navigation-content-gap: 16px')
    expect(styles).toContain('border-radius: var(--glass-v3-navigation-radius)')
    expect(styles).toContain('--shell-floating-navbar-radius: var(--glass-v3-navigation-radius)')
    expect(styles).toMatch(/var\(--layout-navbar-block-size\)\s*-\s*var\(--navbar-tab-height, 0px\)/u)
    expect(styles).toContain('var(--glass-v3-navigation-content-gap)')
    expect(styles).toContain('.layout-window-controls-overlay-shell')
    expect(styles).not.toContain('border-radius: 16px')
  })

  it('keeps plugin logo tinting on the material formulas and displays complete logos', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/_glass-v3.scss'), 'utf8')

    expect(styles).not.toMatch(/--plugin-card-banner-(?:tint|scrim)\s*:/u)
    expect(styles).toMatch(/\.plugin-card__plugin-icon \.v-img__img\s*\{\s*object-fit:\s*contain;/u)
  })

  it('keeps overlays translucent enough for CSS backdrop compositing in every material', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('calc(0.1 + var(--glass-surface-density, 0.62) * 0.22)')
    expect(styles.match(/--glass-overlay-blur:\s*var\(--glass-overlay-clarity-blur, 6px\)/g)).toHaveLength(2)
    expect(styles).toContain('--glass-overlay-saturate: 115%')
    expect(styles).toContain('--glass-overlay-saturate: 120%')
    expect(styles).toContain('--glass-overlay-blur: min(var(--glass-blur-raised), 36px)')
    expect(styles).toContain('--glass-overlay-saturate: 135%')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 30%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 32%)')
    expect(styles).toContain('--glass-overlay-scrim: rgba(3, 7, 18, 36%)')
    expect(styles).toContain('calc(0.24 + var(--glass-surface-density, 0.86) * 0.12)')
    expect(styles).not.toContain('calc(0.64 + var(--glass-surface-density, 0.86) * 0.16)')
    expect(styles).not.toContain('background: rgba(3, 7, 18, 62%)')
  })

  it('protects ordinary clear and tinted content without changing raised or frosted materials', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('rgba(11, 19, 34, calc(0.12 + var(--glass-surface-density, 0.62) * 0.2))')
    expect(styles).toContain('rgba(11, 19, 34, calc(0.13 + var(--glass-surface-density, 0.62) * 0.23))')
    expect(styles).toContain('rgba(11, 19, 34, calc(0.12 + var(--glass-surface-density, 0.72) * 0.2)) 88%')
    expect(styles).toContain('rgba(11, 19, 34, calc(0.13 + var(--glass-surface-density, 0.72) * 0.23)) 89%')
    expect(styles).toContain('rgba(11, 19, 34, calc(0.07 + var(--glass-surface-density, 0.62) * 0.36))')
    expect(styles).toContain('rgba(11, 19, 34, calc(0.07 + var(--glass-surface-density, 0.72) * 0.36)) 84%')
    expect(styles).toContain('rgba(255, 255, 255, calc(0.035 + var(--glass-surface-density, 0.86) * 0.075))')
    expect(styles).toContain('rgba(255, 255, 255, calc(0.03 + var(--glass-surface-density, 0.86) * 0.07))')
    expect(styles).toContain('rgba(255, 255, 255, calc(0.045 + var(--glass-surface-density, 0.86) * 0.09))')
  })

  it('uses the derived theme tone only for tinted material surfaces', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const appStyles = readFileSync(resolve(cwd(), 'src/App.vue'), 'utf8')
    const tintedRule = styles.match(/&\[data-glass-appearance='tinted'\]\s*\{(?<declarations>[\s\S]*?)\n {2}\}/u)
      ?.groups?.declarations
    const wallpaperTintStart = appStyles.indexOf(
      "html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.active::after,",
    )
    const wallpaperTintEnd = appStyles.indexOf("html[data-glass-appearance='frosted']", wallpaperTintStart)
    const wallpaperTintRule = appStyles.slice(wallpaperTintStart, wallpaperTintEnd)
    const loginRule = styles.match(
      /html\[data-theme='glass'\]\[data-glass-appearance='tinted'\] body\[data-theme='glass'\]\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations
    const workflowRule = styles.match(
      /&\[data-glass-appearance='tinted'\] \.workflow-task-card\s*\{(?<declarations>[\s\S]*?)\n {2}\}/u,
    )?.groups?.declarations
    const getPropertyValue = (rule: string | undefined, token: string) =>
      rule?.match(new RegExp(`${token}:\\s*(?<value>[\\s\\S]*?);`))?.groups?.value

    expect(tintedRule).toBeDefined()
    for (const token of [
      '--glass-surface',
      '--glass-surface-soft',
      '--glass-surface-raised',
      '--glass-overlay-surface',
    ]) {
      expect(getPropertyValue(tintedRule, token)).toContain('var(--glass-material-accent-rgb)')
    }
    for (const token of [
      '--glass-control',
      '--glass-control-prominent',
      '--glass-control-prominent-focus',
      '--glass-border',
      '--glass-border-raised',
      '--glass-border-hover',
      '--glass-highlight',
      '--glass-sheen',
    ]) {
      expect(getPropertyValue(tintedRule, token)).toContain('var(--v-theme-primary)')
    }
    expect(wallpaperTintStart).toBeGreaterThanOrEqual(0)
    expect(wallpaperTintEnd).toBeGreaterThan(wallpaperTintStart)
    expect(wallpaperTintRule).toContain('rgba(var(--glass-material-accent-rgb), 3%)')
    expect(wallpaperTintRule).not.toContain('var(--v-theme-primary)')
    expect(loginRule).toMatch(/\.login-card__surface[\s\S]*?var\(--glass-material-accent-rgb\)/)
    expect(loginRule).toMatch(/\.native-login-field[\s\S]*?var\(--v-theme-primary\)/)
    expect(workflowRule).toContain('var(--workflow-status-rgb)')
    expect(workflowRule).toContain('var(--v-theme-primary)')
  })

  it('renders colored chips as shadowless glass without flattening their variants', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-chip-backdrop-filter')
    expect(styles).toContain('--glass-chip-sheen')
    expect(styles).toMatch(/\.v-chip\s*\{\s*box-shadow:\s*none\s*!important;\s*\}/)
    expect(styles).toMatch(
      /\.v-chip:is\(\.v-chip--variant-elevated, \.v-chip--variant-flat, \.v-chip--variant-tonal\)\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-chip-backdrop-filter\)\s*!important;[\s\S]*?background-image:\s*var\(--glass-chip-sheen\);/,
    )
    expect(styles).toMatch(
      /\.v-chip\[class\*='bg-'\]\s*\{[\s\S]*?--tw-bg-opacity:\s*var\(--glass-chip-tint-opacity\)\s*!important;/,
    )
    expect(styles).toContain('.v-chip.chip-resolution')
    expect(styles).toContain(
      'background-color: rgba(var(--glass-chip-tint), var(--glass-chip-tint-opacity)) !important',
    )
    expect(styles).not.toContain('.v-chip::after')
    expect(styles).not.toContain(".v-chip:not([class*='border-'])")
    expect(styles).not.toContain('.v-chip--variant-tonal > .v-chip__underlay')
    expect(styles).not.toMatch(/\.v-chip--variant-(?:outlined|text|plain)\s*\{/)
  })

  it('keeps media source links and episode group cards on glass material tokens', () => {
    const mediaDetail = readFileSync(resolve(cwd(), 'src/views/discover/MediaDetailView.vue'), 'utf8')
    const mediaSourceRule = mediaDetail.match(
      /\.media-detail-glass \.media-source-link-chip\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations
    const episodeGroupRule = mediaDetail.match(
      /\.media-detail-glass \.episode-group-option\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations

    expect(mediaDetail.match(/media-source-link-chip/g)).toHaveLength(8)
    expect(mediaSourceRule).toContain('var(--glass-chip-backdrop-filter)')
    expect(mediaSourceRule).toContain('var(--glass-button-surface)')
    expect(mediaSourceRule).toContain('var(--glass-chip-sheen)')
    expect(mediaSourceRule).toContain('var(--glass-control-shadow)')
    expect(episodeGroupRule).toContain('var(--glass-surface-backdrop-filter)')
    expect(episodeGroupRule).toContain('var(--glass-surface)')
    expect(episodeGroupRule).toContain('var(--glass-sheen)')
    expect(episodeGroupRule).toContain('var(--glass-control-shadow)')
  })

  it('keeps workflow share gradients as colored glass in every appearance', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const card = readFileSync(resolve(cwd(), 'src/components/cards/WorkflowShareCard.vue'), 'utf8')

    expect(card).toContain('--workflow-share-gradient-start-rgb')
    expect(card).toContain('--workflow-share-gradient-end-rgb')
    const ruleStart = styles.indexOf('.workflow-share-card {')
    const ruleEnd = styles.indexOf('\n  }', ruleStart)
    const workflowShareCardRule = styles.slice(ruleStart, ruleEnd)
    const expectedLayers = [
      'background-image:',
      'var(--glass-sheen),',
      'var(--workflow-share-glass-scrim),',
      'var(--workflow-share-gradient-start-rgb,',
      'var(--workflow-share-gradient-end-rgb,',
      ') !important;',
    ]

    expect(ruleStart).toBeGreaterThanOrEqual(0)
    expect(ruleEnd).toBeGreaterThan(ruleStart)
    let previousLayerIndex = -1
    for (const layer of expectedLayers) {
      const layerIndex = workflowShareCardRule.indexOf(layer, previousLayerIndex + 1)

      expect(layerIndex).toBeGreaterThan(previousLayerIndex)
      previousLayerIndex = layerIndex
    }
    expect(styles).toContain("&[data-glass-appearance='frosted'] .workflow-share-card")
    expect(styles).toContain("&[data-glass-appearance='tinted'] .workflow-share-card")
  })

  it('paints glass menus and dialogs with their final backdrop material on the first frame', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /:is\(\.v-menu, \.v-dialog\) > \.v-overlay__content\[class\*='-transition-enter-active'\]\s*\{[\s\S]*?opacity:\s*1 !important;[\s\S]*?transform:\s*none !important;[\s\S]*?transition:\s*none !important;/,
    )
    expect(styles).toMatch(
      /:is\(\.v-menu, \.v-dialog\) > \.v-overlay__content\[class\*='-transition-enter-from'\]\s*\{[\s\S]*?opacity:\s*1 !important;[\s\S]*?transform:\s*none !important;/,
    )
    expect(styles).toMatch(
      /:is\(\.v-menu, \.v-dialog\) > \.v-overlay__scrim\.fade-transition-enter-active,[\s\S]*?opacity:\s*var\(--v-overlay-opacity, 0\.32\) !important;[\s\S]*?transition:\s*none !important;/,
    )
  })

  it('uses the shared theme foreground token for confirm dialog actions', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const dialog = readFileSync(resolve(cwd(), 'src/@core/components/ConfirmDialog.vue'), 'utf8')

    expect(dialog).toContain('app-confirm-dialog-actions')
    expect(styles).toContain('--app-confirm-dialog-action-color: rgb(var(--v-theme-on-primary))')
    expect(styles).toMatch(
      /\.app-confirm-dialog-actions \.v-btn\s*\{[\s\S]*?color:\s*var\(--app-confirm-dialog-action-color\)\s*!important;/,
    )
  })

  it('keeps Chromium frosted fixed shells on the stable wallpaper backplate', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const backplate = readFileSync(resolve(cwd(), 'src/components/theme/GlassFixedShellBackplate.vue'), 'utf8')

    expect(styles).toContain('--glass-fixed-shell-backplate-filter: blur(min(var(--glass-blur-raised), 60px))')
    expect(styles).toMatch(
      /&\[data-glass-appearance='frosted'\]\[data-glass-quality='css'\]\s+body\[data-theme='glass'\][\s\S]*?\.layout-wrapper\.layout-fixed-shell-backplate-active \.layout-vertical-nav::before,[\s\S]*?\.layout-wrapper\.layout-fixed-shell-backplate-active \.layout-navbar,[\s\S]*?backdrop-filter:\s*none\s*!important;/,
    )
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\]\[data-glass-quality='balanced'\]\s*\{[\s\S]*?--glass-fixed-shell-backplate-filter:\s*var\(--glass-native-surface-backdrop-filter\);/,
    )
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\]\[data-glass-quality='high'\]\s*\{[\s\S]*?--glass-fixed-shell-backplate-filter:\s*var\(--glass-native-surface-backdrop-filter\);/,
    )
    expect(backplate).toContain('filter: var(--glass-fixed-shell-backplate-filter)')
    expect(backplate).not.toContain('backdrop-filter')
    expect(backplate).toContain('var(--glass-fixed-shell-nav-inline-size) 100%')
    expect(backplate).toContain(
      '.layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav, .layout-app-shell)',
    )
    expect(backplate).toContain('.layout-wrapper.layout-navbar-floating-eligible.layout-navbar-away-from-top')
    expect(backplate).toContain('transform: translate3d(0, var(--shell-floating-navbar-inset), 0)')
    expect(backplate).toContain('scaleX(var(--shell-floating-navbar-scale-x))')
    expect(backplate).toContain('.layout-wrapper.layout-navbar-floating-eligible > .glass-fixed-shell-backplate--main')
    expect(backplate).toContain('.glass-fixed-shell-backplate--overlay-nav')
    const mainBackplateRule = backplate.match(/\.glass-fixed-shell-backplate--main\s*\{(?<declarations>[\s\S]*?)\n\}/u)
      ?.groups?.declarations
    const overlayBackplateRule = backplate.match(
      /\.glass-fixed-shell-backplate--overlay-nav\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations
    const floatingBackplateRule = backplate.match(
      /\.layout-wrapper\.layout-navbar-floating-eligible > \.glass-fixed-shell-backplate--main\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations

    expect(mainBackplateRule).toBeDefined()
    expect(mainBackplateRule).toMatch(/transition:\s*clip-path 240ms var\(--mp-motion-ease-standard\)/u)
    expect(floatingBackplateRule).toContain(
      'transition: transform var(--shell-floating-navbar-motion-duration) var(--shell-floating-navbar-motion-easing)',
    )
    expect(floatingBackplateRule).not.toContain('clip-path')
    expect(overlayBackplateRule).toMatch(/transition:\s*clip-path 0\.25s ease-in-out/u)
  })

  it('keeps desktop sidebar refraction isolated from the attached navbar and mobile Drawer', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const defs = readFileSync(resolve(cwd(), 'src/components/theme/GlassNavbarRefractionDefs.vue'), 'utf8')
    const layout = readFileSync(resolve(cwd(), 'src/@layouts/components/VerticalNavLayout.vue'), 'utf8')

    expect(styles).toContain('--glass-sidebar-live-filter: var(--glass-fixed-shell-backdrop-filter)')
    expect(styles).toContain('--glass-sidebar-diffusion-blur: clamp(')
    expect(styles).toContain('--glass-sidebar-absorption-start: clamp(')
    expect(styles).toContain('--glass-sidebar-absorption-end: clamp(')
    expect(styles).toContain('--glass-sidebar-edge-opacity: clamp(')
    expect(styles).toMatch(
      /\.layout-vertical-nav\s*\{[\s\S]*?&::before\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-sidebar-live-filter\);[\s\S]*?background-image:\s*var\(--glass-sheen\)/,
    )
    expect(styles).toMatch(
      /\.layout-wrapper\[data-glass-navigation-refraction='chromium'\]\[data-glass-sidebar-refraction-ready='true'\][\s\S]*?\.layout-vertical-nav:not\(\.overlay-nav\)\s*\{[\s\S]*?url\('#glass-sidebar-live-refraction-high'\)/,
    )
    expect(styles).toMatch(
      /\.layout-wrapper\[data-glass-navigation-refraction='chromium'\]\[data-glass-sidebar-refraction-ready='true'\][\s\S]*?\.layout-vertical-nav:not\(\.overlay-nav\)\s*\{[\s\S]*?url\('#glass-sidebar-live-refraction-balanced'\)/,
    )
    expect(styles).toMatch(
      /&\[data-glass-appearance='frosted'\]\s*\{[\s\S]*?\.layout-vertical-nav::before\s*\{[\s\S]*?var\(--glass-sidebar-absorption-start\)[\s\S]*?var\(--glass-sidebar-absorption-end\)[\s\S]*?var\(--glass-sidebar-edge-opacity\)/,
    )
    expect(defs).toContain('id="glass-sidebar-live-refraction-balanced"')
    expect(defs).toContain('id="glass-sidebar-live-refraction-high"')
    expect(styles).not.toContain("url('#glass-sidebar-live-refraction-high') var(--glass-fixed-shell-backdrop-filter)")
    expect(styles).toContain('--glass-sidebar-live-filter: none !important')
    expect(styles).toContain('--glass-fixed-shell-backplate-filter: var(--glass-sidebar-backdrop-filter)')
    expect(styles).toContain('--glass-navbar-scrolled-backdrop-filter: none')
    expect(defs).toContain("readyAttribute: 'data-glass-sidebar-refraction-ready'")
    expect(layout).toContain("'data-glass-navigation-refraction': navbarRefractionMode")
    expect(layout).toContain("'data-glass-navbar-refraction': navbarRefractionMode")
    expect(styles).not.toContain(
      ".layout-wrapper[data-glass-navigation-refraction='chromium'][data-glass-sidebar-refraction-ready='true']\n  .layout-navbar",
    )
  })

  it('limits detached navbar geometry to eligible Transparent and Glass horizontal shells', () => {
    const layout = readFileSync(resolve(cwd(), 'src/@layouts/components/VerticalNavLayout.vue'), 'utf8')

    expect(layout).toContain("html:is([data-theme='transparent'], [data-theme='glass'])")
    expect(layout).toContain('--shell-floating-navbar-radius: 1rem')
    expect(layout).toContain('--shell-floating-navbar-inset: 1rem')
    expect(layout).toContain('--shell-floating-navbar-motion-duration: 150ms')
    expect(layout).toContain('--shell-floating-navbar-motion-easing: cubic-bezier(0.2, 0, 0, 1)')
    expect(layout).toContain(
      '.layout-wrapper.layout-nav-type-vertical.layout-navbar-floating-eligible.layout-navbar-away-from-top',
    )
    expect(layout).not.toContain('&.layout-navbar-away-from-top.layout-horizontal-nav-active .layout-navbar')
    expect(layout).toContain('border-radius: var(--shell-floating-navbar-radius)')
    expect(layout).not.toContain('inline-size: calc(100% - 2 * var(--shell-floating-navbar-inset))')
    expect(layout).toContain('transform: translate3d(0, 0, 0) scaleX(1)')
    expect(layout).toContain('scaleX(var(--shell-floating-navbar-scale-x))')
    expect(layout).toContain('scaleX(var(--shell-floating-navbar-content-scale-x))')
    const floatingRuleStart = layout.indexOf(
      '.layout-wrapper.layout-nav-type-vertical.layout-navbar-floating-eligible\n      .layout-navbar {',
    )
    const floatingStateStart = layout.indexOf(
      '.layout-wrapper.layout-nav-type-vertical.layout-navbar-floating-eligible.layout-navbar-away-from-top',
      floatingRuleStart,
    )
    const floatingRule = layout.slice(floatingRuleStart, floatingStateStart)

    expect(floatingRuleStart).toBeGreaterThanOrEqual(0)
    expect(floatingStateStart).toBeGreaterThan(floatingRuleStart)
    expect(floatingRule).not.toContain('inline-size var(--shell-floating-navbar-motion-duration)')
    expect(floatingRule).not.toContain('inset-inline var(--shell-floating-navbar-motion-duration)')
    expect(floatingRule).not.toContain('inset-block-start var(--shell-floating-navbar-motion-duration)')
    expect(layout).toMatch(
      /\.layout-wrapper\.layout-horizontal-nav-active\.layout-horizontal-nav-scrolled\.layout-navbar-fixed \.layout-navbar \{[\s\S]*?backdrop-filter:\s*none;[\s\S]*?background:\s*rgb\(var\(--v-theme-surface\)\) !important;/,
    )
  })

  it('shares the same light frost when glass navbars overlap scrolled content', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('--glass-navbar-scrolled-backdrop-filter: blur(3px) saturate(115%)')
    expect(styles).toMatch(
      /:is\(\[data-glass-appearance='clear'\], \[data-glass-appearance='tinted'\]\)[\s\S]*?\.layout-wrapper\.window-scrolled\.layout-navbar-fixed \.layout-navbar,[\s\S]*?backdrop-filter:\s*var\(--glass-navbar-scrolled-backdrop-filter\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\][\s\S]*?\.layout-wrapper\.window-scrolled\.layout-navbar-fixed \.layout-navbar,[\s\S]*?\.layout-horizontal-nav-scrolled[\s\S]*?backdrop-filter:\s*var\(--glass-navbar-scrolled-backdrop-filter\)\s*!important;/,
    )
  })

  it('reuses the menu overlay material for toast, assistant bubbles and update prompts', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /:where\(\.Vue-Toastification__toast, \.agent-assistant-fab__bubble, \.system-update-prompt\)\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-overlay-backdrop-filter\)\s*!important;[\s\S]*?background-color:\s*var\(--glass-overlay-surface\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\.agent-assistant-fab__bubbles::before\s*\{[\s\S]*?background-color:\s*var\(--glass-overlay-surface\)\s*!important;/,
    )
  })

  it('reuses the popup menu material for compact FAB buttons', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const ruleStart = styles.indexOf('.compact-fab .v-btn {')
    const ruleEnd = styles.indexOf('\n  }', ruleStart)
    const rule = styles.slice(ruleStart, ruleEnd)

    expect(ruleStart).toBeGreaterThanOrEqual(0)
    expect(rule).toContain('border: 1px solid var(--glass-border-raised) !important')
    expect(rule).toContain('backdrop-filter: var(--glass-overlay-backdrop-filter) !important')
    expect(rule).toContain('background-color: var(--glass-overlay-surface) !important')
    expect(rule).toContain('background-image: var(--glass-sheen) !important')
    expect(rule).toContain('box-shadow: var(--glass-shadow-raised) !important')
    expect(styles).toMatch(
      /\.compact-fab \.v-btn:hover\s*\{\s*background-color:\s*var\(--glass-overlay-surface\)\s*!important;/,
    )
  })

  it('uses the shared hover-card contract instead of a Dashboard-specific shadow rule', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toContain('.app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)')
    expect(styles).not.toContain(
      '.dashboard-grid-item-content .app-hover-lift-card:is(:hover, .app-hover-lift-card--hovering)',
    )
  })

  it('hands the CSS fallback to an already rendered canvas without a second opacity transition', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const layerRuleStart = styles.indexOf('.glass-optical-layer {')
    const layerRuleEnd = styles.indexOf('.glass-optical-layer--fixed', layerRuleStart)
    const layerRule = styles.slice(layerRuleStart, layerRuleEnd)

    expect(layerRuleStart).toBeGreaterThanOrEqual(0)
    expect(layerRuleEnd).toBeGreaterThan(layerRuleStart)
    expect(layerRule).toContain('opacity: 0')
    expect(layerRule).not.toMatch(/transition\s*:/)
    expect(styles).toMatch(/\[data-glass-renderer-state='ready'\]\s*\.glass-optical-layer\s*\{\s*opacity:\s*1;/)
  })

  it('keeps the native scroll backplate stable while suspending only GPU dynamics', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const balancedRuleStart = styles.indexOf("html[data-glass-appearance='frosted'][data-glass-quality='balanced'] {")
    const balancedRuleEnd = styles.indexOf('\n}', balancedRuleStart)
    const balancedRule = styles.slice(balancedRuleStart, balancedRuleEnd)
    const highRuleStart = styles.indexOf("html[data-glass-appearance='frosted'][data-glass-quality='high'] {")
    const highRuleEnd = styles.indexOf('\n}', highRuleStart)
    const highRule = styles.slice(highRuleStart, highRuleEnd)

    expect(styles).toContain('--glass-native-surface-backdrop-filter')
    expect(balancedRuleStart).toBeGreaterThanOrEqual(0)
    expect(balancedRuleEnd).toBeGreaterThan(balancedRuleStart)
    expect(balancedRule).toContain('blur(calc(16px * var(--glass-frost-blur-scale, 1))) saturate(162%)')
    expect(balancedRule).toContain('--glass-dashboard-backdrop-filter: var(--glass-native-surface-backdrop-filter)')
    expect(balancedRule).not.toContain('data-glass-renderer-state')
    expect(highRuleStart).toBeGreaterThanOrEqual(0)
    expect(highRuleEnd).toBeGreaterThan(highRuleStart)
    expect(highRule).toContain('blur(calc(10px * var(--glass-frost-blur-scale, 1))) saturate(154%)')
    expect(highRule).toContain('--glass-dashboard-backdrop-filter: var(--glass-native-surface-backdrop-filter)')
    expect(highRule).not.toContain('data-glass-renderer-state')
    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\][\s\S]*?\[data-glass-renderer-state='ready'\]\s*\{[\s\S]*?--glass-surface-backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\);/,
    )
    expect(styles).toMatch(
      /\[data-glass-scroll-presentation='native'\][\s\S]*?\.glass-optical-layer--scroll\s*\{\s*opacity:\s*0\s*!important;/,
    )
    expect(styles).toMatch(
      /\[data-glass-renderer-state='ready'\][\s\S]*?:is\([\s\S]*?\.app-hover-lift-card[\s\S]*?\):not\(\[data-glass-optical-mode='excluded'\]\):not\(\[data-glass-optical-mode='excluded'\] \*\)[\s\S]*?backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).toMatch(
      /\.layout-wrapper:not\(\.layout-fixed-shell-backplate-active\) \.layout-vertical-nav::before,[\s\S]*?backdrop-filter:\s*var\(--glass-native-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).not.toContain('.settings-section-card.app-grouped-list')
    expect(styles).toMatch(
      /\.file-browser-toolbar\.v-toolbar\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-surface-backdrop-filter\)\s*!important;/,
    )
    expect(styles).not.toMatch(
      /\[data-glass-scroll-presentation='native'\][\s\S]*?:where\([\s\S]*?--glass-native-surface-backdrop-filter/,
    )
  })

  it('keeps the audited content surfaces on the shared grouped-list material contract', () => {
    const commonStyles = readFileSync(resolve(cwd(), 'src/styles/common.scss'), 'utf8')
    const transparentStyles = readFileSync(resolve(cwd(), 'src/styles/themes/transparent.scss'), 'utf8')
    const glassStyles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const resourcePage = readFileSync(resolve(cwd(), 'src/pages/resource.vue'), 'utf8')
    const appCenterPage = readFileSync(resolve(cwd(), 'src/pages/appcenter.vue'), 'utf8')

    expect(commonStyles).toContain('--app-grouped-list-backdrop-filter: none')
    expect(transparentStyles).toContain('--app-grouped-list-backdrop-filter: blur(var(--transparent-blur))')
    expect(transparentStyles.match(/--app-grouped-list-backdrop-filter:\s*none/g)).toHaveLength(3)
    expect(glassStyles).toContain('--app-grouped-list-backdrop-filter: var(--glass-surface-backdrop-filter)')

    for (const page of [resourcePage, appCenterPage]) {
      expect(page).toContain('border: var(--app-grouped-list-border)')
      expect(page).toContain('backdrop-filter: var(--app-grouped-list-backdrop-filter)')
      expect(page).toContain('var(--app-grouped-list-background)')
      expect(page).not.toContain('backdrop-filter: blur(10px)')
    }
  })

  it('keeps frosted route opacity static while preserving its short movement', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /\[data-glass-appearance='frosted'\]\[data-page-presentation-motion='active'\]\s+\.mp-page-route\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*translate3d\(0,\s*var\(--mp-page-motion-translate-y,\s*0\),\s*0\);/,
    )
  })

  it('keeps floating clear and tinted navbars on CSS material until Chromium SVG is ready', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')
    const baseMaterialStart = styles.lastIndexOf('// 基础材质由单一真实表面承载')
    const svgEnhancementStart = styles.indexOf('// 只有已确认的 Chromium SVG 能力')
    const reducedTransparencyStart = styles.lastIndexOf('@media (prefers-reduced-transparency: reduce)')
    const reducedMotionStart = styles.lastIndexOf('@media (prefers-reduced-motion: reduce)')
    const tintedNavbarStart = styles.indexOf(
      "html[data-theme='glass'][data-glass-appearance='tinted']",
      svgEnhancementStart,
    )
    const baseMaterialRule = styles.slice(baseMaterialStart, svgEnhancementStart)
    const svgFilterRule = styles.slice(svgEnhancementStart, tintedNavbarStart)
    const reducedTransparencyRule = styles.slice(reducedTransparencyStart, reducedMotionStart)
    const reducedMotionRule = styles.slice(reducedMotionStart)

    expect(baseMaterialStart).toBeGreaterThanOrEqual(0)
    expect(svgEnhancementStart).toBeGreaterThan(baseMaterialStart)
    expect(baseMaterialRule).toContain("[data-glass-appearance='clear'], [data-glass-appearance='tinted']")
    expect(baseMaterialRule).toContain('--glass-navbar-opacity: clamp(')
    expect(baseMaterialRule).toContain(
      '--glass-navbar-reflection-ratio: clamp(0, calc(var(--glass-reflection, 0.38) * 2.6316), 1.7)',
    )
    expect(baseMaterialRule).toContain(
      '--glass-navbar-sheen-opacity: clamp(0, calc(0.18 * var(--glass-navbar-reflection-ratio)), 0.3)',
    )
    expect(baseMaterialRule).toContain(
      '--glass-navbar-rim-opacity: clamp(0, calc(0.24 * var(--glass-navbar-reflection-ratio)), 0.4)',
    )
    expect(baseMaterialRule).toContain(
      '--glass-navbar-top-opacity: clamp(0, calc(0.4 * var(--glass-navbar-reflection-ratio)), 0.65)',
    )
    expect(baseMaterialRule).toContain('var(--glass-background-visibility, 0.58)')
    expect(baseMaterialRule).toContain('var(--glass-surface-density, 0.62)')
    expect(baseMaterialRule).toContain('--glass-navbar-blur: clamp(')
    expect(baseMaterialRule).toContain('0.62px + var(--glass-surface-density, 0.62) * 0.8px')
    expect(baseMaterialRule).toContain('- var(--glass-background-visibility, 0.58) * 0.25px')
    expect(baseMaterialRule).toContain('--glass-navbar-brightness: var(--glass-transmission-brightness, 1)')
    expect(baseMaterialRule).toContain('--glass-navbar-saturation: clamp(')
    expect(baseMaterialRule).toContain('--glass-navbar-sheen: linear-gradient(')
    expect(baseMaterialRule).toContain('var(--glass-navbar-reflection-ratio)')
    expect(baseMaterialRule).toContain('--glass-navbar-scrim: linear-gradient(')
    expect(baseMaterialRule).toContain(
      '--glass-navbar-tint: clamp(0, calc(var(--glass-tint-density, 0.65) * 0.12), 0.18)',
    )
    expect(baseMaterialRule).toContain('--glass-navbar-live-filter: blur(var(--glass-navbar-blur))')
    expect(baseMaterialRule).toContain('brightness(var(--glass-navbar-brightness))')
    expect(baseMaterialRule).toContain('background: var(--glass-navbar-sheen), var(--glass-navbar-scrim) !important')
    expect(baseMaterialRule).toContain('box-shadow: var(--glass-navbar-shadow) !important')
    expect(baseMaterialRule).toContain('border: 0 !important')
    expect(baseMaterialRule).toContain('inset-block-start: var(--shell-floating-navbar-inset) !important')
    expect(baseMaterialRule).toContain('inset-inline: var(--shell-floating-navbar-inset) !important')
    expect(baseMaterialRule).not.toContain('data-glass-navbar-refraction-ready')
    expect(baseMaterialRule).not.toContain('&::before')
    expect(baseMaterialRule).not.toContain('&::after')
    expect(baseMaterialRule).not.toContain("url('#glass-navbar-live-refraction-")
    expect(svgFilterRule).toContain("data-glass-navbar-refraction-ready='true'")
    expect(svgFilterRule).toContain("url('#glass-navbar-live-refraction-balanced')")
    expect(svgFilterRule).toContain("url('#glass-navbar-live-refraction-high')")
    expect(svgFilterRule).toContain('blur(var(--glass-navbar-blur))')
    expect(svgFilterRule).toContain('saturate(var(--glass-navbar-saturation))')
    expect(svgFilterRule).toContain('brightness(var(--glass-navbar-brightness))')
    expect(svgFilterRule).not.toContain('background:')
    expect(svgFilterRule).not.toContain('box-shadow:')
    expect(svgFilterRule).not.toContain('border:')
    expect(tintedNavbarStart).toBeGreaterThan(svgEnhancementStart)
    expect(styles.slice(tintedNavbarStart, reducedTransparencyStart)).toContain('var(--glass-material-accent-rgb)')
    expect(styles.slice(tintedNavbarStart, reducedTransparencyStart)).toContain('var(--glass-navbar-tint)')
    expect(reducedTransparencyRule).toContain('--glass-navbar-live-filter: none !important')
    expect(reducedTransparencyRule).toContain('-webkit-backdrop-filter: none !important')
    expect(reducedTransparencyRule).toContain('backdrop-filter: none !important')
    expect(reducedTransparencyRule).toContain('background: rgb(11, 19, 34) !important')
    expect(reducedTransparencyRule).toContain('background-image: none !important')
    expect(reducedMotionRule).toContain('.layout-navbar')
    expect(reducedMotionRule).toContain('.navbar-content-container')
    expect(reducedMotionRule).toContain('transition: none !important')
    expect(reducedMotionRule).not.toContain('inset-block-start: 0 !important')
    expect(reducedMotionRule).not.toContain('inset-inline: 0 !important')
  })
})
