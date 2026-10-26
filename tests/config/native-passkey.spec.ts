import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
let pages: { native: string; main: string }

/** 在独立 Node 进程使用 Vite 实际解析的插件顺序，避免 jsdom 与 esbuild 字节类型跨 realm。 */
beforeAll(() => {
  const script = `
    import { resolveConfig, transformWithEsbuild } from 'vite'
    import { readFileSync } from 'node:fs'
    import { VitePWA } from 'vite-plugin-pwa'
    const { code } = await transformWithEsbuild(readFileSync('./scripts/native-passkey.ts', 'utf8'), 'native-passkey.ts')
    const { nativePasskeyPage } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
    const config = await resolveConfig({
      configFile: false,
      plugins: [VitePWA({ injectRegister: false, manifest: { name: 'MoviePilot' } }), nativePasskeyPage()],
    }, 'build')
    const plugins = config.plugins.filter(plugin =>
      ['vite-plugin-pwa:build', 'moviepilot-native-passkey-page'].includes(plugin.name))
    if (plugins.length !== 2) throw new Error('Expected both production HTML plugins')
    async function transform(path) {
      let html = '<html><head><link rel="stylesheet" href="/app.css"></head><body></body></html>'
      for (const plugin of plugins) {
        const hook = plugin.transformIndexHtml
        const handler = hook.handler ?? hook.transform
        html = await handler(html, { path, filename: path })
        if (typeof html !== 'string') throw new Error('Expected production HTML')
      }
      return html
    }
    console.log(JSON.stringify({ native: await transform('/native-passkey.html'), main: await transform('/index.html') }))
  `
  pages = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: projectRoot, encoding: 'utf8' }),
  )
})

describe('独立通行密钥入口的生产插件顺序', () => {
  it('在 VitePWA 注入之后移除验证页的 manifest 与共享样式', () => {
    expect(pages.native).not.toContain('rel="manifest"')
    expect(pages.native).not.toContain('rel="stylesheet"')
  })

  it('保留主入口的 PWA manifest 和共享样式', () => {
    expect(pages.main).toContain('rel="manifest"')
    expect(pages.main).toContain('rel="stylesheet"')
  })
})
