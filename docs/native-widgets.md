# App 小组件桥

普通网页、PWA 和旧 App 不启用此能力，也不会新增小组件请求。新容器须在主文档开始时
声明 `MoviePilotNative.widgetsVersion = 1`，双方通过 `web.ready` / `host.configure`
协商 `widgets.v1`，且完成原生导航接管后才可使用。

## 固定操作

原生发送现有会话外壳中的 `widget.request`，携带当前 `routeRevision`。`payload` 仅接受下表字段：

| operation  | 其他字段                       | 行为                                                            |
| ---------- | ------------------------------ | --------------------------------------------------------------- |
| `context`  | 无                             | 用既有主登录读取当前不可变 `owner` 和可用内容，不创建或轮换授权 |
| `register` | `owner`、UUID `installationId` | 先核对当前账号，再登记本机三十天只读授权                        |
| `revoke`   | `owner`、UUID `registrationId` | 先核对当前账号，再移除自己的单个登记                            |
| `open`     | `owner`、`content`             | 重新核对当前账号和权限，通过原 Router 打开固定内容页            |

`content` 只接受 `overview`、`downloads`、`imports`、`movieSubscriptions`、`tvSubscriptions`
和 `musicSubscriptions`。弹层打开时不执行跳转；路由守卫仍决定访问是否成功。
这些请求不能指定任意 URL、HTTP 方法、主登录凭据、权限或业务命令。

前端复用现有 API 客户端及主登录拦截器，只调用与主文档精确同源的固定 `api/v1/widget/`
接口。服务端接口须支持当前小组件协议；旧版本会得到固定 `unsupported` 原因，不回退到通用 API。

## 结果与生命周期

结果通过专用 `widget.result` 返回，`payload.requestId` 对应请求外壳的 `requestId`。
成功为 `{ requestId, success: true, data }`，失败为 `{ requestId, success: false, error }`。
失败仅含固定原因，不透传后端错误正文。登记的 `data` 是唯一包含专用 `secret` 的结果；
它不能进入导航快照、菜单、普通 `command.result` 或重放缓存。主登录 token 始终留在网页中。

同会话一次只执行一个请求，最多记录 128 个请求标识；重复 ID 不再次执行或返回旧凭据。
结果上限 2 KiB，15 秒取消，不自动重试写请求。原生取消等待时发送
`widget.cancel`，载荷为 `{ requestId }`，只能取消当前会话中对应的在途请求。
关闭接管、后台、身份变化或重新协商会取消等待并丢弃迟到结果；新的会话不继承旧请求。

网页退出会在清空主 token 前同步发送空载荷的 `widget.logout`。宿主负责立即清理当前实例
的小组件资料、快照和共享 Keychain，并使用专用凭据尽力自撤销。离线不阻断本地退出。
此桥不承诺网络取消能回滚已经提交的登记；响应丢失后，用户再次登记同安装会原子轮换旧授权。
