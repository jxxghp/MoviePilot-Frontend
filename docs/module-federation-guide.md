# MoviePilot前端远程模块开发指南

## 1. 概述

MoviePilot前端采用模块联邦(Module Federation)技术实现插件的动态加载和集成。本文档详细说明如何开发符合要求的远程模块，以便在MoviePilot中作为插件使用。

关联阅读后端插件开发文档：[第三方插件开发说明](https://github.com/jxxghp/MoviePilot-Plugins/blob/main/README.md)


## 2. 技术要求

- Node.js 20+
- Vue 3
- Vite 4+
- TypeScript 5+

## 3. 核心概念

每个 Vue 联邦插件需要提供下列标准组件（`AppPage` 为可选，用于主界面侧栏全页入口）：

| 组件名称 | 暴露名 | 文件名 | 用途 |
|---------|--------|--------|------|
| Page | `./Page` | Page.vue | 插件管理中的详情弹窗 |
| Config | `./Config` | Config.vue | 插件配置页面 |
| Dashboard | `./Dashboard` | Dashboard.vue | 仪表盘小组件 |
| AppPage | `./AppPage` | AppPage.vue | 主界面侧栏独立全页（主内容区由插件完全绘制） |
| （可选） | `./AppPage{Xxx}` | 如 AppPageSettings.vue | 多 `nav_key` 时按名优先加载，见下文「多界面」 |

主应用在侧栏全页路由中按 `nav_key` 解析暴露名（如 `AppPageSettings`），再回退 `AppPage` → `Page`；`nav_key` 为 `main` 时仅尝试 `AppPage` → `Page`。

## 4. 快速开始

### 创建项目

```bash
# 创建项目
npm create vite@latest my-plugin -- --template vue-ts

# 进入项目目录
cd my-plugin

# 安装依赖
yarn
```

### 配置vite.config.ts

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import federation from '@originjs/vite-plugin-federation'

export default defineConfig({
  plugins: [
    vue(),
    federation({
      name: 'MyPlugin',
      filename: 'remoteEntry.js',
      exposes: {
        './Page': './src/components/Page.vue',
        './Config': './src/components/Config.vue',
        './Dashboard': './src/components/Dashboard.vue',
        './AppPage': './src/components/AppPage.vue',
        './AppPageSettings': './src/components/AppPageSettings.vue',
      },
      shared: {
        vue: {
          requiredVersion: false,
          generate: false,
        },
        vuetify: {
          requiredVersion: false,
          generate: false,
          singleton: true,
        },
        'vuetify/styles': {
          requiredVersion: false,
          generate: false,
          singleton: true,
        },
      },
      format: 'esm'
    })
  ],
  build: {
    target: 'esnext',   // 必须设置为esnext以支持顶层await
    minify: false,      // 开发阶段建议关闭混淆
    cssCodeSplit: true, // 改为true以便能分离样式文件
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: '/* 覆盖vuetify样式 */',
      }
    },
    postcss: {
      plugins: [
        {
          postcssPlugin: 'internal:charset-removal',
          AtRule: {
            charset: (atRule) => {
              if (atRule.name === 'charset') {
                atRule.remove();
              }
            }
          }
        },
        {
          postcssPlugin: 'vuetify-filter',
          Root(root) {
            // 过滤掉所有vuetify相关的CSS
            root.walkRules(rule => {
              if (rule.selector && (
                  rule.selector.includes('.v-') || 
                  rule.selector.includes('.mdi-'))) {
                rule.remove();
              }
            });
          }
        }
      ]
    }
  },
  server: {
    port: 5001,   // 使用不同于主应用的端口
    cors: true,   // 启用CORS
    origin: 'http://localhost:5001'
  },
}) 

```

## 5. 组件开发规范

### 5.1 Page组件（详情页面）

```vue
<script setup lang="ts">
// 自定义事件，用于通知主应用刷新数据
const emit = defineEmits(['action', 'switch', 'close'])

// 接收API对象
const props = defineProps({
  api: {
    type: Object,
    default: () => {}
  }
})

// 页面逻辑代码...

// 通知主应用刷新数据
function notifyRefresh() {
  emit('action')
}

// 通知主应用切换到配置页面
function notifySwitch() {
  emit('switch')
}

// 通知主应用关闭当前页面
function notifyClose() {
  emit('close')
}
</script>

<template>
  <div class="plugin-page">
    <!-- 插件详情页面操作按钮示例 -->
    <v-btn @click="notifyRefresh">刷新数据</v-btn>
    <v-btn @click="notifySwitch">配置插件</v-btn>
    <v-btn @click="notifyClose">关闭页面</v-btn>
  </div>
