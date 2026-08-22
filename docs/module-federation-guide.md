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

| 组件名称  | 暴露名           | 文件名                 | 用途                                          |
| --------- | ---------------- | ---------------------- | --------------------------------------------- |
| Page      | `./Page`         | Page.vue               | 插件管理中的详情弹窗                          |
| Config    | `./Config`       | Config.vue             | 插件配置页面                                  |
| Dashboard | `./Dashboard`    | Dashboard.vue          | 仪表盘小组件                                  |
| AppPage   | `./AppPage`      | AppPage.vue            | 主界面侧栏独立全页（主内容区由插件完全绘制）  |
| （可选）  | `./AppPage{Xxx}` | 如 AppPageSettings.vue | 多 `nav_key` 时按名优先加载，见下文「多界面」 |

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
      format: 'esm',
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
```

## 5. 组件开发规范

### 5.1 Page组件（详情页面）

```vue
<script setup lang="ts">
// 自定义事件，用于通知主应用刷新数据
const emit = defineEmits(['action', 'switch', 'close'])

// 接收主应用能力
const props = defineProps({
  api: {
    type: Object,
    default: () => {},
  },
  pluginId: { type: String, default: '' },
  sourcePluginId: { type: String, default: '' },
  nativeSubscribe: {
    type: Function,
    default: null,
  },
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
// 接收初始配置和主应用能力
const props = defineProps({
  initialConfig: {
    type: Object,
    default: () => ({}),
  },
  api: {
    type: Object,
    default: () => {},
  },
  pluginId: { type: String, default: '' },
  sourcePluginId: { type: String, default: '' },
  nativeSubscribe: {
    type: Function,
    default: null,
  },
})

// 配置数据
const config = ref({ ...props.initialConfig })

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
// 接收配置、刷新控制和主应用能力
const props = defineProps({
  config: {
    type: Object,
    default: () => ({}),
  },
  allowRefresh: {
    type: Boolean,
    default: true,
  },
  api: { type: Object, default: () => ({}) },
  pluginId: { type: String, default: '' },
  sourcePluginId: { type: String, default: '' },
  nativeSubscribe: {
    type: Function,
    default: null,
  },
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

| 属性              | 说明                                                  |
| ----------------- | ----------------------------------------------------- |
| `api`             | 与 `Page` 相同，用于 `bear` 认证的插件 HTTP 调用      |
| `nativeSubscribe` | 打开主应用原生订阅交互                                |
| `navKey`          | 与侧栏声明的 `nav_key` 一致，同一插件多入口时用于区分 |
| `pluginId`        | 当前插件 ID                                           |
| `sourcePluginId`  | 虚拟分身共享资源的源插件 ID；普通插件为空             |

```vue
<script setup lang="ts">
const props = defineProps({
  api: { type: Object, default: () => ({}) },
  nativeSubscribe: { type: Function, default: null },
  navKey: { type: String, default: 'main' },
  pluginId: { type: String, default: '' },
  sourcePluginId: { type: String, default: '' },
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

### 5.5 主应用宿主能力

登录后的联邦组件宿主会向插件开放以下能力：

| 能力             | Page | Config | Dashboard | AppPage | 调用方式                                                         |
| ---------------- | ---- | ------ | --------- | ------- | ---------------------------------------------------------------- |
| 认证 API         | ✓    | ✓      | ✓         | ✓       | `api` prop                                                       |
| 当前实例 ID      | ✓    | ✓      | ✓         | ✓       | `pluginId` prop                                                  |
| 共享源码 ID      | ✓    | ✓      | ✓         | ✓       | `sourcePluginId` prop；普通插件为空                              |
| 原生订阅交互     | ✓    | ✓      | ✓         | ✓       | `nativeSubscribe` prop 或 `inject('moviepilot:nativeSubscribe')` |
| 主应用统一 Toast | ✓    | ✓      | ✓         | ✓       | `inject('moviepilot:toast')`                                     |
| 主应用公共弹窗   | ✓    | ✓      | ✓         | ✓       | `inject('moviepilot:dialog')`                                    |
| 主应用确认弹窗   | ✓    | ✓      | ✓         | ✓       | `inject('moviepilot:confirm')`                                   |

`nativeSubscribe`、Toast、公共弹窗和确认弹窗都由主应用宿主提供。插件不应复制主程序订阅弹窗、创建另一套 Toast 容器或自行挂载全局弹窗。插件在旧版主程序或能力不存在的环境中运行时，应保留空值判断和必要的页面内 fallback。

V3 新建插件分身会复用源插件的同一份联邦产物。宿主传入的 `api` 已绑定当前
`pluginId`：即使旧组件仍调用 `plugin/<sourcePluginId>/...`，也会被映射到实例 API。
新组件应直接用 `pluginId` 拼接路径，并始终优先使用 `api` prop；只读取全局
`window.MoviePilotAPI` 会绕过实例作用域，不适合多实例插件。

### 5.6 玻璃光学表面

主应用的 `Page`、`Config` 与 `AppPage` 宿主在玻璃主题下默认采用 `static-material` 光学模式：保留壁纸透射、材质色调和方向反射，但不响应指针流场、局部折射、拖尾或动态焦散。插件列表与 `Dashboard` 继续使用完整动态光学。视觉型插件可以在自己控制的 DOM 区域显式恢复完整动态光学：

```html
<div data-glass-optical-surface data-glass-optical-mode="dynamic">
  <!-- 插件自己的视觉内容 -->
</div>
```

使用时需同时声明 `data-glass-optical-surface` 和 `data-glass-optical-mode="dynamic"`。模式会从最近的祖先容器继承，因此显式声明的动态子表面不会沿用宿主的静态模式。该合同适用于插件在 `Page`、`Config` 或 `AppPage` 中自行渲染并控制的区域；主应用生成的插件列表、插件市场卡片、`Dashboard` 及其他宿主 DOM 不属于插件的修改边界。

动态模式只在主应用启用玻璃主题和实时光学能力时生效。其他主题、降低动态效果或光学能力不可用时，插件必须保持内容与交互正常，不应依赖动态光学表达业务状态或必要反馈。

### 5.7 调用主应用原生订阅

`Page`、`Config`、`Dashboard` 与 `AppPage` 都会收到 `nativeSubscribe(mediaInfo)` prop。插件传入媒体信息后，电视剧会打开主应用的选季抽屉，电影会进入现有电影订阅流程。宿主也会用 `moviepilot:nativeSubscribe` 键提供同一个方法，深层子组件可以使用 `inject`，无需逐层传递 prop。

媒体信息必须包含：

- `type`：`电影` / `电视剧`，也兼容 `movie` / `tv`；
- `title`；
- 至少一个有效媒体标识：`tmdb_id` / `tmdbid`、`douban_id` / `doubanid`、`bangumi_id` / `bangumiid`、`anilist_id` / `anilistid`，或者 `media_id` 与 `mediaid_prefix` / `source` / `media_source` 的组合。

```vue
<script setup lang="ts">
import { inject } from 'vue'

type NativeSubscribeResult =
  { success: true } | { success: false; code: 'INVALID_MEDIA' | 'PERMISSION_DENIED'; message: string }

const props = defineProps<{
  nativeSubscribe?: (mediaInfo: Record<string, unknown>) => Promise<NativeSubscribeResult>
}>()

const nativeSubscribe = inject('moviepilot:nativeSubscribe', props.nativeSubscribe)

/** 使用主应用订阅交互，宿主不接受时保留插件自己的 fallback。 */
async function subscribeMedia(mediaInfo: Record<string, unknown>) {
  const result = await nativeSubscribe?.(mediaInfo)
  if (!result?.success) {
    // 插件可在这里执行自己的 fallback；宿主已同时显示明确错误提示。
  }
}
</script>
```

`success: true` 表示主应用已接受调用并启动原生交互，不表示用户已经完成订阅。字段无效或当前用户没有订阅权限时返回 `success: false`，插件可以依据 `code` 执行 fallback。

### 5.8 调用主应用 Toast

`Page`、`Config`、`Dashboard` 与 `AppPage` 的宿主容器会通过固定键提供主应用 Toast。远程组件应复用该实例，不要自行渲染 `VSnackbar` 或创建另一套 Toast 容器：

```vue
<script setup lang="ts">
import { inject } from 'vue'

interface HostToast {
  error(message: string): unknown
  info(message: string): unknown
  success(message: string): unknown
  warning(message: string): unknown
}

const toast = inject<HostToast | null>('moviepilot:toast', null)

// 保存完成后调用主应用的统一通知。
function saveComplete() {
  toast?.success('保存成功')
}
</script>
```

可用方法与主项目 `vue-toastification` 一致，包括 `success`、`info`、`warning` 和 `error`。注入不存在时应静默降级，关键错误仍需保留页面内状态提示。

### 5.9 调用主应用公共弹窗

`Page`、`Config`、`Dashboard` 与 `AppPage` 的宿主容器会通过固定键提供主应用公共弹窗函数。该函数会将插件组件挂载到主应用 `App.vue` 的 `SharedDialogHost`，因此弹窗不会受插件页面、卡片或父级容器的层叠上下文限制。远程组件应复用该入口，不要自行创建额外的弹窗容器：

```vue
<script setup lang="ts">
import { inject, type Component } from 'vue'

interface DialogController {
  id: number
  close(): void
  updateProps(props: Record<string, unknown>): void
}

type HostDialog = (
  component: Component,
  props?: Record<string, unknown>,
  events?: Record<string, (...args: unknown[]) => unknown>,
  options?: { closeOn?: string[] | false; replace?: boolean },
) => DialogController

const openDialog = inject<HostDialog | null>('moviepilot:dialog', null)

function openPluginDialog(DialogComponent: Component, props: Record<string, unknown>) {
  return openDialog?.(
    DialogComponent,
    props,
    {
      close: () => {
        // 处理插件弹窗关闭后的业务逻辑。
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}
</script>
```

公共弹窗函数签名为 `openDialog(component, props, events, options)`，返回控制器：

- `closeOn`：收到指定事件后自动从公共层移除，默认监听 `close`；传 `false` 表示不自动关闭；
- `replace`：是否替换当前公共弹窗栈；
- `props` 和 `events`：也可以使用 `openDialogWithOptions` 的对象参数形式传入；
- `close()`：主动关闭当前弹窗；
- `updateProps(props)`：合并更新已打开弹窗的 props。

插件弹窗组件应提供 `close` 或 `update:modelValue` 事件，并自行处理组件内部交互。旧版主应用未提供该注入时，插件应保留页面内弹窗或其他 fallback。

### 5.10 调用主应用确认弹窗

确认弹窗使用独立的固定键，适合不需要自定义组件内容的确认场景：

```vue
<script setup lang="ts">
import { inject } from 'vue'

interface ConfirmOptions {
  type?: 'info' | 'warn' | 'error'
  title?: string
  content?: string
  confirmText?: string
  cancelText?: string
  width?: string | number
}

type HostConfirm = (options?: ConfirmOptions) => Promise<boolean>

const confirm = inject<HostConfirm | null>('moviepilot:confirm', null)

async function removeItem() {
  const confirmed = await confirm?.({
    type: 'warn',
    title: '确认删除',
    content: '删除后无法恢复，是否继续？',
  })
  if (!confirmed) return

  // 执行删除请求。
}
</script>
```

确认弹窗返回 `Promise<boolean>`：用户点击确认时为 `true`，点击取消或关闭按钮时为 `false`；注入能力不存在时返回 `undefined`，插件应按未确认处理。可用配置项包括 `type`（`info` / `warn` / `error`）、`title`、`content`、`confirmText`、`cancelText` 和 `width`。

#### 后端：注册侧栏入口

插件需为 **Vue** 渲染模式（`get_render_mode` 返回 `vue`），并实现 `get_sidebar_nav`，返回列表项字段与主应用 `GET /api/v1/plugin/sidebar_nav` 一致：

| 字段         | 说明                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| `nav_key`    | URL 路径段，唯一标识本入口（同一插件可多入口）                                        |
| `title`      | 侧栏显示标题                                                                          |
| `icon`       | MDI 图标名，如 `mdi-rss`                                                              |
| `section`    | 分组：`start` / `discovery` / `subscribe` / `organize` / `system`                     |
| `permission` | 可选：`subscribe` / `discovery` / `search` / `manage` / `admin`，与主应用菜单权限一致 |
| `order`      | 可选：同组内排序，数值越小越靠前                                                      |

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

| `nav_key`                        | 依次尝试的联邦暴露名                             |
| -------------------------------- | ------------------------------------------------ |
| `main` 或省略                    | `./AppPage` → `./Page`                           |
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

- 需要在插件前端页面调用后端接口时，通过传入的api模块发起调用，后端api接口声明认证类型为：`bear`

```typescript
// 使用宿主传入的当前实例 ID，普通插件和虚拟分身使用同一份组件代码
recentItems.value = await props.api.get(`plugin/${props.pluginId}/history`)
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
