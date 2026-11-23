# 插件前端 SDK v1

本契约为联邦插件提供宿主能力。SDK 主版本为 `1`，统一注入键为 `moviepilot:sdk`，组件 prop 为 `hostSdk`。主程序版本和 SDK 版本分别维护；插件通过能力检测决定可用功能。

当前源码新增此 SDK，实际可用性以包含本实现的前端发行包为准。旧版官方前端不会因为插件升级而自动获得本契约。

## 公开文件

唯一契约源为 `src/sdk/plugin.ts`，Agent 类型沿用 `src/types/agentHost.ts`。`npm run build:plugin-sdk` 从上述源码生成公开产物，开发启动和生产构建前均自动执行。

| 相对前端部署根目录的地址   | 内容                                              |
| -------------------------- | ------------------------------------------------- |
| `plugin-sdk/v1/index.js`   | 无宿主实现依赖的 ESM 常量、版本识别和契约构造工具 |
| `plugin-sdk/v1/index.d.ts` | API、界面、订阅、上下文、能力及 SDK 类型          |
| `plugin-sdk/v1/agent.d.ts` | Agent 与形象类型                                  |

插件可下载这三个文件至自身的 `sdk/moviepilot/v1/`，保留相对路径，从本地目录导入。SDK 运行时不导入另一份 Vue；类型中的 `Component` 使用插件已有的 Vue 类型，无需引用宿主的 `@/api`、组件、Store 或 composable。

`npm run check:plugin-sdk` 校验产物与源码一致。同一 SDK 主版本仅作向后兼容的增补；不兼容变更使用新主版本和新目录。未知主版本不能按 v1 强行调用。

## 使用入口

```vue
<script setup lang="ts">
import { inject } from 'vue'
import { isPluginHostSDK, PLUGIN_HOST_SDK_KEY } from './sdk/moviepilot/v1/index.js'
import type { PluginHostProps } from './sdk/moviepilot/v1/index.js'

const props = defineProps<PluginHostProps>()
const injected = inject<unknown>(PLUGIN_HOST_SDK_KEY, null)
const candidate = props.hostSdk ?? injected
const sdk = isPluginHostSDK(candidate) ? candidate : null

async function editSubscription(subscriptionId: number) {
  if (!sdk?.supports('subscription.manage.edit')) return
  return sdk.subscriptions?.manage?.({
    action: 'edit',
    subscriptionId,
    onChanged: () => reloadSubscriptions(),
  })
}
</script>
```

`reloadSubscriptions()` 由插件实现。跨联邦组件优先透传 `hostSdk` prop，也可在共享 Vue 运行时的深层组件中注入。不要将 SDK 放入跨账号、跨实例的全局单例。

## 能力矩阵

| 能力                                                                      | Page / Config / Dashboard / AppPage | AgentPet |
| ------------------------------------------------------------------------- | ----------------------------------- | -------- |
| `api`、`catalogs.*`、`environment`、`preferences`、`events`、`navigation` | 支持                                | 支持     |
| `ui.toast`、`ui.dialog`、`ui.confirm`                                     | 支持                                | 不提供   |
| `subscription.create`、`subscription.create.music`                        | 支持                                | 不提供   |
| `subscription.manage` 及各动作                                            | 支持                                | 不提供   |
| `media.*`、`resources.*`、`files.*`、`workflows`                          | 支持                                | 不提供   |
| `shell.button`                                                            | 仅 AppPage                          | 不提供   |
| `shell.tabs`                                                              | 仅具备原生页签注册桥的 AppPage      | 不提供   |
| `agent`                                                                   | 支持                                | 支持     |
| `agent.pet`                                                               | 不提供                              | 支持     |

`sdk.capabilities` 是只读列表，`sdk.supports(name)` 对未知能力返回 `false`。能力表示宿主已经实现接口，不代替当前用户权限或服务端授权。Agent 是否启用应读取 `sdk.agent.getState().available`。

`sdk.context` 包含当前 `pluginId`、可选 `sourcePluginId` 和 `surface`。身份与 `sdk.api` 使用动态 getter，切换实例后不会继续返回旧客户端；已取得的旧上下文快照保持旧值。实例标识不能用作授权证明。

## API 与界面

`sdk.api` 支持 `get/post/put/patch/delete/head/options`，返回端点最终 payload，普通宿主响应解包 `data`，插件自定义 payload 保留自身结构。认证、反馈和实例路径映射由宿主管理。公开选项包括参数、请求头、超时、取消信号、响应类型和反馈模式。

