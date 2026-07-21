# 前端代码质量工具链演进

本文档定义 MoviePilot-Frontend 的代码质量工具链、运行入口和渐进式演进路线。目标是让人工开发者和自动化 Agent 都通过同一组项目命令完成格式化、静态检查、类型检查、测试和构建，并由 CI 在干净环境中复现结果；编辑器及其扩展只提供即时反馈，不作为项目行为的事实源。

## 工具职责

| 工具                   | 职责                                                         | 不负责                                 |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------- |
| ESLint                 | JavaScript、TypeScript、Vue 代码质量，框架约束和项目模块边界 | 缩进、换行、引号、属性布局等代码格式   |
| Prettier               | 可确定、可重复的代码格式                                     | 未使用变量、Vue 规则、复杂度和模块边界 |
| TypeScript / `vue-tsc` | TypeScript 与 Vue 模板类型检查                               | 代码格式和业务行为测试                 |
| Vitest                 | 单元测试、组件测试和覆盖率门槛                               | 生产构建与真实浏览器行为               |
| Vite                   | 生产构建和构建期集成验证                                     | 类型完整性和代码质量规则               |

ESLint 配置由仓库显式维护，不继承 Antfu 等覆盖面较大的个人风格预设。JavaScript、TypeScript 与 Vue 使用各自面向正确性的 recommended/essential 基线；SonarJS 不整包展开 recommended，而只显式启用安全和正确性的高信号规则，避免插件升级隐式扩大检查范围。

历史规则迁移前必须核对当前源码和运行职责，不能仅因为旧配置出现过就写入 baseline。当前保留 Vuetify 点号 slot 兼容、`@layouts` 不反向依赖 `@core`、浏览器与 Node globals 分域及统一禁止 `debugger`。图片/样式 alias 强制只约束 import 拼写且已与当前实践脱节；`useLayouts` 目录限制所针对的 API 从未存在于源码；重复字符串属于高噪声风格治理；伪随机数限制会把界面效果误判为安全问题，因此这四类历史规则不再作为门禁。

Prettier 独立运行，ESLint 中与格式重叠的规则保持关闭。任何编辑器都可以调用项目内 ESLint 和 Prettier，但保存时是否自动执行不影响 CI 结果。

## Node 与依赖边界

- 最低兼容目标为 Node.js 20.19；Node.js 20.19、22 和 24 的开发环境可以安装依赖并运行项目命令。
- 推荐开发环境和 CI 主环境使用 Node.js 24。
- CI 若继续声明兼容 Node.js 20.19，应至少在该版本验证 frozen lockfile 安装、lint、typecheck 和 build；完整覆盖率门禁在 Node.js 24 执行。
- Yarn 1 与 `yarn.lock` 继续作为依赖安装事实源，CI 使用 `yarn --frozen-lockfile`。
- Node 只用于依赖安装、开发、测试和前端构建；MoviePilot 正式 Docker 镜像使用预构建前端产物，不因开发工具链升级而增加 Node 运行时。

最低 Node 版本变化属于开发环境兼容性变更，必须独立说明并在 CI 验证。不得仅提高 `package.json` 的 `engines.node` 而不更新 README、版本文件和 workflow。

## 统一命令

工具链完成演进后，仓库提供以下入口：

```sh
yarn lint          # 只读 ESLint 检查，不修改文件
yarn lint:fix      # 显式执行 ESLint 安全修复
yarn lint:suppressions:prune  # 修复存量问题后裁剪过期 baseline
yarn format            # 格式化当前分支、暂存区、工作区和未跟踪文件中的受支持变更文件
yarn format:check      # 检查相同变更文件，不修改文件
yarn format:all:check  # 只读测量全仓格式收敛情况
yarn typecheck
yarn test:run
yarn test:coverage
yarn build
```

`yarn lint` 不得包含 `--fix`。CI 只运行只读命令，任何自动修改都由开发者或 Agent 在提交前显式执行。

## ESLint 演进：先恢复可执行门禁

ESLint 迁移优先于全仓格式治理，基础设施迁移不夹带批量业务代码修复。

第一阶段完成以下事项：

