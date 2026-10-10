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
        // 可选：Agent 助手形象，见 5.11
        './AgentPet': './src/components/AgentPet.vue',
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

| 能力             | Page | Config | Dashboard | AppPage | AgentPet | 调用方式                                                          |
| ---------------- | ---- | ------ | --------- | ------- | -------- | ----------------------------------------------------------------- |
| 认证 API         | ✓    | ✓      | ✓         | ✓       | ✓        | `api` prop                                                        |
| 当前实例 ID      | ✓    | ✓      | ✓         | ✓       | ✓        | `pluginId` prop                                                   |
| 共享源码 ID      | ✓    | ✓      | ✓         | ✓       | ✓        | `sourcePluginId` prop；普通插件为空                               |
| 原生订阅交互     | ✓    | ✓      | ✓         | ✓       |          | `nativeSubscribe` prop 或 `inject('moviepilot:nativeSubscribe')`  |
| 主应用统一 Toast | ✓    | ✓      | ✓         | ✓       |          | `inject('moviepilot:toast')`                                      |
| 主应用公共弹窗   | ✓    | ✓      | ✓         | ✓       |          | `inject('moviepilot:dialog')`                                     |
| 主应用确认弹窗   | ✓    | ✓      | ✓         | ✓       |          | `inject('moviepilot:confirm')`                                    |
| Agent 宿主能力   | ✓    | ✓      | ✓         | ✓       | ✓        | `inject('moviepilot:agent')`，AgentPet 另有 `agent` prop，见 5.11 |

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

### 5.11 Agent 助手形象（AgentPet）

插件可以替换页面右下角智能助手的形象。主应用保留 Agent 面板、会话、模型、工具调用、权限、挂载生命周期和回退，插件只负责角色本身。

能力边界如下。

- 插件不能接管 Agent 面板或会话，不能替用户发送消息，也不能借自定义事件操作会话。
- `agent.open({ draft })` 只把草稿填进输入框，是否发送始终由用户决定。
- 形象只在 Agent 已启用且未隐藏全局入口时挂载。入口被隐藏时形象组件不会加载，其他联邦组件拿到的 `available` 为 `false`。

