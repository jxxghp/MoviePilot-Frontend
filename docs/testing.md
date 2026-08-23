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
- `tests/support/msw/response.ts` 显式构造主程序普通 API 的成功或业务失败 envelope。
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

## HTTP 响应夹具

主程序普通 API 使用固定的 `{ success, message, data }` envelope。MSW handler 必须通过
`apiJson(data)` 或 `apiFailureJson(message, data)` 显式声明成功或业务失败，不得在全局 setup 中改写
`HttpResponse.json()`、自动包装裸数据或补齐缺失字段。这样测试夹具与当前后端协议不一致时会直接失败，
不会由兼容层掩盖。

HTTP 4xx/5xx 的原始错误体、插件自定义端点和其他明确不使用主程序 envelope 的协议继续直接调用
`HttpResponse.json()`。是否使用 envelope 由端点契约决定，不根据状态码或载荷形状自动猜测。

## 测试性能

- 根据逐文件和逐用例耗时日志识别热点，不按文件行数或用例数量机械拆分。
- 业务测试可以对与断言无关的第三方重型 UI 边界使用局部 test double，但必须保留 props、emits、
  `v-model`、可访问名称及被测业务使用的值类型；不得以直接赋值组件私有状态替代用户交互。
- 优先减少动画、布局、定位和重复挂载等 jsdom 无法证明的成本。真实组件集成仍由代表性组件测试或浏览器回归负责。
- 优化前后使用同一命令和 reporter 比较 focused 文件与热点用例；只有保持断言和业务契约后取得稳定收益才保留优化。

## 新增测试

1. 业务测试在被测源码所在目录的 `__tests__/` 中创建同名 `*.spec.ts`；工具链配置契约测试放在 `tests/config/`。
2. 纯函数、store 和无渲染模块直接使用 Vitest；Vue 组件使用标准渲染入口。
3. 需要 HTTP 请求时，在 `tests/support/msw/handlers/<domain>.ts` 增加对应 handler。
   主程序普通 API 响应使用 `apiJson()` / `apiFailureJson()`；只有明确的非 envelope 协议才直接使用
   `HttpResponse.json()`。
4. 需要结构化业务数据时，在 `tests/support/factories/` 增加最小工厂。
5. 核心覆盖范围发生变化时，同步更新 `vite.config.ts` 的 `coverage.include`。
6. 提交前按影响面运行测试、类型检查、lint 和生产构建；覆盖率报告按需本地执行。

## 配置边界

Vitest 收集 `src/**/__tests__/**/*.spec.ts` 和 `tests/config/**/*.spec.ts`。测试模式保留 Vue、Vue JSX、Vuetify、自动导入、自动组件和 i18n 插件，并禁用 PWA、模块联邦和 top-level-await 构建插件。配置契约测试随全量测试执行，但不加入业务源码覆盖率统计范围。

当前核心覆盖范围在 `vite.config.ts` 的 `coverage.include` 中显式维护，覆盖率报告写入 `coverage/`。覆盖率配置保留给本地质量分析，不作为 GitHub Actions 的单元测试门禁。

## 命令与 CI

```sh
yarn test          # watch 模式
yarn test:run      # 默认并行两个 shard 单次运行
yarn test:run --serial # 单进程运行，适合排查顺序或共享状态问题
yarn test:coverage # 单次运行并检查覆盖率
yarn test:lint-config # 聚焦执行 ESLint 配置契约测试
yarn typecheck
yarn lint
yarn build
```

`yarn test:run` 默认并行执行两个 Vitest shard，本地全量测试和 CI 使用同一个入口。传入 `--shard=1/2` 之类的显式分片参数时只执行对应 shard；`yarn test:run --serial` 强制单进程运行。传入测试文件或名称过滤条件时自动使用单进程，避免聚焦测试因文件数不足而无法分片。

`Frontend Tests` 工作流使用 Node 24 LTS 和 frozen lockfile，在面向 `v3` 的 Pull Request 和推送到 `v3` 时运行。`lint` job 依次执行全仓只读 ESLint 和类型检查；单元测试 matrix 通过统一入口分别执行两个 Vitest shard，成功用例的标准输出默认静默，失败详情仍保留。CI 不要求覆盖率达标；覆盖率可按需在本地运行 `yarn test:coverage`。变更文件格式检查依赖 Pull Request 的 base/head SHA，因此只在 Pull Request 事件运行。Prettier 和 Node 兼容范围按[前端代码质量工具链演进](code-quality.md)继续渐进接入，新增测试代码不得引入新的 lint 或格式问题。
