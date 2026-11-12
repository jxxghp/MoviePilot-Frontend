# Repository Guidelines

MoviePilot v3 前端仓库（Vue 3 + Vuetify 3 + TypeScript + Vite），默认开发分支为 `v3`，最低支持 Node.js `20.19`，推荐使用 Node.js `24`，依赖管理固定使用 Yarn 1 与 `yarn.lock`。

## 文档导航

| 主题                                    | 文档                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 代码质量工具链、ESLint 基线与按需格式化 | [docs/code-quality.md](docs/code-quality.md)                                                                                                                                                                       |
| 单元测试架构、共享测试设施与 CI 门禁    | [docs/testing.md](docs/testing.md)                                                                                                                                                                                 |
| 插件模块联邦开发与排障                  | [docs/module-federation-guide.md](docs/module-federation-guide.md)、[docs/federation-troubleshooting.md](docs/federation-troubleshooting.md)                                                                       |
| 插件前端 SDK v1 宿主能力与公开类型      | [docs/plugin-frontend-sdk.md](docs/plugin-frontend-sdk.md)                                                                                                                                                         |
| 原生菜单、小组件、通行密钥与会话隔离    | [docs/native-menus.md](docs/native-menus.md)、[docs/native-widgets.md](docs/native-widgets.md)、[docs/native-passkey.md](docs/native-passkey.md)、[docs/session-data-isolation.md](docs/session-data-isolation.md) |

## 开发与编码约定

- 遵循仓库 Prettier 与 ESLint 配置（2 空格缩进、单引号、无分号，组件使用 `PascalCase.vue`，组合式函数使用 `useXxx.ts`，保持 `@layouts` 不反向依赖 `@core`）。
- 公开或跨模块契约（`interface`、`type`、`enum`、`props`、`store` state、接口响应映射）及非显然的异步、缓存或模块联邦生命周期补充简明中文注释（JSDoc 或行上/行内注释）。
- 修改受 `eslint-suppressions.json` 管控的生产文件时，同步修复该文件内不改变业务语义的存量问题并运行 `yarn lint:suppressions:prune` 一并提交，不得新增抑制项或使用 `--suppress-all`，也不为清理未触及文件扩大 PR 范围。
- Prettier 采取改到即格式化策略，提交前仅对本次新增或修改的文件运行 `yarn format`，禁止在普通业务 PR 中执行 `prettier . --write` 全仓重排（存量文件重排差异较大时拆分为独立格式 commit）。

## 验证与 Pull Request 要求

- 提交前在本地运行 `yarn format:check`、`yarn lint`、`yarn typecheck` 及受影响范围的 Vitest 测试（全量 `yarn test:run`），涉及依赖、构建配置、路由、静态资源、Vue SFC 入口或模块联邦时额外运行 `yarn build`。
- **真实浏览器界面验证** 凡涉及页面布局、样式、响应式适配、导航或用户交互的改动，必须在真实浏览器（覆盖桌面与移动宽度）核验实际渲染效果、关键交互与控制台无报错，并在 PR 描述中写明浏览器验证情况或附上截图，仅通过组件单测与静态构建的界面改动不足以合入。
- 使用 Conventional Commits 提交，保持单个 PR 聚焦单一主题，除非明确执行版本发布，不修改 `package.json` 中的版本号。
