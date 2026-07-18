import { ESLint } from 'eslint'
import globals from 'globals'
import { expect, it } from 'vitest'

const eslint = new ESLint()
const restrictedSyntaxRule = 'no-restricted-syntax'
const restrictedGlobalsRule = 'no-restricted-globals'
const unusedVariablesRule = '@typescript-eslint/no-unused-vars'
const browserGlobalNames = new Set(Object.keys(globals.browser))
const nodeOnlyGlobalNames = Object.keys(globals.node)
  .filter(name => !browserGlobalNames.has(name))
  .sort()

/** 使用真实 flat config 检查虚拟源码，避免项目边界和新增问题门禁在依赖升级时静默丢失。 */
async function lintRuleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })

  return result.messages.map(message => message.ruleId)
}

const cases = [
  {
    name: '允许图片使用通用源码别名',
    code: "import '@/assets/images/example.png'",
    filePath: 'src/components/valid-image-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: false,
  },
  {
    name: '允许动态样式使用通用源码别名',
    code: "import('@/styles/example.scss')",
    filePath: 'src/components/valid-dynamic-style-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: false,
  },
  {
    name: '拒绝 layouts 反向依赖 core',
    code: "import '@core/utils'",
    filePath: 'src/@layouts/invalid-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '允许普通组件依赖 core',
    code: "import '@core/utils'",
    filePath: 'src/components/valid-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: false,
  },
  {
    name: '拒绝 layouts 通过通用别名反向依赖 core',
    code: "import '@/@core/utils'",
    filePath: 'src/@layouts/invalid-generic-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 通过相对路径反向依赖 core',
    code: "import '../../@core/utils'",
    filePath: 'src/@layouts/components/invalid-relative-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 通过归一化相对路径反向依赖 core',
    code: "import './../@core/utils'",
    filePath: 'src/@layouts/invalid-normalized-relative-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 通过折返路径反向依赖 core',
    code: "import '../../@layouts/../@core/utils'",
    filePath: 'src/@layouts/components/invalid-detour-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 动态反向依赖 core',
    code: "import('@/@core/utils')",
    filePath: 'src/@layouts/invalid-dynamic-core-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 使用无法静态验证边界的动态路径',
    code: "const file = 'utils'; import(`../@core/${file}.ts`)",
    filePath: 'src/@layouts/invalid-template-dynamic-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '允许 layouts 使用边界内的字面量动态路径',
    code: "import('../utils')",
    filePath: 'src/@layouts/valid-literal-dynamic-import.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: false,
  },
  {
    name: '拒绝 layouts 通过 Vite glob 反向加载 core',
    code: "import.meta.glob('../@core/**/*.ts')",
    filePath: 'src/@layouts/invalid-core-glob.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 通过 Vite glob 数组反向加载 core',
    code: "import.meta.glob(['../utils/*.ts', '../../@core/**/*.ts'])",
    filePath: 'src/@layouts/components/invalid-core-glob-array.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 通过通用别名 Vite glob 反向加载 core',
    code: "import.meta.glob('@/@core/**/*.ts')",
    filePath: 'src/@layouts/invalid-alias-core-glob.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 使用无法证明边界安全的 Vite glob',
    code: "import.meta.glob('../utils/*.ts')",
    filePath: 'src/@layouts/invalid-layout-glob.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 layouts 使用可能跨越到 core 的通配 glob',
    code: "import.meta.glob('../*/**/*.ts')",
    filePath: 'src/@layouts/invalid-cross-boundary-glob.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '允许普通源码使用 Vite glob',
    code: "import.meta.glob('../views/**/*.vue')",
    filePath: 'src/components/valid-vite-glob.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: false,
  },
  {
    name: '拒绝 layouts 通过通用别名折返到 core',
    code: "export * from '@/@layouts/../@core/utils'",
    filePath: 'src/@layouts/invalid-alias-detour-core-export.ts',
    ruleId: restrictedSyntaxRule,
    shouldReport: true,
  },
  {
    name: '拒绝 baseline 之外的普通 lint 问题',
    code: 'const newUnusedValue = 1',
    filePath: 'src/components/new-lint-violation.ts',
    ruleId: unusedVariablesRule,
    shouldReport: true,
  },
  {
    name: '拒绝 TypeScript 源码保留 debugger',
    code: 'debugger',
    filePath: 'src/components/invalid-debugger.ts',
    ruleId: 'no-debugger',
    shouldReport: true,
  },
  {
    name: '拒绝浏览器 JavaScript 使用 Node 全局变量',
    code: 'process.env.NODE_ENV',
    filePath: 'src/components/invalid-node-global.js',
    ruleId: 'no-undef',
    shouldReport: true,
  },
  {
    name: '拒绝浏览器 Vue 脚本使用 Node 全局变量',
    code: '<script setup lang="ts">const bytes = Buffer.from("x")</script><template>{{ bytes }}</template>',
    filePath: 'src/components/invalid-node-global.vue',
    ruleId: restrictedGlobalsRule,
    shouldReport: true,
  },
  {
    name: '允许构建配置使用 Node 全局变量',
    code: 'process.env.NODE_ENV',
    filePath: 'example.config.js',
    ruleId: 'no-undef',
    shouldReport: false,
  },
  {
    name: '允许 TypeScript 构建配置使用 Node 全局变量',
    code: 'const runtime: string | undefined = process.env.NODE_ENV; console.log(runtime)',
    filePath: 'example.config.mts',
    ruleId: restrictedGlobalsRule,
    shouldReport: false,
  },
  {
    name: '允许浏览器目录中的 Node 配置使用 Node 全局变量',
    code: 'const runtime: string | undefined = process.env.NODE_ENV; console.log(runtime)',
    filePath: 'src/tool.config.ts',
    ruleId: restrictedGlobalsRule,
    shouldReport: false,
  },
  {
    name: '拒绝 MTS 脚本保留 debugger',
    code: 'const value: string = "x"; console.log(value); debugger',
    filePath: 'scripts/invalid-debugger.mts',
    ruleId: 'no-debugger',
    shouldReport: true,
  },
  {
    name: '拒绝 CTS 脚本保留 debugger',
    code: 'const value: string = "x"; console.log(value); debugger',
    filePath: 'scripts/invalid-debugger.cts',
    ruleId: 'no-debugger',
    shouldReport: true,
  },
  {
    name: '允许 Vuetify 点号 slot 名称',
    code: '<template><VDataTable><template #item.name /></VDataTable></template>',
    filePath: 'src/components/valid-vuetify-slot.vue',
    ruleId: 'vue/valid-v-slot',
    shouldReport: false,
  },
  {
    name: '允许界面效果使用伪随机数',
    code: 'export const randomOffset = Math.random()',
    filePath: 'src/components/valid-ui-random.ts',
    ruleId: 'sonarjs/pseudo-random',
    shouldReport: false,
  },
  {
    name: '拒绝动态执行代码',
    code: 'export const runCode = (source: string) => new Function(source)()',
    filePath: 'src/components/invalid-dynamic-code.ts',
    ruleId: 'sonarjs/code-eval',
    shouldReport: true,
  },
]

