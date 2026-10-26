import { compileString } from 'sass'
import { cwd } from 'node:process'
import { expect, it } from 'vitest'

it('固定暗底提示的编译前景不受主色前景变化影响', () => {
  const css = compileString(
    '@use "src/@core/scss/libs/vuetify/variables"; @use "vuetify/lib/components/VTooltip/VTooltip"; @use "vuetify/lib/components/VSnackbar/VSnackbar";',
    { loadPaths: [cwd(), `${cwd()}/node_modules`], quietDeps: true, logger: { warn() {}, debug() {} } },
  ).css
  const tooltip = css.match(/\.v-tooltip > \.v-overlay__content\s*\{([^}]+)\}/)?.[1]
  expect(tooltip).toContain('background: #212121')
  expect(tooltip).toMatch(/color: (#fff(?:fff)?|rgb\(255, 255, 255\))/)
  // 默认 Snackbar 的暗底同样应使用独立于 on-primary 的浅色。
  expect(css).not.toContain('color: rgb(var(--v-theme-on-primary))')
  expect(css).toContain('background: #212121')
})
