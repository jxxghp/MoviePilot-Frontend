# App 通行密钥验证页

`native-passkey.html` 是 App 系统认证会话使用的独立入口。它只调用浏览器 WebAuthn，不加载主 App、路由、账户存储或认证 API；普通网页的登录流程不变。`native-passkey.json` 声明协议 `moviepilot.passkey`、版本 `1`，供兼容 App 在展示登录入口前探测。

App 通过现有 `mfa/passkey/authenticate/start` 获取挑战，将 `transaction_token` 留在 App 内存中。页面只接收 `#request=<Base64URL(JSON)>`，内容为 `{ version: 1, state, options }`；`state` 为 App 生成的 32 字节随机数，`options` 为后端公开的 WebAuthn 请求选项。页面载入立即清除 fragment，不接受 query、事务令牌或自定义重定向地址。

用户在 App 点击登录后，专用页载入即调用一次 `navigator.credentials.get`，无需再点“继续”。每个页面只请求一次，取消或失败自动返回原生登录页。结果通过固定 `moviepilot://passkey/callback#result=<Base64URL(JSON)>` 交回发起会话，内容为 `{ version: 1, state, credential }` 或 `{ version: 1, state, error }`。错误码只允许 `canceled`、`expired`、`unsupported`、`invalid`、`failed`，不包含原始异常。

页面要求 HTTPS（仅本机开发允许 HTTP），核对 RP 域、challenge、origin、认证类型及数据长度。请求最多持续两分钟；取消、超时或关闭页面后不交付迟到结果。App 必须独立核对当前实例、随机 state、有效期及断言内容，再使用内存中的事务令牌调用既有 finish 接口。后端继续负责签名、用户状态、权限和会话签发。

此页不提供通行密钥注册功能，也不修改已保存凭据。真实系统密码管理器和 Face ID 的成功路径需要在支持的 iPhone 上验收。

Apple 允许首次页面加载自动发起一次模态请求，详见 [Meet passkeys](https://developer.apple.com/videos/play/wwdc2022/10092/)。任意自部署域名通过系统网页认证会话使用此入口；系统可能显示认证窗口，不能将其描述为已完成域名关联的直接原生调用。