</template>
```

### 5.2 Config组件（配置页面）

```vue
<script setup lang="ts">
// 接收初始配置和API对象
const props = defineProps({
  initialConfig: {
    type: Object,
    default: () => ({})
  },
  api: {
    type: Object,
    default: () => {}
  }
})

// 配置数据
const config = ref({...props.initialConfig})

// 自定义事件，用于保存配置
const emit = defineEmits(['save', 'close', 'switch'])

// 保存配置
function saveConfig() {
  emit('save', config.value)
}

// 通知主应用切换到详情页面
function notifySwitch() {
  emit('switch')
}

// 通知主应用关闭当前页面
function notifyClose() {
  emit('close')
}
</script>

<template>
  <div class="plugin-config">
    <!-- 配置表单示例 -->
    <v-text-field v-model="config.someField" label="配置项"></v-text-field>
    
    <!-- 保存按钮示例 -->
    <v-btn color="primary" @click="saveConfig">保存配置</v-btn>

    <!-- 关闭按钮示例 -->
    <v-btn color="primary" @click="notifyClose">关闭页面</v-btn>

    <!-- 切换按钮示例 -->
    <v-btn color="primary" @click="notifySwitch">切换到详情页面</v-btn>
  </div>
</template>
```

### 5.3 Dashboard组件（仪表板）

```vue
<script setup lang="ts">
// 接收配置和刷新控制
const props = defineProps({
  config: {
    type: Object,
    default: () => ({})
  },
  allowRefresh: {
    type: Boolean,
    default: true
  }
})

// 仪表板逻辑...
</script>

<template>
  <div class="dashboard-widget">
    <v-hover>
      <!-- 仪表板内容 -->
      <template #default="{ isHovering, props: hoverProps }">
        <v-card v-bind="hoverProps">
          <v-card-title>{{ config.title || '仪表板组件' }}</v-card-title>
          <v-card-text>
            <!-- 组件内容 -->
          </v-card-text>
          <!-- 只在悬停时显示拖拽图标 -->
          <div v-show="isHovering" class="absolute right-5 top-5">
            <v-icon class="cursor-move">mdi-drag</v-icon>
          </div>
        </v-card>
      </template>
    </v-hover>
  </div>
</template>
```

### 5.4 AppPage 组件（侧栏全页）

用于主应用左侧导航中的独立页面（路由 `#/plugin-app/:pluginId/:navKey?`），占据默认布局下的主内容区；与 `Page` 不同，不嵌在插件管理弹窗中。

主应用传入的 props：

| 属性 | 说明 |
|------|------|
| `api` | 与 `Page` 相同，用于 `bear` 认证的插件 HTTP 调用 |
| `navKey` | 与侧栏声明的 `nav_key` 一致，同一插件多入口时用于区分 |
| `pluginId` | 当前插件 ID |

```vue
<script setup lang="ts">
const props = defineProps({
  api: { type: Object, default: () => ({}) },
  navKey: { type: String, default: 'main' },
  pluginId: { type: String, default: '' },
})
const emit = defineEmits(['action'])
</script>

<template>
  <div class="pa-4">
    <div class="text-h6 mb-2">侧栏全页示例（{{ pluginId }} / {{ navKey }}）</div>
    <v-btn size="small" @click="emit('action')">通知主应用</v-btn>
  </div>
</template>
```

#### 后端：注册侧栏入口

插件需为 **Vue** 渲染模式（`get_render_mode` 返回 `vue`），并实现 `get_sidebar_nav`，返回列表项字段与主应用 `GET /api/v1/plugin/sidebar_nav` 一致：

| 字段 | 说明 |
|------|------|
| `nav_key` | URL 路径段，唯一标识本入口（同一插件可多入口） |
| `title` | 侧栏显示标题 |
| `icon` | MDI 图标名，如 `mdi-rss` |
| `section` | 分组：`start` / `discovery` / `subscribe` / `organize` / `system` |
| `permission` | 可选：`subscribe` / `discovery` / `search` / `manage` / `admin`，与主应用菜单权限一致 |
| `order` | 可选：同组内排序，数值越小越靠前 |

```python
def get_sidebar_nav(self) -> List[Dict[str, Any]]:
    return [
        {
            "nav_key": "main",
            "title": "示例订阅页",
            "icon": "mdi-rss",
            "section": "subscribe",
            "permission": "subscribe",
            "order": 10,
        }
    ]
```

#### 同一插件多个全页界面（多 `nav_key`）

