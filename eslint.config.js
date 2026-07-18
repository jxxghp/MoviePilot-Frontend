import js from '@eslint/js'
import sonarjs from 'eslint-plugin-sonarjs'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const javascriptFiles = ['**/*.{js,mjs,cjs,jsx}']

const typescriptFiles = ['**/*.{ts,tsx,mts,cts}', '**/*.vue']

const managedScriptExtensions = 'js,mjs,cjs,jsx,ts,tsx,mts,cts'

const managedFiles = [...javascriptFiles, ...typescriptFiles]

const browserFiles = [
  `src/**/*.{${managedScriptExtensions},vue}`,
  `examples/**/src/**/*.{${managedScriptExtensions},vue}`,
]

const nodeFiles = ['**/*.config.{js,mjs,cjs,ts,mts,cts}', 'public/service.js', 'scripts/**/*.{js,mjs,cjs,ts,mts,cts}']

// TypeScript 关闭核心 no-undef；显式禁止浏览器域中的 Node-only globals，保证 JS、TS 与 Vue 使用同一运行时边界。
const browserGlobalNames = new Set(Object.keys(globals.browser))
const nodeOnlyGlobalRestrictions = Object.keys(globals.node)
  .filter(name => !browserGlobalNames.has(name))
  .sort()
  .map(name => ({
    name,
    message: `'${name}' is only available in Node.js code.`,
  }))

const restrictedCoreSourcePattern = '/(?:^|\\/)@core(?:\\/|$)/'

// @layouts 是 @core 的下游依赖；禁止反向引用，避免两层形成直接循环。
const layoutCoreImportRestrictions = [
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportExpression',
].map(nodeType => ({
  selector: `${nodeType}[source.value=${restrictedCoreSourcePattern}]`,
  message: "The '@layouts' module must not import from '@core'.",
}))

const nonLiteralLayoutDynamicImportRestriction = {
  selector: "ImportExpression:not([source.type='Literal'])",
  message: 'Dynamic imports in @layouts must use a literal path so module boundaries remain statically verifiable.',
}

const viteGlobCallSelectors = [
  "CallExpression[callee.object.type='MetaProperty'][callee.object.meta.name='import'][callee.object.property.name='meta'][callee.property.name=/^glob(?:Eager)?$/]",
  "CallExpression[callee.object.type='MetaProperty'][callee.object.meta.name='import'][callee.object.property.name='meta'][callee.property.value=/^glob(?:Eager)?$/]",
]

const layoutGlobRestrictions = viteGlobCallSelectors.map(callSelector => ({
  selector: callSelector,
  message:
    'import.meta.glob is not allowed in @layouts because wildcard targets cannot be proven to stay within the module boundary.',
}))

const sonarRules = {
  'sonarjs/array-callback-without-return': 'error',
  'sonarjs/code-eval': 'error',
  'sonarjs/empty-string-repetition': 'error',
  'sonarjs/no-all-duplicated-branches': 'error',
  'sonarjs/no-dead-store': 'error',
  'sonarjs/no-duplicated-branches': 'error',
  'sonarjs/no-element-overwrite': 'error',
  'sonarjs/no-hardcoded-passwords': 'error',
  'sonarjs/no-hardcoded-secrets': 'error',
  'sonarjs/no-identical-conditions': 'error',
  'sonarjs/no-identical-expressions': 'error',
  'sonarjs/no-ignored-exceptions': 'error',
  'sonarjs/no-unthrown-error': 'error',
  'sonarjs/no-use-of-empty-return-value': 'error',
  'sonarjs/reduce-initial-value': 'error',
  'sonarjs/slow-regex': 'error',
  'sonarjs/stateful-regex': 'error',
  'sonarjs/super-linear-regex': 'error',
}

const typescriptConfigs = tseslint.configs.recommended.map(config => ({
  ...config,
  files: typescriptFiles,
}))

const vueConfigs = pluginVue.configs['flat/essential'].map(config => ({
  ...config,
  files: ['**/*.vue'],
}))

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/dev-dist/**',
    '**/coverage/**',
    '**/.worktrees/**',
    '**/vite.config.*.timestamp-*.mjs',
    'public/plugin_icon/**',
    'src/@iconify/**',
    '**/*.d.ts',
  ]),
  {
    ...js.configs.recommended,
    name: 'moviepilot/javascript',
    files: managedFiles,
  },
  ...typescriptConfigs,
  ...vueConfigs,
  {
    name: 'moviepilot/vue-contracts',
    files: ['**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/valid-v-slot': [
        'error',
        {
          allowModifiers: true,
        },
      ],
    },
  },
  {
    name: 'moviepilot/language-options',
    files: managedFiles,
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    name: 'moviepilot/browser-globals',
    files: browserFiles,
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-globals': ['error', ...nodeOnlyGlobalRestrictions],
    },
  },
  {
    name: 'moviepilot/node-globals',
    files: nodeFiles,
    languageOptions: {
      globals: globals.node,
    },
    // Node 配置可能位于浏览器源码目录；显式覆盖浏览器专用限制，避免 flat config 合并后误报。
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    name: 'moviepilot/sonarjs',
    files: managedFiles,
    plugins: {
      sonarjs,
    },
    rules: sonarRules,
  },
  {
    name: 'moviepilot/sonarjs-locales',
    files: [`src/locales/**/*.{${managedScriptExtensions}}`],
    rules: {
      'sonarjs/no-hardcoded-passwords': 'off',
      'sonarjs/no-hardcoded-secrets': 'off',
    },
  },
  {
    name: 'moviepilot/source-hygiene',
    files: managedFiles,
    rules: {
      'no-debugger': 'error',
    },
  },
  {
    name: 'moviepilot/layout-boundary',
    files: [`src/@layouts/**/*.{${managedScriptExtensions},vue}`],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...layoutCoreImportRestrictions,
        ...layoutGlobRestrictions,
        nonLiteralLayoutDynamicImportRestriction,
      ],
    },
  },
])