`sdk.ui.toast` 提供 `success/info/warning/error`。`sdk.ui.dialog(component, props, events, options)` 返回仅控制该弹窗的 `id/close/updateProps`，主题与公共层由主程序管理。`sdk.ui.confirm(options)` 返回布尔值，取消、遮罩关闭及 Esc 均为 `false`。

## 订阅交互

`sdk.subscriptions.create(media)` 接受统一 `media_source + media_id`，复用电影订阅、电视剧选季及音乐订阅流程。音乐必须传 `type: '音乐'` 和 `music_type: 'album' | 'recording'`，专辑可附带 `total_tracks`；艺术家不能直接订阅。也可使用独立能力 `sdk.subscriptions.createMusic(media)`，会额外检查音乐订阅功能权限。`success=true` 仅表示接受交互；失败返回 `INVALID_MEDIA/PERMISSION_DENIED/HOST_DISPOSED/REQUEST_FAILED`。

`sdk.subscriptions.manage(request)` 只接受管理动作和正整数 `subscriptionId`，宿主重新读取当前用户有权访问的订阅，不信任插件传入的媒体快照或归属。

| 动作               | 原生行为                                             |
| ------------------ | ---------------------------------------------------- |
| `edit`             | 编辑弹窗，保存或移除后通知变更                       |
| `activity`         | 订阅活动弹窗                                         |
| `detail`           | 媒体详情路由，包含音乐                               |
| `search`           | 原生搜索接口，沿用已排队或运行中的反馈               |
| `pause` / `resume` | 确认后修改状态                                       |
| `reset`            | 确认后重置，保留清除下载记录的提示                   |
| `delete`           | 确认后取消订阅                                       |
| `logs`             | 原生订阅日志                                         |
| `files`            | 订阅下载与入库文件                                   |
| `execution`        | 当前执行状态详情；无执行状态时返回 `INVALID_REQUEST` |
| `share`            | 原生订阅分享弹窗                                     |

成功结果为 `{success:true, status:'opened'|'completed'}`。`opened` 不等于已保存；`completed` 表示宿主调用完成，不代表异步搜索或下载完成。只有实际变更成功后才调用 `onChanged`；取消、权限不足或失败不触发刷新。

失败包含稳定 `code`：`INVALID_REQUEST`、`PERMISSION_DENIED`、`CANCELLED`、`BUSY`、`HOST_DISPOSED`、`REQUEST_FAILED`。取消、同项并发与宿主失效带 `cancelled:true`，业务失败可带 `message`。卸载或账号切换后，不再打开延迟弹窗、执行确认后的写入或回调旧插件；确认后再次检查权限。

## 扩展交互

以下交互返回 `PluginOperationResult<T>`，沿用 `success/status/code`。选择器的 `completed` 结果在 `data` 中返回所选值；关闭为 `CANCELLED`，卸载或切换账号/实例为 `HOST_DISPOSED`。媒体选择和文件选择均会在取消或宿主失效时结算 Promise。

| 入口                                                                  | 参数与行为                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `media.detail(media)`                                                 | 使用 `media_source + media_id` 进入影视或音乐原生详情，无需订阅 ID       |
| `media.select({media_source, keyword?, musicTypes?})`                 | 原生媒体选择器，返回统一来源、ID、标题及展示字段                         |
| `media.recognize({path})`                                             | 原生文件名识别接口及识别结果弹窗                                         |
| `resources.search({keyword?, media?, sites?})`                        | 进入原生资源搜索页，保留媒体来源、季、音乐实体类型及站点条件             |
| `resources.download({title?, media?, torrent?})`                      | 原生添加下载弹窗，由用户完成确认；`torrent` 使用后端资源 payload         |
| `files.browse()`                                                      | 进入原生文件管理页                                                       |
| `files.select({storage?, initial?, kind?, multiple?})`                | 文件/目录选择，支持分页、单选及多选，保留云盘 `fileid/pickcode/drive_id` |
| `files.reorganize({items, targetStorage?, targetPath?})`              | 原生手动整理流程，保留预览与确认                                         |
| `files.scrape({items, onChanged?})`                                   | 原生刮削参数弹窗，用户确认后按各文件存储提交，显示进度                   |
| `workflows.manage({action, workflowId?, fromBeginning?, onChanged?})` | `create/edit/design/run/execution/logs`；除 create/logs 外须传正整数 ID  |

工作流 `edit/design` 分别打开基础配置和流程画布；`run` 重新读取授权记录，确认后提交；`execution` 复用原生工作流卡片显示当前执行状态和结果，可手动刷新。主程序没有独立的工作流历史日志界面，`logs` 打开管理员系统日志，不声称返回某个工作流的独立历史。

