# 消息渠道前端验证

导航：[设计](design.md) · [计划](plan.md) · [任务](tasks.md)

## 自动化检查

使用 `yarn.lock` 对应环境运行 `yarn format:check`、`yarn lint`、`yarn typecheck`、`yarn test:run` 和 `yarn build`。完整构建包含图标、插件 SDK 及 PWA 资源生成。

重点回归位于 `src/components/dialog/__tests__`、`src/components/cards/__tests__`、`src/views/setting/__tests__` 与 `src/composables/__tests__`：三页草稿不串写、显式保存、revision 冲突、规则取消不覆盖、过滤不删改原组、批量操作权限及 Web Push 切号竞态。

## 真实浏览器验收

桌面与移动宽度均检查登录、配置导航、单组卡片、更多菜单、三个管理页面、表单间距、规则编辑及过滤、删除影响确认、成功/失败反馈，核对页面和控制台错误。使用独立测试数据，不在正在运行的用户配置上删除连接。

本次提交的实际命令、结果及浏览器范围由关联 PR 描述和 CI 记录维护。真实企业微信验收本次跳过；其它平台回调、私聊/群组能力和生产部署仍需部署方环境。