1. 使用 ESLint 10 flat config，移除旧 `.eslintrc`。
2. 不恢复已删除的 `@antfu/eslint-config-vue`。
3. 显式组合 JavaScript、TypeScript、Vue 和经过审计的 SonarJS 规则。
4. 使用 ESLint 原生 AST 限制维护仍成立的模块边界，并删除只约束 import 拼写或已无现实对象的历史 regex 规则。
5. 只检查 JavaScript、TypeScript、Vue 与相关测试文件；Markdown、JSON、YAML、TOML、构建产物和生成文件不在首阶段扩展范围内。
6. 默认 lint 只读，并提供单独的 `lint:fix`。
7. 对确有价值但存在存量的问题使用明确基线或分阶段启用，不通过全仓自动修复制造大面积混合变更。
8. 项目边界与新增问题门禁使用 Vitest 配置契约测试保护，并随现有 `test:coverage` CI 自动执行。

`eslint-suppressions.json` 只冻结迁移时已经确认的文件、规则和数量。新增问题不得加入 baseline；修复存量问题后运行 `yarn lint:suppressions:prune`，并把裁剪结果与代码修复一同提交。日常开发和 CI 不得使用 `--suppress-all`。

迁移完成的最低验收为：

```sh
yarn --frozen-lockfile
yarn lint
yarn typecheck
yarn test:coverage
yarn build
```

若新配置导致大量与业务目标无关的格式、排序或额外文件类型问题，应停止扩大规则范围，先调整配置职责；不得以一次性自动修复数百个文件作为通过迁移的手段。

## ESLint CI：先观察，再强制

第二阶段在 Pull Request workflow 中增加独立的全仓 `yarn lint` job：

1. lint 与 `typecheck-and-coverage` 使用不同 job，保持静态检查和测试覆盖率职责独立。
2. 初始阶段作为普通 check 运行，不立即配置 required check。
3. workflow 使用 Node 24、frozen lockfile 和只读 `yarn lint`，不执行自动修复或更新 baseline。
4. 观察 fork PR、依赖缓存、执行时间、误报和路径范围。
5. 连续多个 PR 稳定通过后，再由维护者决定是否设为 required。

ESLint CI 必须检查全仓受管源码，而不是只检查 PR 变更文件。已有问题通过规则选择或受控基线管理，保证新问题不能借由“只检查改动行”绕过项目约束。

## Prettier 演进：改到即格式化

Prettier 采用与后端 `unittest → pytest` 相同的渐进原则：不为转换而转换，修改到存量文件时再纳入统一格式。

- **新文件**：必须通过当前 Prettier 配置。
- **修改文件**：Agent 或开发者在提交前对本次触及的受支持文件运行 Prettier。
- **未修改存量文件**：暂时保持原样，不建立一次性全仓格式化任务。
- **大型或高冲突文件**：若格式化产生大量机械差异，格式调整与业务修改拆分为独立 commit；必要时暂缓该文件并记录原因。
- **生成文件**：按生成器事实源管理，不直接用 Prettier 修补生成结果；需要统一格式时修改生成器或生成配置。

Prettier 初始 CI 只检查 Pull Request 新增或修改的受支持文件，并作为变更范围门禁运行。检查脚本应：

1. 从 PR base 与 head 计算文件集合。
2. 排除已删除文件、构建产物、覆盖率报告和生成文件。
3. 仅把 Prettier 支持且由仓库管理的文件传给 `prettier --check`。
4. 文件集合为空时正常通过。

本地直接运行 `yarn format` 或 `yarn format:check` 时，脚本按 `refs/remotes/upstream/v2`、`refs/remotes/origin/v2`、`refs/heads/v2` 的顺序选择与当前提交具有共同祖先的基线，并合并当前工作区与未跟踪文件。完整引用可避免同名标签造成歧义；CI 使用显式提交 SHA 保证输入可复现：

```sh
yarn format:check --base <base-sha> --head <head-sha>
```

文件名通过 Git 的 NUL 分隔输出和 Node 参数数组传递，不经过 shell 字符串拼接；重命名只检查新路径，删除文件、ignore 文件和 Prettier 无法推断 parser 的文件不进入格式检查。

该门禁不要求未修改的存量文件通过 Prettier，但所有进入 PR diff 的受支持文件都必须通过。Prettier 是文件级格式化工具，因此修改存量文件时检查的是整个文件，而不是仅检查变更行。Agent 或开发者应在提交前运行同一项目脚本完成格式化；CI 只验证结果，不自动提交修改。