媒体浏览及选择沿用原生接口和路由授权；资源搜索要求搜索及资源搜索功能权限；下载要求资源搜索或下载管理功能权限；文件操作要求管理及文件管理功能权限；工作流要求管理及工作流功能权限，系统日志另要求管理员。所有交互仍由后端最终授权。打开弹窗只返回 `opened`，不表示下载、整理或刮削已成功。

```ts
if (sdk.supports('media.select')) {
  const selected = await sdk.media?.select({ media_source: 'themoviedb', keyword: '示例' })
  if (selected?.success && selected.data && sdk.supports('resources.search')) {
    await sdk.resources?.search({ media: selected.data })
  }
}
```

## 公共目录、环境与偏好

`catalogs.mediaSources/storages/downloadDirectories/directories/ruleGroups` 查询主程序现有选项。目录查询支持 `directory_type/name/storage_type`，返回统一的 `id/name/storage/path/downloadPath/libraryPath` 等选择字段；不暴露存储连接配置。整理目录要求管理权限，其余公开选择项沿用已登录用户查询接口。

`environment.getSnapshot()` 提供只读的语言、主题、移动端、浏览器网络状态、当前用户摘要、分类权限和功能权限快照。`subscribe(listener)` 立即回调一次并返回取消函数；`hasPermission(permission, feature?)` 按主程序现有权限规则检查。权限查询仅用于界面，不代替服务端授权。

`preferences.get<T>(key)/set(key,value)/remove(key)` 使用当前用户配置 `PluginFrontend.<pluginId>.<key>`，不同用户和插件实例互不混用。key 限制为 1–64 位字母、数字、下划线或连字符，单个值按 JSON UTF-8 限制 16KB；remove 将值置为 null。此接口保存筛选与布局偏好，不应用于保存凭据。读取失败会 reject，不会伪装成没有偏好；切换账号或实例后，迟到结果以 `HOST_DISPOSED` 拒绝。

## 导航、工具栏与事件

`navigation.push/replace({path,query?})` 只接受宿主内部存在的路径，沿用原生路由权限检查；查询参数支持字符串、数字和布尔值。导航取消或被阻止返回 `CANCELLED`。

AppPage 可用 `shell.registerButton(command)` 注册底部附属按钮及菜单，返回本次注册的注销函数。`shell.registerTabs({items,selected,onSelect,buttons?})` 注册头部页签，返回 `update(selected)/dispose()`。页签能力只在宿主同时提供注册与注销桥时声明。命令支持权限、功能权限和禁用状态；离开路由、KeepAlive 失活、卸载或切换账号/实例时释放自身注册，旧实例不能注销新实例的工具栏。

`events.subscribe({path,onMessage,onStatus?})` 使用宿主 SSE 管理器，返回 `close/reconnect`。path 是相对 API 根目录的地址，例如 `plugin/Demo/events`；源插件路径会映射到当前实例，不接受外站地址、越界路径或携带 token/password 的查询参数。认证沿用宿主资源 Cookie，不把 token 放入 URL。`onMessage` 收到 `data/type/lastEventId`；`onStatus` 收到连接状态。

`events.progress({type,onProgress})` 订阅主程序 `system/progress/<type>`，提供 `text/value`，优先使用服务端本地化文案。连接沿用后台暂停、前台恢复和重连策略；取消、卸载或切换账号/实例后自动移除监听并关闭连接。不同调用具有独立监听 ID，不会互相关闭。

偏好、目录和事件接口在参数无效、权限不足、宿主失效或请求失败时可能抛错；调用方应捕获，业务拒绝可读取 `error.code`。环境及事件的取消函数、选择器结果均不需要插件直接管理宿主 Store 或 EventSource。

## 旧接口兼容

现有 `api`、`nativeSubscribe`、身份等 props 继续提供。新增 `subscriptionManager` prop 与 `sdk.subscriptions.manage` 是同一函数。以下独立注入键保留相同服务：

- `moviepilot:toast`、`moviepilot:dialog`、`moviepilot:confirm`
- `moviepilot:nativeSubscribe`、`moviepilot:subscriptionManager`
- `moviepilot:agent`

没有统一 SDK 的旧宿主可按需检测旧键；缺失时提示“当前宿主未提供该能力”，不要笼统要求升级到某个版本。AgentPet 保留现有 `agent/pet/api` props，订阅和事件清理行为保持不变。