参考实现见 [AgentPets（助手形象）](https://github.com/InfinityPacer/MoviePilot-Plugins/tree/main/plugins.v3/agentpets)。

#### 两种模式

| 模式               | 插件负责                                                         | 主应用负责                                                          |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `renderer`（默认） | 在入口热区内画出角色，按主应用传入的动作名和意图播放动画         | 入口位置、拖拽、贴边、随机动作调度、点击开面板、原生气泡            |
| `stage`            | 整个角色，包括外观、动作集合、位置、拖拽、物理、贴边和点击开面板 | 提供覆盖全视口的图层，`bubbles=host` 时在插件上报的锚点旁画原生气泡 |

renderer 形象挂在内置入口的触发按钮里并填满热区，入口的拖拽、贴边、气泡定位和点击打开面板都保持不变。形象加载期间入口不画内置机器人，保持空白但可点击。

stage 图层固定覆盖整个视口，层级与内置入口相同，高于 Vuetify 弹窗和遮罩，角色可以在整个视口自由走动、跟随鼠标、走到弹窗上方。图层自身 `pointer-events: none`，任何空白处的点击都会穿透到下方页面，弹窗打开时也一样。插件只在自己的角色元素上设置 `pointer-events: auto`，并在点击角色时调用 `agent.open()`。stage 形象加载期间保留一个不画角色的内置入口，点击打开面板、拖拽等功能照常可用。

stage 模式的气泡有两种归属。

| `bubbles`      | 行为                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `host`（默认） | 内置入口进入锚定模式，不显示触发器、不响应拖拽，只把原生气泡画在插件上报的锚点旁。没有上报锚点或上报 `null` 时不显示气泡 |
| `self`         | 内置入口不挂载，回复预览、通知和 toast 只以 `agent.preview`、`agent.bubble` 事件推给形象，由插件自己画                   |

选择 `bubbles=self` 的插件必须订阅并显示 `agent.bubble`。这时主应用把全局通知和 toast 都转给形象，不再弹出常规提示，插件不处理就意味着用户看不到这些提示。

#### 后端声明

插件需为 Vue 渲染模式（`get_render_mode()` 返回 `vue`），并实现 `get_agent_pets()` 返回形象列表。主应用通过 `GET /api/v1/plugin/agent_pets` 聚合所有已启用插件的声明。

| 字段             | 必填 | 说明                                                                                 |
| ---------------- | ---- | ------------------------------------------------------------------------------------ |
| `key`            | 是   | 插件内唯一，匹配 `[a-z0-9_-]{1,32}`                                                  |
| `name`           | 是   | 形象展示名，也用作面板标题和消息署名                                                 |
| `description`    | 否   | 一句话说明                                                                           |
| `mode`           | 否   | `stage` 或 `renderer`，默认 `renderer`                                               |
| `component`      | 否   | 联邦暴露名，默认 `AgentPet`，即 `./AgentPet`                                         |
| `api_version`    | 否   | 契约版本，默认 1，主应用只识别 1，其他版本的项会被忽略                               |
| `preview`        | 否   | 预览图，相对 `remoteEntry.js` 所在目录的路径，或 `http(s)://`、`data:` URL           |
| `avatar`         | 否   | 方形头像，路径规则同 `preview`，用于 Agent 面板头部、空状态和消息头像                |
| `bubbles`        | 否   | 仅 stage 模式，`host` 或 `self`，默认 `host`                                         |
| `random_actions` | 否   | 仅 renderer 模式，主应用随机动作只从这里挑，缺省用主应用全集，空列表表示不播随机动作 |

声明的规整规则如下。

- 任一字段非法的项整项丢弃，并在后端日志记录警告。同一插件内重复的 `key` 只保留第一项。
- `preview` 和 `avatar` 的相对路径以 `remoteEntry.js` 所在目录为基准，也就是 `get_render_mode()` 返回的产物目录，通常是 `dist/assets`。素材放在 `dist/assets/pets/girl.png` 时写 `pets/girl.png`，不要再加 `assets/` 前缀，否则会解析成 `dist/assets/assets/...`。
- 相对路径不能包含 `..`、`\` 或 `:`，会解析成与 `remoteEntry.js` 同源的地址，并带上插件版本作为缓存键。接口中对应字段为 `preview_url` 和 `avatar_url`，未声明时为 `null`。
- renderer 项的 `bubbles` 和 stage 项的 `random_actions` 会被忽略。`random_actions` 中主应用不认识的动作名会被前端过滤。
- 插件分身沿用实例 `plugin_id`，`source_plugin_id` 指向提供联邦产物的源插件。
- 接口每项还带 `remote_url` 和 `plugin_version`，由主应用填写，插件不需要声明。`remote_url` 是该插件的联邦入口地址，规则与 `plugin/remotes` 一致，主应用用它直接注册入口。`plugin_version` 是插件版本，可能为 `null`。

```python
def get_agent_pets(self) -> List[Dict[str, Any]]:
    return [
        {
            "key": "girl",
            "name": "看板娘",
            "description": "会在页面底部散步的 Q 版角色",
            "mode": "stage",
            # 相对 remoteEntry.js 所在目录，对应 dist/assets/pets/girl-preview.png
            "preview": "pets/girl-preview.png",
            "avatar": "pets/girl-avatar.png",
        }
    ]
```

#### 一个插件注册多个形象

`get_agent_pets()` 可以返回多项，每项都会作为独立选项出现在设置页。各项可以使用不同的 `mode` 和 `component`，主应用按 `component` 加载对应的联邦暴露名，同一个组件也可以被多项共用，组件内通过 `pet.key` 区分当前形象。

```python
def get_agent_pets(self) -> List[Dict[str, Any]]:
    return [
        {"key": "girl", "name": "看板娘", "mode": "stage", "component": "StagePet", "bubbles": "host"},
        {"key": "cat", "name": "小猫", "mode": "renderer", "component": "SpritePet", "random_actions": ["sit", "sleep", "stretch"]},
        {"key": "dog", "name": "小狗", "mode": "renderer", "component": "SpritePet"},
    ]
```

```typescript
exposes: {
  './StagePet': './src/components/StagePet.vue',
  './SpritePet': './src/components/SpritePet.vue',
}
```

如果角色只是同一套素材的不同皮肤，也可以只声明一项，在插件配置页里切换角色，再通过下文的自定义事件通知正在运行的形象。是否拆成多项取决于用户是否需要在“更换形象”里直接选到它。

#### 选择与生效

- 用户打开智能助手面板，点头部的“更换形象”按钮，在面板内选择，选项为“跟随系统默认”“内置机器人”和全部可用形象。选择保存在用户配置 `AgentPet`，值为 `{"plugin_id": "...", "key": "..."}`、`"builtin"` 或 `null`（跟随默认）。
- 管理员在“设定 → 系统 → 基础设置 → 智能助手配置”中设置“默认助手形象”，即系统配置 `AI_AGENT_PET`，取值为 `<plugin_id>:<key>`，留空为内置机器人。
- 生效顺序为用户选择优先，`null` 跟随管理员默认，`"builtin"` 固定内置机器人。
- 选择即时生效，无需刷新。插件启停或升级后，管理员会话会随插件运行状态自动重新读取声明。其他用户无权访问插件运行状态，在切回页面或窗口重新获得焦点时重新读取，30 秒内最多一次。插件不需要轮询。

#### 面板头像与名称

选中插件形象后，Agent 面板头部、空状态和助手消息旁的头像依次使用 `avatar_url`、`preview_url`，图片都加载失败时退回内置图标。面板标题和消息署名使用形象的 `name`。副标题等状态文案保持主应用原样。使用内置机器人时面板保持“智能助手”名称和原图标。

#### 形象组件 props

```ts
{
  agent: MoviePilotAgentHost // 已按当前实例绑定
  pet: AgentPetContext
  api: object // 与其他联邦组件相同的实例作用域 api
  pluginId: string
  sourcePluginId: string
  // 以下仅 renderer 模式
  action: string | null // 当前动作名，动作结束后回到 null
  intent: string // 入口当前状态，见下文对照表
  thinking: boolean // 会话是否正在处理
  motionActive: boolean // 是否允许装饰动作
}

interface AgentPetContext {
  mode: 'stage' | 'renderer'
  key: string
  /** stage 且 bubbles=host 时上报角色在视口中的矩形，主应用把原生气泡画在旁边，null 隐藏气泡。 */
  setBubbleAnchor(rect: { x: number; y: number; width: number; height: number } | null): void
  /** stage 模式声明当前是否正在拖拽，拖拽期间主应用不弹回复预览气泡，agent.preview 事件照常推送。 */
  setInteracting(value: boolean): void
  /** 每用户每形象的小块持久数据。 */
  storage: { get<T = unknown>(): Promise<T | null>; set(value: unknown): Promise<void> }
}
```

`setBubbleAnchor` 和 `setInteracting` 在 renderer 模式下为空操作。

`pet.storage` 保存在用户配置 `AgentPetState.<plugin_id>.<key>`，按用户和形象隔离。值按紧凑 JSON 的 UTF-8 字节计算，不能超过 16KB，超出时 `set` 会 reject，前端和后端都会校验。它适合保存位置、偏好这类小块状态，素材和大段数据请放在插件自己的数据或静态文件里。

renderer 模式下 `motionActive` 合并了页面活动、面板开合、贴边、锚定状态和系统“减少动态效果”，与 stage 模式读取的 `motionAllowed` 口径一致，插件不需要再单独检查 `reducedMotion`。`motionActive` 为 `false` 时形象应保持静止，即使 `action` 仍有值。

#### 宿主能力 `moviepilot:agent`

所有联邦宿主（Page、Config、Dashboard、AppPage）都以 `inject('moviepilot:agent')` 提供同一个 Agent 宿主核心的实例视图，形象组件以 `agent` prop 收到同样的视图。它们共用一条事件总线，同插件和跨插件的自定义事件都能送达。Agent 未启用或入口被隐藏时 `available` 为 `false`，`open` 为空操作。

```ts
interface MoviePilotAgentHost {
  version: 1
  getState(): AgentHostState
  /** 立即以当前快照回调一次，之后每次变化回调。返回取消函数。 */
  subscribe(listener: (state: AgentHostState) => void): () => void
  /** 打开原生面板，重复调用保持打开。draft 只填入输入框，绝不发送。 */
  open(options?: { draft?: string }): void
  close(): void
  /** 订阅事件，返回取消函数。 */
  on(event: string, handler: (payload: AgentHostEvent) => void): () => void
  /** 广播自定义事件。名称不得以 `agent.` 开头，主应用自动附 source=pluginId。 */
  emit(name: string, data?: Record<string, unknown>): void
}

interface AgentHostState {
  available: boolean
  panelOpen: boolean
  thinking: boolean
  phase: 'idle' | 'thinking' | 'tool' | 'awaiting' | 'done' | 'error'
  toolName: string | null
  pageVisible: boolean
  motionAllowed: boolean // 页面活动、隐藏标签页与系统减少动态效果合并后的结论
  reducedMotion: boolean
  theme: 'light' | 'dark'
  isMobile: boolean
  viewport: {
    width: number
    height: number
    keyboardInset: number
    safeArea: { top: number; right: number; bottom: number; left: number }
  }
  panelRect: { x: number; y: number; width: number; height: number } | null
}

interface AgentHostEvent {
  name: string
  source: string // 'host' 或发出事件的 pluginId
  data: Record<string, unknown>
  at: number
}
```

`subscribe` 和 `on` 返回的取消函数可以直接调用。组件卸载时主应用也会清空该实例的全部订阅，插件仍应在 `onBeforeUnmount` 中清理自己的计时器和 DOM 监听。以 `agent.` 开头的名称或空名称调用 `emit` 会被忽略并在控制台警告。

主应用事件全部以 `agent.` 开头，插件不能发出。事件总线由所有联邦组件共享，`agent.preview` 的回复预览和 `agent.error` 的错误信息对当前页面上任何订阅了它们的联邦组件都可见，不只限于形象组件。

| 事件                                          | data                                               | 触发时机                                                     |
| --------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `agent.panel.open` / `agent.panel.close`      | 空                                                 | 面板打开或关闭                                               |
| `agent.thinking.start` / `agent.thinking.end` | 空                                                 | 会话开始处理或处理结束（包括取消和断流放弃）                 |
| `agent.tool.start` / `agent.tool.end`         | `{ name }`，工具名可能为 `null`                    | 工具开始执行或结束                                           |
| `agent.awaiting`                              | 空                                                 | 出现需要用户选择或确认的卡片                                 |
| `agent.done` / `agent.error`                  | `agent.done` 为空，`agent.error` 为 `{ message? }` | 本轮正常结束或出错                                           |
| `agent.preview`                               | `{ text }`                                         | 面板关闭时的回复预览，约 125ms 节流，面板打开时不发          |
| `agent.bubble`                                | `{ id, kind, variant, title?, text }`              | 主应用通知和 toast 气泡，`kind` 为 `notification` 或 `toast` |

`phase` 由面板的流事件归纳，各值含义如下。

| `phase`    | 含义                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `idle`     | 空闲，或本轮没有收到结束信号就停止（例如用户取消）                         |
| `thinking` | 正在处理，工具结束后也回到这里                                             |
| `tool`     | 工具执行中，`toolName` 为工具名，可能为空                                  |
| `awaiting` | 出现选择或确认卡片，等待用户操作。本轮随后的结束不会覆盖它，直到下一轮开始 |
| `done`     | 本轮正常结束，保持到下一轮开始                                             |
| `error`    | 本轮出错，保持到下一轮开始                                                 |

断流恢复和后台完成的会话从快照恢复，不会补发中间的工具事件。

#### 宿主事件与 renderer 动作对照

renderer 模式由主应用调度动作，插件只需要按 `action` 和 `intent` 播放动画。下表列出主应用事件和用户操作在入口上产生的 `action` 与 `intent`，stage 形象自己编排动作时也可以参照。

`intent` 是入口当前状态，主应用目前只会传入以下五个值，优先级从上到下。类型中的其他值为预留，插件遇到不认识的值按 `idle` 处理。

| `intent`   | 条件               |
| ---------- | ------------------ |
| `dragging` | 用户正在拖动入口   |
| `docked`   | 入口贴边收起       |
| `thinking` | 会话正在处理       |
| `notify`   | 入口旁正在显示气泡 |
| `idle`     | 其他情况           |

`action` 是一次性动作，播放到该动作的时长后回到 `null`。

| 来源                                                          | `action`                                                                                 | 说明                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `agent.thinking.start`                                        | `scan`                                                                                   | 同时 `intent` 变为 `thinking`                                                                     |
| `agent.thinking.end`                                          | `nod`                                                                                    | 用户未按住或拖动入口时播放                                                                        |
| `agent.panel.close`                                           | `wake`，仍在处理时为 `scan`                                                              | 入口重新出现                                                                                      |
| `agent.panel.open`                                            | 清空为 `null`                                                                            | 入口收起，气泡清空                                                                                |
| `agent.preview`                                               | `nod`                                                                                    | 同一回复只在预览气泡首次出现时播放                                                                |
| `agent.bubble`，`variant` 为 `success`                        | `happy-jump`                                                                             |                                                                                                   |
| `agent.bubble`，`variant` 为 `error` 或 `warning`             | `confused`                                                                               |                                                                                                   |
| `agent.bubble`，其他 `variant`                                | `peek`                                                                                   |                                                                                                   |
| `agent.tool.*`、`agent.awaiting`、`agent.done`、`agent.error` | 无独立动作                                                                               | 处理期间 `intent` 保持 `thinking`，结束由 `agent.thinking.end` 的 `nod` 收尾                      |
| 鼠标悬停约 700ms                                              | `wave`，正在 `sleep` 时为 `wake`                                                         |                                                                                                   |
| 鼠标在入口上来回轻抚                                          | `shy`，短时间内反复时为 `eye-roll`                                                       |                                                                                                   |
| 按住约 700ms 不动                                             | `charge`，松开后 `spin-cheer`                                                            |                                                                                                   |
| 拖动后放下                                                    | `nod`，快速摇晃 3 次以上为 `faint`，6 次以上为 `disassemble`，拖动超过 4 秒为 `confused` |                                                                                                   |
| 空闲 12 至 24 秒                                              | 随机池中的一个，不连续重复                                                               | 默认池为 `wave`、`sit`、`sleep`、`stretch`、`peek`、`shy`、`confused`，可用 `random_actions` 限定 |

以下情况不会播放任何动作，`action` 保持 `null`。

- 面板打开、入口贴边收起或正在拖动。
- 页面不在前台活动（`motionActive` 为 `false`）。
- 会话处理中，只有 `scan` 和回复预览的 `nod` 例外。

主应用动作全集及其类别如下，插件不认识某个动作名时可按类别选用相近动画。

| 动作                                                                                 | 类别 |
| ------------------------------------------------------------------------------------ | ---- |
| `nod`、`wake`、`wave`、`eye-roll`、`faint`、`disassemble`、`peek`、`shy`、`confused` | 反应 |
| `sit`、`stretch`                                                                     | 日常 |
| `sleep`                                                                              | 睡眠 |
| `scan`、`charge`                                                                     | 思考 |
| `happy-jump`、`spin-cheer`                                                           | 成功 |

#### 回退与生命周期

- 选中的形象不存在、插件停用、契约版本不认识、联邦加载失败或超过 8 秒、组件运行时抛错时，主应用回退内置机器人并 `console.warn` 一次，不弹提示。8 秒只计 `remoteEntry.js` 和形象组件模块本身的加载。主应用知道生效形象后立即用声明里的 `remote_url` 注册该插件的联邦入口，这一步不计入 8 秒。声明缺少 `remote_url` 时才回退到发现接口，这一步最多等 5 秒，超时按加载失败处理。
- 本次会话内不再重试失败的形象，直到用户重新选择它，或它的声明真正更新过，即声明消失后再出现，或插件版本 `plugin_version` 变化。版本为空时退回比较 `preview_url`、`avatar_url` 里的版本参数。
- 读取声明或用户选择失败、或被路由切换中断时，主应用保留上一份声明和选择，不把读取失败当成改用内置机器人。只有两者都真正读取成功才算服务端确认，确认前沿用浏览器本地记住的形象，没有记录时显示内置机器人。管理员会话在插件状态变化时重试，所有会话在切回页面时重试。
- 主应用按用户在浏览器本地记住上次实际生效的形象及其声明。刷新后若上次是插件形象，主应用在声明和选择接口返回前就用记住的声明开始加载，期间入口保持空白，避免先闪内置机器人，接口返回后以服务端结果为准。记住的是用户选定的形象，一次加载失败或超时不会改写它，下次刷新仍先尝试该形象。服务端确认改为内置机器人后才记为内置，退出登录时清除。本地没有任何记录时（首次登录、换了浏览器或刚退出登录），入口在接口返回前保持空白，最多等待 3 秒，之后才显示内置机器人。这只是加速提示，不改变上面的选择与回退规则。
- 每个页面会话只挂一个形象实例。退出登录、关闭 Agent、隐藏入口、切换形象时卸载形象组件，主应用同时清空该实例的订阅，插件在 `onBeforeUnmount` 中清理自己的资源。
- 切换形象时主应用清空旧形象上报的气泡锚点和拖拽状态。

#### stage 最小示例

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ agent: any; pet: any; pluginId: string }>()
const position = ref({ x: window.innerWidth - 120, y: window.innerHeight - 160 })
const thinking = ref(false)
const scale = ref(1)
const stops: Array<() => void> = []

function reportAnchor() {
  props.pet.setBubbleAnchor({
    x: position.value.x,
    y: position.value.y,
    width: 96 * scale.value,
    height: 128 * scale.value,
  })
}

onMounted(async () => {
  const saved = await props.pet.storage.get<{ x: number; y: number }>()
  if (saved) position.value = saved
  reportAnchor()
  stops.push(props.agent.subscribe((state: any) => (thinking.value = state.thinking)))
  stops.push(
    props.agent.on('agent.done', () => {
      /* 播放庆祝动作 */
    }),
  )
  stops.push(
    props.agent.on('pet.config', (event: any) => {
      if (event.source !== props.pluginId) return
      scale.value = Number(event.data.scale) || 1
      reportAnchor()
    }),
  )
})

onBeforeUnmount(() => stops.forEach(stop => stop()))
</script>

<template>
  <button
    class="my-pet"
    :class="{ 'is-thinking': thinking }"
    :style="{ left: `${position.x}px`, top: `${position.y}px`, transform: `scale(${scale})` }"
    @click="agent.open()"
  />
</template>

<style scoped>
.my-pet {
  position: fixed;
  pointer-events: auto; /* 图层本身不接收点击，角色元素需要显式打开 */
  inline-size: 96px;
  block-size: 128px;
}
</style>
```

拖拽角色时调用 `pet.setInteracting(true)`，放下后调用 `pet.setInteracting(false)`、更新锚点，并用 `pet.storage.set(position)` 记住位置。

#### 设置页实时预览

插件自己的 Page、Config 或 AppPage 修改角色大小、移动速度或切换角色时，用同一条总线通知正在运行的形象，不必等保存或刷新。

```vue
<script setup lang="ts">
import { inject, ref } from 'vue'

const props = defineProps<{ initialConfig: Record<string, any> }>()
const agent = inject<any>('moviepilot:agent', null)
const config = ref({ ...props.initialConfig })

function previewScale(scale: number) {
  config.value.scale = scale
  // source 由主应用自动填为当前插件实例 ID，形象可据此只响应自己插件的事件。
  agent?.emit('pet.config', { scale })
}

function tryOpen() {
  // 只填入输入框，不会替用户发送。
  agent?.open({ draft: '帮我看看今天的下载情况' })
}
</script>

<template>
  <VSlider :model-value="config.scale" :min="0.5" :max="2" :step="0.1" @update:model-value="previewScale" />
  <VBtn :disabled="!agent?.getState().available" @click="tryOpen">试一下</VBtn>
</template>
```

形象组件中 `agent.on('pet.config', handler)` 即可收到（见上方 stage 示例）。保存配置仍走插件自己的 API，事件只负责实时预览。用户取消配置时，再 emit 一次原值让形象恢复。

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
