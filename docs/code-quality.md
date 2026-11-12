# 前端代码质量与检查规范

本文档说明 MoviePilot-Frontend 现行的代码质量工具链、Node 与依赖边界、渐进治理规则及提交前检查要求。人工开发者与自动化 Agent 统一通过仓库 `yarn` 命令完成验证，编辑器插件仅作即时辅助反馈，不替代项目命令与 CI 门禁。

## 工具职责

| 工具                   | 职责                                                                                                                                                              | 不负责                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| ESLint                 | JavaScript、TypeScript、Vue 代码质量、框架约束与模块边界（如 `@layouts` 不反向依赖 `@core`、Vuetify 点号 slot 兼容、浏览器与 Node globals 分域、禁止 `debugger`） | 缩进、换行、引号、属性布局等代码格式       |
| Prettier               | 确定且可复现的文件级代码格式                                                                                                                                      | 未使用变量、Vue 语义规则、复杂度与模块边界 |
| TypeScript / `vue-tsc` | TypeScript 与 Vue 模板类型检查                                                                                                                                    | 代码格式与运行时业务行为测试               |
| Vitest                 | 单元测试、组件测试与按需覆盖率报告                                                                                                                                | 生产打包与真实浏览器视觉交互验证           |
| Vite                   | 生产构建与打包期集成验证                                                                                                                                          | 类型完整性与代码质量规则                   |

ESLint 采用显式维护的 flat config，组合 JavaScript、TypeScript、Vue recommended/essential 基线与经过筛选的高信号 SonarJS 安全及正确性规则，关闭与 Prettier 重叠的格式规则以避免循环改写。

## Node 与依赖边界

- 最低支持 Node.js `20.19`，推荐本地开发与 CI 主环境使用 Node.js `24`。
- Yarn 1 与 `yarn.lock` 是唯一依赖事实源，CI 使用 `yarn --frozen-lockfile` 安装。Node 仅用于开发、测试与构建，MoviePilot 正式镜像直接托管预构建静态产物。
- 调整最低 Node 版本属于兼容性变更，须同步更新 `package.json`、`README.md` 与 GitHub Actions workflow 并完成验证。

## 标准命令与 CI 分工

```sh
yarn lint                     # 全仓只读 ESLint 检查
yarn lint:fix                 # 显式执行 ESLint 安全修复
yarn lint:suppressions:prune  # 修复受控文件存量问题后裁剪 eslint-suppressions.json
yarn format                   # 仅格式化相对 v3 基线新增或修改的受支持文件
yarn format:check             # 只读检查上述变更文件格式（CI 传入显式 --base 与 --head）
yarn format:all:check         # 只读测量全仓格式收敛情况
yarn typecheck                # 运行 vue-tsc 类型检查
yarn test:run                 # 本地默认并行执行四个 Vitest shard（加 --serial 切换单进程）
yarn test:coverage            # 按需生成本地覆盖率报告
yarn build                    # 生产构建验证
```

CI workflow 中，`lint` 与 `typecheck` job 分别执行 ESLint 和类型检查，单元测试使用独立的四分片 job 并行执行，本地默认并行执行四个 Vitest shard 并与 CI 共用 `yarn test:run` 入口，而 `format` job 只在 Pull Request 事件检查变更文件。全部 PR 门禁通过后记录 `CI proof`，合并推送在代码树与基线完全匹配时自动复用已验证结果，详见 [单元测试架构](testing.md#命令与-ci)。

## 存量渐进治理规则

### ESLint 受控抑制基线

`eslint-suppressions.json` 仅用于冻结历史遗留问题，防止借“只检查变更行”放过新问题。

- 新增或修改代码严禁引入新违规，禁止将新问题写入基线或使用 `--suppress-all`。
- 业务 PR 修改到受控生产文件时，同步清理该文件内不改变业务语义的存量违规并运行 `yarn lint:suppressions:prune` 提交更新，纯测试、文档或 CI 改动不为清理未触及生产文件扩大 diff。

### Prettier 改到即格式化

- 新增文件与本次 PR 修改的受支持文件必须完整通过 `yarn format:check`，未触及的历史存量文件保持原样，禁止在业务 PR 中运行 `prettier . --write` 等全仓写入命令。
- 本地运行 `yarn format` 或 `yarn format:check` 时，脚本按 `refs/remotes/upstream/v3`、`refs/remotes/origin/v3`、`refs/heads/v3` 顺序解析共同祖先基线并合并工作区变更（自动排除删除文件、构建产物与生成文件）。若单个历史大文件首次格式化产生大量机械差异，建议将机械格式化与业务逻辑拆分为独立 commit 以便审阅。
- 生成文件由对应生成器事实源维护，不直接手改或单独对其运行格式修补。

## 提交前验证顺序

1. 对本次新增或修改文件运行 `yarn format` 并确认 `yarn format:check` 通过。
2. 运行全仓只读 `yarn lint`（若修复了受控存量则先运行 `yarn lint:suppressions:prune`）。
3. 运行 `yarn typecheck`。
4. 按影响面运行聚焦 Vitest 用例或 `yarn test:run`。
5. 涉及依赖、构建配置、Vue SFC 入口或模块联邦时运行 `yarn build`，涉及界面表现时在真实浏览器桌面与移动宽度下完成渲染交互核验。
