# MoviePilot 插件远程组件示例

这是 MoviePilot 插件远程组件的示例项目，展示了如何正确配置和开发与主应用兼容的远程组件。本示例包含 Page、Config、Dashboard、AppPage，以及可选的 `AppPageSettings`（`nav_key=settings` 时由主应用优先加载，用于演示「一插件多全页界面」）。

## 1. 开发环境准备

### 安装依赖

```bash
npm install
# 或
yarn
```

### 开发模式运行

```bash
npm run dev
# 或
yarn dev
```

## 2. 项目结构

```
plugin-component/
├── src/
│   ├── components/
│   │   ├── Page.vue       # 插件详情页面组件
│   │   ├── Config.vue     # 插件配置页面组件
│   │   ├── Dashboard.vue  # 插件仪表板组件
│   │   ├── AppPage.vue    # 侧栏全页（主内容区，nav_key=main）
│   │   └── AppPageSettings.vue  # 可选第二全页（nav_key=settings）
│   ├── App.vue            # 本地开发入口组件
│   └── main.js            # 本地开发入口文件
├── vite.config.js         # Vite和模块联邦配置
├── index.html             # 本地开发HTML入口
└── package.json           # 依赖配置
```

## 3. 开发指引

- [模块联邦开发指南](../../docs/module-federation-guide.md)
- [模块联邦问题排查指南](../../docs/federation-troubleshooting.md)。
