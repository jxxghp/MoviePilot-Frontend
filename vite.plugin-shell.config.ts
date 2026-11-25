import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { federation } from '@module-federation/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import vuetify from 'vite-plugin-vuetify'
import { responsiveInputCoreComponentNames } from './src/plugins/vuetify/responsiveInputNames'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }
const buildTime = Date.now().toString()

/**
 * 极简本地联邦运行时壳（plugin-shell）构建配置：
 * - 与主 SPA 完全解耦，仅打包 Vue 3 + Vuetify 3 + Module Federation Runtime + 轻量宿主 SDK + 视觉融合层；
 * - 保留 shared: ['vue', 'vuetify'] 与 name: 'MoviePilot'，零改动兼容所有存量与社区联邦插件。
 */
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [
    vue(),
    vueJsx(),
    vuetify({
      autoImport: {
        ignore: ['VMenu', ...responsiveInputCoreComponentNames],
      },
      styles: {
        configFile: 'src/styles/variables/_vuetify.scss',
      },
    }),
    federation({
      name: 'MoviePilot',
      filename: 'remoteEntry.js',
      remotes: {},
      shared: ['vue', 'vuetify'],
    }),
    topLevelAwait({
      promiseExportName: '__mp_tla',
      promiseImportName: i => `__mp_tla_${i}`,
    }),
  ],
  define: {
    'process.env': {},
    '__APP_VERSION__': JSON.stringify(`v${packageJson.version}`),
    '__BUILD_TIME__': JSON.stringify(buildTime),
    '__PWA_DEVELOPMENT__': JSON.stringify(false),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/@core', import.meta.url)),
      '@layouts': fileURLToPath(new URL('./src/@layouts', import.meta.url)),
      '@images': fileURLToPath(new URL('./src/assets/images/', import.meta.url)),
      '@styles': fileURLToPath(new URL('./src/styles/', import.meta.url)),
      '@configured-variables': fileURLToPath(new URL('./src/styles/variables/_template.scss', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist-plugin-shell',
    emptyOutDir: true,
    assetsDir: 'assets',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: resolve(__dirname, 'plugin-shell.html'),
    },
  },
  optimizeDeps: {
    entries: ['./plugin-shell.html'],
    exclude: ['vuetify'],
  },
})
