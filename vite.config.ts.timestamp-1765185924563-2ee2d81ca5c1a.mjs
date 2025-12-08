// vite.config.ts
import { fileURLToPath } from "node:url";
import vue from "file:///C:/Repos/MoviePilot-Frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import vueJsx from "file:///C:/Repos/MoviePilot-Frontend/node_modules/@vitejs/plugin-vue-jsx/dist/index.mjs";
import AutoImport from "file:///C:/Repos/MoviePilot-Frontend/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///C:/Repos/MoviePilot-Frontend/node_modules/unplugin-vue-components/dist/vite.js";
import { defineConfig } from "file:///C:/Repos/MoviePilot-Frontend/node_modules/vite/dist/node/index.js";
import vuetify from "file:///C:/Repos/MoviePilot-Frontend/node_modules/vite-plugin-vuetify/dist/index.mjs";
import { VitePWA } from "file:///C:/Repos/MoviePilot-Frontend/node_modules/vite-plugin-pwa/dist/index.js";
import VueI18n from "file:///C:/Repos/MoviePilot-Frontend/node_modules/@intlify/unplugin-vue-i18n/lib/vite.mjs";
import { resolve } from "node:path";
import federation from "file:///C:/Repos/MoviePilot-Frontend/node_modules/@originjs/vite-plugin-federation/dist/index.mjs";
import topLevelAwait from "file:///C:/Repos/MoviePilot-Frontend/node_modules/vite-plugin-top-level-await/exports/import.mjs";
var __vite_injected_original_dirname = "C:\\Repos\\MoviePilot-Frontend";
var __vite_injected_original_import_meta_url = "file:///C:/Repos/MoviePilot-Frontend/vite.config.ts";
var vite_config_default = defineConfig({
  base: "./",
  plugins: [
    vue(),
    vueJsx(),
    vuetify({
      styles: {
        configFile: "src/styles/variables/_vuetify.scss"
      }
    }),
    Components({
      dirs: ["src/@core/components"],
      dts: true
    }),
    AutoImport({
      imports: ["vue", "vue-router", "@vueuse/core", "@vueuse/math", "pinia", "vue-i18n"],
      vueTemplate: true
    }),
    VueI18n({
      include: [resolve(__vite_injected_original_dirname, "src/locales/*.ts")]
    }),
    federation({
      name: "MoviePilot",
      filename: "remoteEntry.js",
      // @ts-ignore
      remotes: {
        // 动态remotes将在运行时注入
        dummy: {
          external: "",
          format: "var"
        }
      },
      shared: ["vue", "vuetify"]
    }),
    VitePWA({
      injectRegister: "script",
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,ttf,otf,eot}"],
        // 确保关键资源被预缓存
        additionalManifestEntries: [
          {
            url: "/offline.html",
            revision: null
          },
          // 预缓存App Shell关键资源
          {
            url: "/logo.png",
            revision: null
          }
        ],
        // 启用导航预加载
        navigationPreload: true,
        runtimeCaching: [
          // App Shell缓存 - 优先缓存
          {
            urlPattern: /^\/$|\/index\.html$/,
            handler: "CacheFirst",
            options: {
              cacheName: "app-shell-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 7 * 24 * 60 * 60
                // 7天
              }
            }
          },
          {
            urlPattern: /\.(?:js|css|html)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources"
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|ico|webp|avif|gif|bmp|tiff)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 30 * 24 * 60 * 60
                // 30天
              }
            }
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 365 * 24 * 60 * 60
                // 1年
              }
            }
          },
          {
            urlPattern: /\/api\/v1\/.*$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 24 * 60 * 60
                // 24小时
              }
            }
          },
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tmdb-image-cache",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 7 * 24 * 60 * 60
                // 7天
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "pages-cache"
            }
          }
        ],
        navigateFallback: "/offline.html",
        navigateFallbackDenylist: [/.*\/api\/.*/, /\/offline\.html$/],
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^gclid$/],
        skipWaiting: true,
        clientsClaim: true
      },
      injectManifest: {
        rollupFormat: "iife",
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      },
      devOptions: {
        enabled: true,
        type: "module"
      },
      manifest: {
        "name": "MoviePilot",
        "short_name": "MoviePilot",
        "description": "MoviePilot - \u667A\u80FD\u5F71\u89C6\u5A92\u4F53\u5E93\u7BA1\u7406\u5DE5\u5177",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "display_override": ["window-controls-overlay", "standalone"],
        "orientation": "portrait-primary",
        "lang": "zh-CN",
        "dir": "ltr",
        "categories": ["entertainment", "multimedia", "utilities"],
        "icons": [
          {
            "src": "./android-chrome-192x192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "./android-chrome-192x192_maskable.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "maskable"
          },
          {
            "src": "./android-chrome-512x512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any"
          },
          {
            "src": "./android-chrome-512x512_maskable.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable"
          }
        ],
        "theme_color": "#0E1116",
        "background_color": "#0E1116",
        "edge_side_panel": {
          "preferred_width": 320
        },
        "launch_handler": {
          "client_mode": "navigate-existing"
        },
        "handle_links": "preferred",
        "id": "moviepilot-app",
        "shortcuts": [
          {
            "name": "\u63A8\u8350",
            "short_name": "\u63A8\u8350",
            "description": "\u67E5\u770B\u63A8\u8350\u5185\u5BB9",
            "url": "./recommend",
            "icons": [
              {
                "src": "./sparkles-icon-192x192.png",
                "sizes": "192x192",
                "type": "image/png"
              }
            ]
          },
          {
            "name": "\u63A2\u7D22",
            "short_name": "\u63A2\u7D22",
            "description": "\u63A2\u7D22\u65B0\u5185\u5BB9",
            "url": "./discover",
            "icons": [
              {
                "src": "./clock-icon-192x192.png",
                "sizes": "192x192",
                "type": "image/png"
              }
            ]
          },
          {
            "name": "\u66F4\u591A",
            "short_name": "\u66F4\u591A",
            "description": "\u66F4\u591A\u529F\u80FD",
            "url": "./apps",
            "icons": [
              {
                "src": "./cog-icon-192x192.png",
                "sizes": "192x192",
                "type": "image/png"
              }
            ]
          }
        ],
        "screenshots": [
          {
            "src": "./android-chrome-512x512.png",
            "sizes": "512x512",
            "type": "image/png",
            "form_factor": "wide",
            "label": "MoviePilot \u4E3B\u754C\u9762"
          },
          {
            "src": "./android-chrome-192x192.png",
            "sizes": "192x192",
            "type": "image/png",
            "form_factor": "narrow",
            "label": "MoviePilot \u79FB\u52A8\u7AEF"
          }
        ],
        "protocol_handlers": [
          {
            "protocol": "web+moviepilot",
            "url": "./?handler=%s"
          }
        ],
        "prefer_related_applications": false,
        "related_applications": []
      }
    }),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: "__mp_tla",
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__mp_tla_${i}`
    })
  ],
  define: { "process.env": {} },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url)),
      "@core": fileURLToPath(new URL("./src/@core", __vite_injected_original_import_meta_url)),
      "@layouts": fileURLToPath(new URL("./src/@layouts", __vite_injected_original_import_meta_url)),
      "@images": fileURLToPath(new URL("./src/assets/images/", __vite_injected_original_import_meta_url)),
      "@styles": fileURLToPath(new URL("./src/styles/", __vite_injected_original_import_meta_url)),
      "@configured-variables": fileURLToPath(new URL("./src/styles/variables/_template.scss", __vite_injected_original_import_meta_url)),
      "apexcharts": fileURLToPath(new URL("node_modules/apexcharts", __vite_injected_original_import_meta_url))
    }
  },
  build: {
    target: "esnext",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    chunkSizeWarningLimit: 5e3,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js"
      }
    }
  },
  optimizeDeps: {
    exclude: ["vuetify"],
    entries: ["./src/**/*.vue"]
  },
  server: {
    proxy: {
      "/api/v1": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost"
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxSZXBvc1xcXFxNb3ZpZVBpbG90LUZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxSZXBvc1xcXFxNb3ZpZVBpbG90LUZyb250ZW5kXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9SZXBvcy9Nb3ZpZVBpbG90LUZyb250ZW5kL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJ1xyXG5pbXBvcnQgdnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSdcclxuaW1wb3J0IHZ1ZUpzeCBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUtanN4J1xyXG5pbXBvcnQgQXV0b0ltcG9ydCBmcm9tICd1bnBsdWdpbi1hdXRvLWltcG9ydC92aXRlJ1xyXG5pbXBvcnQgQ29tcG9uZW50cyBmcm9tICd1bnBsdWdpbi12dWUtY29tcG9uZW50cy92aXRlJ1xyXG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xyXG5pbXBvcnQgdnVldGlmeSBmcm9tICd2aXRlLXBsdWdpbi12dWV0aWZ5J1xyXG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJ1xyXG5pbXBvcnQgVnVlSTE4biBmcm9tICdAaW50bGlmeS91bnBsdWdpbi12dWUtaTE4bi92aXRlJ1xyXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJ1xyXG5pbXBvcnQgZmVkZXJhdGlvbiBmcm9tICdAb3JpZ2luanMvdml0ZS1wbHVnaW4tZmVkZXJhdGlvbidcclxuaW1wb3J0IHRvcExldmVsQXdhaXQgZnJvbSAndml0ZS1wbHVnaW4tdG9wLWxldmVsLWF3YWl0J1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICBiYXNlOiAnLi8nLFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHZ1ZSgpLFxyXG4gICAgdnVlSnN4KCksXHJcbiAgICB2dWV0aWZ5KHtcclxuICAgICAgc3R5bGVzOiB7XHJcbiAgICAgICAgY29uZmlnRmlsZTogJ3NyYy9zdHlsZXMvdmFyaWFibGVzL192dWV0aWZ5LnNjc3MnLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgICBDb21wb25lbnRzKHtcclxuICAgICAgZGlyczogWydzcmMvQGNvcmUvY29tcG9uZW50cyddLFxyXG4gICAgICBkdHM6IHRydWUsXHJcbiAgICB9KSxcclxuICAgIEF1dG9JbXBvcnQoe1xyXG4gICAgICBpbXBvcnRzOiBbJ3Z1ZScsICd2dWUtcm91dGVyJywgJ0B2dWV1c2UvY29yZScsICdAdnVldXNlL21hdGgnLCAncGluaWEnLCAndnVlLWkxOG4nXSxcclxuICAgICAgdnVlVGVtcGxhdGU6IHRydWUsXHJcbiAgICB9KSxcclxuICAgIFZ1ZUkxOG4oe1xyXG4gICAgICBpbmNsdWRlOiBbcmVzb2x2ZShfX2Rpcm5hbWUsICdzcmMvbG9jYWxlcy8qLnRzJyldLFxyXG4gICAgfSksXHJcbiAgICBmZWRlcmF0aW9uKHtcclxuICAgICAgbmFtZTogJ01vdmllUGlsb3QnLFxyXG4gICAgICBmaWxlbmFtZTogJ3JlbW90ZUVudHJ5LmpzJyxcclxuICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICByZW1vdGVzOiB7XHJcbiAgICAgICAgLy8gXHU1MkE4XHU2MDAxcmVtb3Rlc1x1NUMwNlx1NTcyOFx1OEZEMFx1ODg0Q1x1NjVGNlx1NkNFOFx1NTE2NVxyXG4gICAgICAgIGR1bW15OiB7XHJcbiAgICAgICAgICBleHRlcm5hbDogJycsXHJcbiAgICAgICAgICBmb3JtYXQ6ICd2YXInLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHNoYXJlZDogWyd2dWUnLCAndnVldGlmeSddLFxyXG4gICAgfSksXHJcbiAgICBWaXRlUFdBKHtcclxuICAgICAgaW5qZWN0UmVnaXN0ZXI6ICdzY3JpcHQnLFxyXG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcclxuICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcclxuICAgICAgc3JjRGlyOiAnc3JjJyxcclxuICAgICAgZmlsZW5hbWU6ICdzZXJ2aWNlLXdvcmtlci50cycsXHJcbiAgICAgIHdvcmtib3g6IHtcclxuICAgICAgICBnbG9iUGF0dGVybnM6IFsnKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxzdmcsanBnLGpwZWcsd2VicCx3b2ZmLHdvZmYyLHR0ZixvdGYsZW90fSddLFxyXG4gICAgICAgIC8vIFx1Nzg2RVx1NEZERFx1NTE3M1x1OTUyRVx1OEQ0NFx1NkU5MFx1ODhBQlx1OTg4NFx1N0YxM1x1NUI1OFxyXG4gICAgICAgIGFkZGl0aW9uYWxNYW5pZmVzdEVudHJpZXM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsOiAnL29mZmxpbmUuaHRtbCcsXHJcbiAgICAgICAgICAgIHJldmlzaW9uOiBudWxsLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIC8vIFx1OTg4NFx1N0YxM1x1NUI1OEFwcCBTaGVsbFx1NTE3M1x1OTUyRVx1OEQ0NFx1NkU5MFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmw6ICcvbG9nby5wbmcnLFxyXG4gICAgICAgICAgICByZXZpc2lvbjogbnVsbCxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBcdTU0MkZcdTc1MjhcdTVCRkNcdTgyMkFcdTk4ODRcdTUyQTBcdThGN0RcclxuICAgICAgICBuYXZpZ2F0aW9uUHJlbG9hZDogdHJ1ZSxcclxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xyXG4gICAgICAgICAgLy8gQXBwIFNoZWxsXHU3RjEzXHU1QjU4IC0gXHU0RjE4XHU1MTQ4XHU3RjEzXHU1QjU4XHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eXFwvJHxcXC9pbmRleFxcLmh0bWwkLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnYXBwLXNoZWxsLWNhY2hlJyxcclxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XHJcbiAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAxMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDcgKiAyNCAqIDYwICogNjAsIC8vIDdcdTU5MjlcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcLig/OmpzfGNzc3xodG1sKSQvLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3RhdGljLXJlc291cmNlcycsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwuKD86cG5nfGpwZ3xqcGVnfHN2Z3xpY298d2VicHxhdmlmfGdpZnxibXB8dGlmZikkLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnaW1hZ2UtY2FjaGUnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcclxuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDIwMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDMwICogMjQgKiA2MCAqIDYwLCAvLyAzMFx1NTkyOVxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwuKD86d29mZnx3b2ZmMnx0dGZ8b3RmfGVvdCkkLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZm9udC1jYWNoZScsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNTAsXHJcbiAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiAzNjUgKiAyNCAqIDYwICogNjAsIC8vIDFcdTVFNzRcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcL2FwaVxcL3YxXFwvLiokLyxcclxuICAgICAgICAgICAgaGFuZGxlcjogJ05ldHdvcmtGaXJzdCcsXHJcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdhcGktY2FjaGUnLFxyXG4gICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogMTAsXHJcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xyXG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNTAwLFxyXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogMjQgKiA2MCAqIDYwLCAvLyAyNFx1NUMwRlx1NjVGNlxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ltYWdlXFwudG1kYlxcLm9yZ1xcLy4qJC8sXHJcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcclxuICAgICAgICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3RtZGItaW1hZ2UtY2FjaGUnLFxyXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcclxuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDMwMCxcclxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDcgKiAyNCAqIDYwICogNjAsIC8vIDdcdTU5MjlcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgcmVxdWVzdCB9KSA9PiByZXF1ZXN0LmRlc3RpbmF0aW9uID09PSAnZG9jdW1lbnQnLFxyXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxyXG4gICAgICAgICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAncGFnZXMtY2FjaGUnLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6ICcvb2ZmbGluZS5odG1sJyxcclxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvLipcXC9hcGlcXC8uKi8sIC9cXC9vZmZsaW5lXFwuaHRtbCQvXSxcclxuICAgICAgICBpZ25vcmVVUkxQYXJhbWV0ZXJzTWF0Y2hpbmc6IFsvXnV0bV8vLCAvXmZiY2xpZCQvLCAvXmdjbGlkJC9dLFxyXG4gICAgICAgIHNraXBXYWl0aW5nOiB0cnVlLFxyXG4gICAgICAgIGNsaWVudHNDbGFpbTogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgaW5qZWN0TWFuaWZlc3Q6IHtcclxuICAgICAgICByb2xsdXBGb3JtYXQ6ICdpaWZlJyxcclxuICAgICAgICBtYXhpbXVtRmlsZVNpemVUb0NhY2hlSW5CeXRlczogMTAgKiAxMDI0ICogMTAyNCxcclxuICAgICAgfSxcclxuICAgICAgZGV2T3B0aW9uczoge1xyXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXHJcbiAgICAgICAgdHlwZTogJ21vZHVsZScsXHJcbiAgICAgIH0sXHJcbiAgICAgIG1hbmlmZXN0OiB7XHJcbiAgICAgICAgJ25hbWUnOiAnTW92aWVQaWxvdCcsXHJcbiAgICAgICAgJ3Nob3J0X25hbWUnOiAnTW92aWVQaWxvdCcsXHJcbiAgICAgICAgJ2Rlc2NyaXB0aW9uJzogJ01vdmllUGlsb3QgLSBcdTY2N0FcdTgwRkRcdTVGNzFcdTg5QzZcdTVBOTJcdTRGNTNcdTVFOTNcdTdCQTFcdTc0MDZcdTVERTVcdTUxNzcnLFxyXG4gICAgICAgICdzdGFydF91cmwnOiAnLi8nLFxyXG4gICAgICAgICdzY29wZSc6ICcuLycsXHJcbiAgICAgICAgJ2Rpc3BsYXknOiAnc3RhbmRhbG9uZScsXHJcbiAgICAgICAgJ2Rpc3BsYXlfb3ZlcnJpZGUnOiBbJ3dpbmRvdy1jb250cm9scy1vdmVybGF5JywgJ3N0YW5kYWxvbmUnXSxcclxuICAgICAgICAnb3JpZW50YXRpb24nOiAncG9ydHJhaXQtcHJpbWFyeScsXHJcbiAgICAgICAgJ2xhbmcnOiAnemgtQ04nLFxyXG4gICAgICAgICdkaXInOiAnbHRyJyxcclxuICAgICAgICAnY2F0ZWdvcmllcyc6IFsnZW50ZXJ0YWlubWVudCcsICdtdWx0aW1lZGlhJywgJ3V0aWxpdGllcyddLFxyXG4gICAgICAgICdpY29ucyc6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgJ3NyYyc6ICcuL2FuZHJvaWQtY2hyb21lLTE5MngxOTIucG5nJyxcclxuICAgICAgICAgICAgJ3NpemVzJzogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAndHlwZSc6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAncHVycG9zZSc6ICdhbnknLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgJ3NyYyc6ICcuL2FuZHJvaWQtY2hyb21lLTE5MngxOTJfbWFza2FibGUucG5nJyxcclxuICAgICAgICAgICAgJ3NpemVzJzogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAndHlwZSc6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAncHVycG9zZSc6ICdtYXNrYWJsZScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAnc3JjJzogJy4vYW5kcm9pZC1jaHJvbWUtNTEyeDUxMi5wbmcnLFxyXG4gICAgICAgICAgICAnc2l6ZXMnOiAnNTEyeDUxMicsXHJcbiAgICAgICAgICAgICd0eXBlJzogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICdwdXJwb3NlJzogJ2FueScsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAnc3JjJzogJy4vYW5kcm9pZC1jaHJvbWUtNTEyeDUxMl9tYXNrYWJsZS5wbmcnLFxyXG4gICAgICAgICAgICAnc2l6ZXMnOiAnNTEyeDUxMicsXHJcbiAgICAgICAgICAgICd0eXBlJzogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICdwdXJwb3NlJzogJ21hc2thYmxlJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAndGhlbWVfY29sb3InOiAnIzBFMTExNicsXHJcbiAgICAgICAgJ2JhY2tncm91bmRfY29sb3InOiAnIzBFMTExNicsXHJcbiAgICAgICAgJ2VkZ2Vfc2lkZV9wYW5lbCc6IHtcclxuICAgICAgICAgICdwcmVmZXJyZWRfd2lkdGgnOiAzMjAsXHJcbiAgICAgICAgfSxcclxuICAgICAgICAnbGF1bmNoX2hhbmRsZXInOiB7XHJcbiAgICAgICAgICAnY2xpZW50X21vZGUnOiAnbmF2aWdhdGUtZXhpc3RpbmcnLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgJ2hhbmRsZV9saW5rcyc6ICdwcmVmZXJyZWQnLFxyXG4gICAgICAgICdpZCc6ICdtb3ZpZXBpbG90LWFwcCcsXHJcbiAgICAgICAgJ3Nob3J0Y3V0cyc6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgJ25hbWUnOiAnXHU2M0E4XHU4MzUwJyxcclxuICAgICAgICAgICAgJ3Nob3J0X25hbWUnOiAnXHU2M0E4XHU4MzUwJyxcclxuICAgICAgICAgICAgJ2Rlc2NyaXB0aW9uJzogJ1x1NjdFNVx1NzcwQlx1NjNBOFx1ODM1MFx1NTE4NVx1NUJCOScsXHJcbiAgICAgICAgICAgICd1cmwnOiAnLi9yZWNvbW1lbmQnLFxyXG4gICAgICAgICAgICAnaWNvbnMnOiBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgJ3NyYyc6ICcuL3NwYXJrbGVzLWljb24tMTkyeDE5Mi5wbmcnLFxyXG4gICAgICAgICAgICAgICAgJ3NpemVzJzogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAgICAgJ3R5cGUnOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBdLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgJ25hbWUnOiAnXHU2M0EyXHU3RDIyJyxcclxuICAgICAgICAgICAgJ3Nob3J0X25hbWUnOiAnXHU2M0EyXHU3RDIyJyxcclxuICAgICAgICAgICAgJ2Rlc2NyaXB0aW9uJzogJ1x1NjNBMlx1N0QyMlx1NjVCMFx1NTE4NVx1NUJCOScsXHJcbiAgICAgICAgICAgICd1cmwnOiAnLi9kaXNjb3ZlcicsXHJcbiAgICAgICAgICAgICdpY29ucyc6IFtcclxuICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAnc3JjJzogJy4vY2xvY2staWNvbi0xOTJ4MTkyLnBuZycsXHJcbiAgICAgICAgICAgICAgICAnc2l6ZXMnOiAnMTkyeDE5MicsXHJcbiAgICAgICAgICAgICAgICAndHlwZSc6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICAnbmFtZSc6ICdcdTY2RjRcdTU5MUEnLFxyXG4gICAgICAgICAgICAnc2hvcnRfbmFtZSc6ICdcdTY2RjRcdTU5MUEnLFxyXG4gICAgICAgICAgICAnZGVzY3JpcHRpb24nOiAnXHU2NkY0XHU1OTFBXHU1MjlGXHU4MEZEJyxcclxuICAgICAgICAgICAgJ3VybCc6ICcuL2FwcHMnLFxyXG4gICAgICAgICAgICAnaWNvbnMnOiBbXHJcbiAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgJ3NyYyc6ICcuL2NvZy1pY29uLTE5MngxOTIucG5nJyxcclxuICAgICAgICAgICAgICAgICdzaXplcyc6ICcxOTJ4MTkyJyxcclxuICAgICAgICAgICAgICAgICd0eXBlJzogJ2ltYWdlL3BuZycsXHJcbiAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAnc2NyZWVuc2hvdHMnOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgICdzcmMnOiAnLi9hbmRyb2lkLWNocm9tZS01MTJ4NTEyLnBuZycsXHJcbiAgICAgICAgICAgICdzaXplcyc6ICc1MTJ4NTEyJyxcclxuICAgICAgICAgICAgJ3R5cGUnOiAnaW1hZ2UvcG5nJyxcclxuICAgICAgICAgICAgJ2Zvcm1fZmFjdG9yJzogJ3dpZGUnLFxyXG4gICAgICAgICAgICAnbGFiZWwnOiAnTW92aWVQaWxvdCBcdTRFM0JcdTc1NENcdTk3NjInLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgJ3NyYyc6ICcuL2FuZHJvaWQtY2hyb21lLTE5MngxOTIucG5nJyxcclxuICAgICAgICAgICAgJ3NpemVzJzogJzE5MngxOTInLFxyXG4gICAgICAgICAgICAndHlwZSc6ICdpbWFnZS9wbmcnLFxyXG4gICAgICAgICAgICAnZm9ybV9mYWN0b3InOiAnbmFycm93JyxcclxuICAgICAgICAgICAgJ2xhYmVsJzogJ01vdmllUGlsb3QgXHU3OUZCXHU1MkE4XHU3QUVGJyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgICAncHJvdG9jb2xfaGFuZGxlcnMnOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgICdwcm90b2NvbCc6ICd3ZWIrbW92aWVwaWxvdCcsXHJcbiAgICAgICAgICAgICd1cmwnOiAnLi8/aGFuZGxlcj0lcycsXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgJ3ByZWZlcl9yZWxhdGVkX2FwcGxpY2F0aW9ucyc6IGZhbHNlLFxyXG4gICAgICAgICdyZWxhdGVkX2FwcGxpY2F0aW9ucyc6IFtdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgICB0b3BMZXZlbEF3YWl0KHtcclxuICAgICAgLy8gVGhlIGV4cG9ydCBuYW1lIG9mIHRvcC1sZXZlbCBhd2FpdCBwcm9taXNlIGZvciBlYWNoIGNodW5rIG1vZHVsZVxyXG4gICAgICBwcm9taXNlRXhwb3J0TmFtZTogJ19fbXBfdGxhJyxcclxuICAgICAgLy8gVGhlIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGltcG9ydCBuYW1lcyBvZiB0b3AtbGV2ZWwgYXdhaXQgcHJvbWlzZSBpbiBlYWNoIGNodW5rIG1vZHVsZVxyXG4gICAgICBwcm9taXNlSW1wb3J0TmFtZTogaSA9PiBgX19tcF90bGFfJHtpfWAsXHJcbiAgICB9KSxcclxuICBdLFxyXG4gIGRlZmluZTogeyAncHJvY2Vzcy5lbnYnOiB7fSB9LFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpLFxyXG4gICAgICAnQGNvcmUnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjL0Bjb3JlJywgaW1wb3J0Lm1ldGEudXJsKSksXHJcbiAgICAgICdAbGF5b3V0cyc6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9zcmMvQGxheW91dHMnLCBpbXBvcnQubWV0YS51cmwpKSxcclxuICAgICAgJ0BpbWFnZXMnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjL2Fzc2V0cy9pbWFnZXMvJywgaW1wb3J0Lm1ldGEudXJsKSksXHJcbiAgICAgICdAc3R5bGVzJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYy9zdHlsZXMvJywgaW1wb3J0Lm1ldGEudXJsKSksXHJcbiAgICAgICdAY29uZmlndXJlZC12YXJpYWJsZXMnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjL3N0eWxlcy92YXJpYWJsZXMvX3RlbXBsYXRlLnNjc3MnLCBpbXBvcnQubWV0YS51cmwpKSxcclxuICAgICAgJ2FwZXhjaGFydHMnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJ25vZGVfbW9kdWxlcy9hcGV4Y2hhcnRzJywgaW1wb3J0Lm1ldGEudXJsKSksXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgYnVpbGQ6IHtcclxuICAgIHRhcmdldDogJ2VzbmV4dCcsXHJcbiAgICBtaW5pZnk6ICd0ZXJzZXInLFxyXG4gICAgdGVyc2VyT3B0aW9uczoge1xyXG4gICAgICBjb21wcmVzczoge1xyXG4gICAgICAgIGRyb3BfY29uc29sZTogdHJ1ZSxcclxuICAgICAgICBkcm9wX2RlYnVnZ2VyOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNTAwMCxcclxuICAgIGNzc0NvZGVTcGxpdDogZmFsc2UsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIG91dHB1dDoge1xyXG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiAnW25hbWVdLmpzJyxcclxuICAgICAgICBjaHVua0ZpbGVOYW1lczogJ1tuYW1lXS5qcycsXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICBleGNsdWRlOiBbJ3Z1ZXRpZnknXSxcclxuICAgIGVudHJpZXM6IFsnLi9zcmMvKiovKi52dWUnXSxcclxuICB9LFxyXG4gIHNlcnZlcjoge1xyXG4gICAgcHJveHk6IHtcclxuICAgICAgJy9hcGkvdjEnOiB7XHJcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAxJyxcclxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXHJcbiAgICAgICAgc2VjdXJlOiBmYWxzZSxcclxuICAgICAgICBjb29raWVEb21haW5SZXdyaXRlOiAnbG9jYWxob3N0JyxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBjc3M6IHtcclxuICAgIHByZXByb2Nlc3Nvck9wdGlvbnM6IHtcclxuICAgICAgc2Nzczoge1xyXG4gICAgICAgIHF1aWV0RGVwczogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0sXHJcbiAgfSxcclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE0USxTQUFTLHFCQUFxQjtBQUMxUyxPQUFPLFNBQVM7QUFDaEIsT0FBTyxZQUFZO0FBQ25CLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sZ0JBQWdCO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU8sYUFBYTtBQUNwQixTQUFTLGVBQWU7QUFDeEIsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixPQUFPLGdCQUFnQjtBQUN2QixPQUFPLG1CQUFtQjtBQVgxQixJQUFNLG1DQUFtQztBQUE0SCxJQUFNLDJDQUEyQztBQWN0TixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixNQUFNO0FBQUEsRUFDTixTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsSUFDSixPQUFPO0FBQUEsSUFDUCxRQUFRO0FBQUEsTUFDTixRQUFRO0FBQUEs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
