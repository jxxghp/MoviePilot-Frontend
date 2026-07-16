# 单元测试架构

MoviePilot-Frontend 使用 Vitest 运行单元测试和组件测试，使用 jsdom 提供 DOM 环境。测试代码参与 TypeScript 类型检查，但不作为生产构建入口。

## 测试类型

- 单元测试覆盖纯函数、store、composable、路由规则和独立模块的输入、输出及副作用。
- 组件测试挂载 Vue 组件或页面，覆盖 props、emits、用户交互、可见 DOM、Router、Pinia、HTTP 请求和生命周期清理。
- PWA、Service Worker、模块联邦远程入口、真实布局、拖拽和浏览器原生能力由真实浏览器验证，不由 jsdom 测试单独证明。

## 目录结构

业务 spec 与源码共置在对应责任域的 `__tests__/` 目录中，文件名与被测源码保持一致并使用 `*.spec.ts`：

```text
src/
├── pages/
│   ├── recommend.vue
│   └── __tests__/recommend.spec.ts
├── stores/
│   ├── auth.ts
│   └── __tests__/auth.spec.ts
├── utils/
│   ├── permission.ts
│   └── __tests__/permission.spec.ts
└── views/dashboard/
    ├── MediaRecommend.vue
    └── __tests__/MediaRecommend.spec.ts
```

跨业务 spec 复用的测试设施位于 `tests/`：

```text
tests/
├── setup.ts
└── support/
    ├── render.ts
    ├── factories/
    └── msw/
        ├── server.ts
        └── handlers/
```

- `tests/setup.ts` 注册 DOM matcher、MSW 生命周期、浏览器 API stub 和每例清理逻辑。
- `tests/support/render.ts` 提供带 Vuetify、i18n、Router 和 Pinia 的标准渲染入口。
- `tests/support/factories/` 按业务对象提供最小有效测试数据工厂。
- `tests/support/msw/handlers/` 按业务域定义 HTTP handler；`server.ts` 只负责 MSW server 实例。
- spec 通过 `@tests/*` 访问共享测试设施，通过 `@/*` 访问生产源码。

## 工具职责

- Vitest 提供 runner、断言、mock、fake timers 和覆盖率执行入口。
- Vue Test Utils 用于 Vue 特有的 props、emits、slots 和局部组件控制。
- Testing Library、jest-dom 和 user-event 用于按角色、可访问名称和用户操作验证可见行为。
- MSW 在 HTTP 边界拦截真实 API 客户端请求。未声明请求会使测试失败，测试不得访问真实后端或外网。
- `@pinia/testing` 用于依赖 store 的组件测试；store 自身使用真实 `createPinia()` 测试。

## 编写规范

- 一个 spec 对应一个主要源码文件；测试名称描述可观察行为或业务规则。
- 组件测试断言可见 DOM、emits、路由、请求和持久化结果，不读取组件私有状态或私有方法。
- 纯逻辑优先直接调用；依赖生命周期、provide 或 inject 的 composable 通过宿主组件挂载。
- HTTP handler 和 factory 按业务域拆分，不建立包含所有接口或所有数据字段的全局万能 mock。
- 只在与当前断言无关或无法由 jsdom 正确执行时 stub 子组件、浏览器能力或第三方重型组件。
- 每个用例保持独立，不依赖文件执行顺序；timer、mock、storage、DOM 和未完成请求由全局 setup 恢复。
- 不使用大面积快照或覆盖率占位用例。

## 新增测试

1. 在被测源码所在目录的 `__tests__/` 中创建同名 `*.spec.ts`。
2. 纯函数、store 和无渲染模块直接使用 Vitest；Vue 组件使用标准渲染入口。
3. 需要 HTTP 请求时，在 `tests/support/msw/handlers/<domain>.ts` 增加对应 handler。
4. 需要结构化业务数据时，在 `tests/support/factories/` 增加最小工厂。
5. 核心覆盖范围发生变化时，同步更新 `vite.config.ts` 的 `coverage.include`。
6. 提交前运行测试、覆盖率、类型检查、lint 和生产构建。

## 配置边界

Vitest 只收集 `src/**/__tests__/**/*.spec.ts`。测试模式保留 Vue、Vue JSX、Vuetify、自动导入、自动组件和 i18n 插件，并禁用 PWA、模块联邦和 top-level-await 构建插件。

当前核心覆盖范围在 `vite.config.ts` 的 `coverage.include` 中显式维护。聚合门槛为 Lines、Statements、Functions 不低于 80%，Branches 不低于 75%。覆盖率报告写入 `coverage/`。

## 命令与 CI

```sh
yarn test          # watch 模式
yarn test:run      # 单次运行
yarn test:coverage # 单次运行并检查覆盖率
yarn typecheck
yarn lint
yarn build
```

Pull Request 测试工作流使用 Node 24 LTS 和 frozen lockfile，依次执行类型检查和覆盖率门禁。现有 lint 基线问题按仓库当前维护约定单独处理，新增测试代码不得引入新的 lint 错误。