it.each(cases)('$name', async ({ code, filePath, ruleId, shouldReport }) => {
  const ruleIds = await lintRuleIds(code, filePath)

  expect(ruleIds.includes(ruleId)).toBe(shouldReport)
})

it.each(nodeOnlyGlobalNames)('拒绝浏览器 TypeScript 使用 Node 全局变量 %s', async globalName => {
  const ruleIds = await lintRuleIds(`console.log(${globalName})`, `src/components/invalid-${globalName}.ts`)

  expect(ruleIds).toContain(restrictedGlobalsRule)
})

it.each(['example.config.mts', 'example.config.cts', 'scripts/example.mts', 'scripts/example.cts'])(
  '使用 TypeScript parser 解析 %s',
  async filePath => {
    const ruleIds = await lintRuleIds('const value: string = "x"; console.log(value)', filePath)

    expect(ruleIds).not.toContain(null)
  },
)

it('忽略 Vite 生成的临时配置模块', async () => {
  await expect(eslint.isPathIgnored('vite.config.ts.timestamp-1784340502076-0129cef6d3bbd8.mjs')).resolves.toBe(true)
})

it('忽略 Vite PWA 开发构建产物', async () => {
  await expect(eslint.isPathIgnored('dev-dist/registerSW.js')).resolves.toBe(true)
})

it('不忽略普通 MJS 源码', async () => {
  await expect(eslint.isPathIgnored('scripts/example.mjs')).resolves.toBe(false)
})

it('不忽略名称包含 timestamp 的普通 MJS 源码', async () => {
  await expect(eslint.isPathIgnored('scripts/feature.timestamp-parser.mjs')).resolves.toBe(false)
})