在 `get_sidebar_nav` 中**返回多条**记录，每条使用不同的 `nav_key` / `title` / `section` 等，侧栏与「更多」中会出现多个入口，路由形如 `#/plugin-app/<插件ID>/<nav_key>`。

前端加载远程组件的顺序为：

| `nav_key` | 依次尝试的联邦暴露名 |
|-----------|----------------------|
| `main` 或省略 | `./AppPage` → `./Page` |
| 其它（如 `settings`、`my_tool`） | `./AppPage{PascalCase}` → `./AppPage` → `./Page` |

`PascalCase` 规则：按 `-`、`_`、空格分段后首字母大写并拼接。例如 `nav_key=settings` → 先试 `./AppPageSettings`；`my_tool` → `./AppPageMyTool`。

**两种实现方式（二选一或混用）：**

1. **单文件分支**：只暴露 `./AppPage`，在组件内根据 `navKey` prop 用 `v-if` / `<component>` 切换子界面。  
2. **多文件**：为某个入口单独暴露 `./AppPageSettings.vue` 等，主应用会优先加载对应模块，失败再回退到 `AppPage`。

`vite.config` 多暴露示例：

```typescript
exposes: {
  './AppPage': './src/components/AppPage.vue',
  './AppPageSettings': './src/components/AppPageSettings.vue',
  // ...
}
```

## 6. 构建和部署

### 构建项目

```bash
yarn build
```

- 将生成的dist文件夹上传到插件后端目录下（默认为`dist/assets`）

 **注意： `__federation_shared_vuetify` 目录以及 `index-`、`date-`、`runtime-` 开头的文件不需要上传**，只需要上传以下命名格式文件：`__federation_*`、`_plugin-vue_export-helper-*`、`remoteEntry.js`


- 在插件的后端python代码中，实现以下方法来集成远程组件：

```python
def get_render_mode() -> Tuple[str, str]:
    """
    获取插件渲染模式
    :return: 1、渲染模式，支持：vue/vuetify，默认vuetify
    :return: 2、组件路径，默认 dist/assets
    """
    return "vue", "dist/assets"
```

-  需要在插件前端页面调用后端接口时，通过传入的api模块发起调用，后端api接口声明认证类型为：`bear`
```typescript
// 演示使用api模块调用插件接口
recentItems.value = await props.api.get(`plugin/MyPlugin/history`)
```

```python
def get_api(self) -> List[Dict[str, Any]]:
    """
    注册插件API
    """
    return [
        {
            "path": "/history",
            "endpoint": self.get_history,
            "methods": ["GET"],
            "auth": "bear",  # 认证类型设为bear
            "summary": "查询历史记录"
        }
    ]
```


## 7. 调试与排错

### 常见问题

1. **模块无法加载**
   - 检查网络请求是否成功（状态码200）
   - 确认文件路径是否正确
   - 检查CORS跨域设置

2. **模块加载但组件不显示**
   - 检查控制台错误信息
   - 确认组件是否正确导出
   - 验证共享依赖配置

3. **"Module name 'vue' does not resolve to a valid URL"**
   - 检查`shared`配置是否正确
   - 设置`requiredVersion: false`尝试解决

4. **"Top-level await is not available"**
   - 确保`build.target`设置为`esnext`

## 8. 高级配置

### 8.1 CSS隔离

为防止样式冲突，建议使用CSS Modules或scoped样式：

```vue
<style scoped>
/* 组件样式 */
</style>
```

### 8.2 共享更多依赖

如果您的插件需要共享更多依赖，可以扩展shared配置：

```js
shared: {
  vue: { requiredVersion: false },
  vuetify: { requiredVersion: false },
  '@vueuse/core': { requiredVersion: false },
  pinia: { requiredVersion: false }
}
```

### 8.3 本地监听构建

插件前端可使用 Vite 的监听构建模式：

```bash
yarn dev
```

将 `dev` 脚本配置为 `vite build --watch` 后，源码变化会自动重新构建。使用本地插件仓并启用 `DEV` 或 `PLUGIN_AUTO_RELOAD` 时，MoviePilot 会同步新的构建产物；刷新页面即可看到修改。

## 9. 示例代码

- [插件远程组件示例](../examples/plugin-component/) - 开发插件组件的完整示例项目 
- [模块联邦问题排查指南](./federation-troubleshooting.md) - 常见问题排查

## 10. 参考资料

- [Vite Plugin Federation](https://github.com/originjs/vite-plugin-federation)
- [Vue 3官方文档](https://vuejs.org/)

---

如有问题，请提交Issue。 