禁止在普通业务 PR 中直接运行 `prettier . --write` 或其他全仓格式写入命令。`yarn format` 只处理选择器返回的变更文件；单个存量文件被触及时仍可能整体重排，差异过大时应拆分 commit，便于 reviewer 区分机械格式与业务逻辑。

具体交付拆分为：

1. Prettier 基础设施 PR：安装项目 CLI，定义配置、命令、变更文件选择脚本和回归测试，不修改 workflow。
2. 变更文件门禁 PR：复用已合并脚本接入 Pull Request workflow；验证 fork PR、文件重命名、删除文件、空文件集和特殊文件名。初期作为普通 check 观察，稳定后再由维护者通过仓库规则独立配置为 required。
3. 全仓门禁 PR：仅在存量收敛条件满足后择机实施，不与变更文件门禁绑定。

## 全仓格式门禁的启用条件

不单独安排大爆炸式格式化阶段。存量通过日常“改到即格式化”逐步收敛，并定期执行全仓 `yarn format:all:check` 观察剩余范围。

Prettier 3.9.5 基础设施接入时，全仓只读检查在 `v2` 基线报告 203 个存量文件需要格式化。该数字是收敛起点而不是忽略白名单；变更文件仍必须完整通过检查，存量数量随日常修改逐步下降。

变更文件 CI 接入前在 `v2` 再次测量为 206 个文件，较基础设施合并后的 201 个文件出现回升。这说明仅提供本地命令不足以阻止新改动扩大存量；变更文件 check 用于守住新增 diff，不因此要求在本阶段批量格式化已有文件。

变更文件 required check 不需要等待全仓收敛。只有同时满足以下条件，才把 Prettier 从变更文件 required check 切换为全仓 required check：

- 全仓 `yarn format:all:check` 已通过，或仅剩少量可在独立机械提交中安全处理的文件。
- 最近的活跃分支已合并或完成同步，避免集中格式变化制造冲突。
- `yarn lint`、`yarn typecheck`、`yarn test:coverage` 和 `yarn build` 在格式收敛后全部通过。
- Prettier 与 ESLint 不存在反复改写同一文件的规则冲突。
- workflow 已以非 required 状态稳定运行多个 PR。

最终 Pull Request 门禁目标为：

```sh
yarn --frozen-lockfile
yarn format:all:check
yarn lint
yarn typecheck
yarn test:coverage
yarn build
```

PR-Agent、编辑器诊断和人工 review 可以补充判断，但不能替代可重复执行的项目命令。

## Agent 与开发者提交规范

无论改动由 Agent 还是人工完成，提交前遵循同一顺序：

1. 只对本次新增或修改的文件执行 Prettier。
2. 运行全仓只读 lint。
3. 运行 typecheck。
4. 按影响面运行聚焦测试；提交 PR 前运行覆盖率门禁。
5. 涉及构建配置、依赖、Vue SFC 或模块联邦时运行生产 build。

编辑器设置不得成为通过验证的前提。文档、Agent 指令和 PR 说明应引用 `yarn` 命令，而不是“在 VS Code 保存一次”或依赖某个 IDE 扩展完成修复。

## 风险与回滚

| 风险                         | 控制方式                                   | 回滚边界                       |
| ---------------------------- | ------------------------------------------ | ------------------------------ |
| ESLint 自动修复改变语义      | 默认 lint 只读；基础设施迁移不批量 fix     | 独立回退规则或依赖提交         |
| 格式化制造大面积冲突         | 改到即格式化；大型文件拆分机械 commit      | 回退单文件格式 commit          |
| 新规则让所有 PR 变红         | 先测量、再启用；使用受控基线               | 暂停单条规则，不回退整套工具链 |
| 检查范围扩展到生成物或文档   | 首阶段限制文件类型并显式 ignore            | 收窄 flat config 文件匹配      |
| Node 最低版本阻断安装        | 最低保持 20.19，Node 24 作为推荐和主 CI    | 保持兼容 job，版本提升独立处理 |
| 全仓 required check 配置过早 | 先强制变更文件，持续观察全仓剩余范围       | 保留变更文件门禁，暂缓全仓切换 |
| ESLint 与 Prettier 循环改写  | ESLint 关闭格式规则，Prettier 单独负责格式 | 关闭冲突规则并增加回归样例     |

依赖迁移、规则迁移、存量代码修复、格式化和 GitHub required checks 应保持可独立评审、验证和回退，禁止合并成一个难以定位风险的大型变更。
