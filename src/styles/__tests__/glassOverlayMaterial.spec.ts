import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

describe('glass overlay material styles', () => {
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
      /&\[data-glass-appearance='frosted'\]\[data-glass-quality='css'\][\s\S]*?\.layout-wrapper\.layout-fixed-shell-backplate-active \.layout-vertical-nav::before,[\s\S]*?\.layout-wrapper\.layout-fixed-shell-backplate-active \.layout-navbar,[\s\S]*?backdrop-filter:\s*none\s*!important;/,
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
    expect(backplate).toContain('.layout-wrapper:is(.layout-horizontal-nav-active, .layout-overlay-nav)')
    expect(backplate).toContain('.glass-fixed-shell-backplate--overlay-nav')
    const mainBackplateRule = backplate.match(/\.glass-fixed-shell-backplate--main\s*\{(?<declarations>[\s\S]*?)\n\}/u)
      ?.groups?.declarations
    const overlayBackplateRule = backplate.match(
      /\.glass-fixed-shell-backplate--overlay-nav\s*\{(?<declarations>[\s\S]*?)\n\}/u,
    )?.groups?.declarations

    expect(mainBackplateRule).toBeDefined()
    expect(mainBackplateRule).not.toMatch(/transition:\s*clip-path/u)
    expect(overlayBackplateRule).toMatch(/transition:\s*clip-path 0\.25s ease-in-out/u)
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

  it('reuses the menu overlay material for toast and assistant bubbles', () => {
    const styles = readFileSync(resolve(cwd(), 'src/styles/themes/glass.scss'), 'utf8')

    expect(styles).toMatch(
      /:where\(\.Vue-Toastification__toast, \.agent-assistant-fab__bubble\)\s*\{[\s\S]*?backdrop-filter:\s*var\(--glass-overlay-backdrop-filter\)\s*!important;[\s\S]*?background-color:\s*var\(--glass-overlay-surface\)\s*!important;/,
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
})
