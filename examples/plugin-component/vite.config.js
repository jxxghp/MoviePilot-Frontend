import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { federation } from '@module-federation/vite'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'MyPlugin',
      // 保持 OriginJS 时期的入口地址 dist/assets/remoteEntry.js，宿主与后端按该路径加载插件。
      filename: 'assets/remoteEntry.js',
      exposes: {
        './Page': './src/components/Page.vue',
        './Config': './src/components/Config.vue',
        './Dashboard': './src/components/Dashboard.vue',
        './AppPage': './src/components/AppPage.vue',
        './AppPageSettings': './src/components/AppPageSettings.vue',
      },
      // 示例插件不发布联邦类型。
      dts: false,
      shared: {
        vue: {
          requiredVersion: false,
          import: false,
        },
        vuetify: {
          requiredVersion: false,
          import: false,
          singleton: true,
        },
        'vuetify/styles': {
          requiredVersion: false,
          import: false,
          singleton: true,
        },
      },
    }),
  ],
  build: {
    target: 'esnext', // 必须设置为esnext以支持顶层await
    minify: false, // 开发阶段建议关闭混淆
    cssCodeSplit: true, // 改为true以便能分离样式文件
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '/* 覆盖vuetify样式 */',
      },
    },
    postcss: {
      plugins: [
        {
          postcssPlugin: 'internal:charset-removal',
          AtRule: {
            charset: atRule => {
              if (atRule.name === 'charset') {
                atRule.remove()
              }
            },
          },
        },
        {
          postcssPlugin: 'vuetify-filter',
          Root(root) {
            // 过滤掉所有vuetify相关的CSS
            root.walkRules(rule => {
              if (rule.selector && (rule.selector.includes('.v-') || rule.selector.includes('.mdi-'))) {
                rule.remove()
              }
            })
          },
        },
      ],
    },
  },
  server: {
    port: 5001, // 使用不同于主应用的端口
    cors: true, // 启用CORS
    origin: 'http://localhost:5001',
  },
})
