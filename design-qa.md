# 社区贡献浮层设计验收

final result: passed

## 视觉目标与范围

- 来源：/Users/jxxghp/MPProjects/output/community-badges/01-avatar-drawer.png
- 来源尺寸：1488 × 1056；桌面 CSS 对照尺寸 1440 × 1024。
- 实现：/Users/jxxghp/MPProjects/output/community-badges/implemented-glass-desktop.png
- 实现截图实际像素 1436 × 1021，浏览器 CSS 视口 1440 × 1024；对照时两侧统一缩放至 1440 × 1024，未把这 4 × 3 像素的捕获差作为布局缺陷。
- 状态：已验证、金档、跨领域贡献者，默认收起贡献记录与等级规则。
- 全图对照：/Users/jxxghp/MPProjects/output/community-badges/comparison-full.png
- 卡片区域对照：/Users/jxxghp/MPProjects/output/community-badges/comparison-card.png

这是隔离的生产组件验证页，挂载真实 UserProfile、CommunityContributionDialog、共享弹窗宿主、主题管理器和全局样式，但 API 返回示例贡献数据。不证明运行中的 MoviePilot 已部署新后端，也不把示例账号视为真实贡献者。用户只选择图 1 的浮层，背景仪表板、图 2 个人资料页与图 3 首页组件不属于实现范围。

## 对照结果

- 字体与排版：沿用全局字体与 Vuetify 文字等级；标题、感谢语、身份、贡献摘要与动作层级明确。窄屏感谢语使用平衡换行，未出现末行孤立单字。
- 间距与结构：桌面右侧浮层宽 440 CSS px，头部关闭按钮固定，正文内部滚动；头像菜单的社区贡献入口位于关于上方。320px 下卡片左右各 12px，宽 296px，无横向溢出。
- 颜色与 Token：使用 v-theme 语义色、app-overlay-radius、app-overlay-shadow、app-overlay-border；玻璃浮层通过既有 VDialog 表面规则获得模糊材质，不另造颜色或固定阴影。实际检查 glass/light/dark/purple/transparent 五种主题；none/extra 圆角及 shadow 0/6 组合随全局变化。
- 图像：铜/银/金/核心四张 ImageGen 静态 PNG，512 × 512，保留透明 Alpha；图中金属 Logo 造型允许作为可替换占位资产，与领域图标分开。资产不含背景或称号文字。
- 文案：称号拆分为等级与领域，数字明确使用已采纳贡献口径，展开后分别列出合并 PR 与作者提交；规则说明包含阈值、仓库范围、排除项、数据延迟及核心称号不授予维护权限。

## 已修正的发现

1. [P2] 初次桌面卡片仍在居中位置。通过浮层宿主 justify-content: flex-end 修正；修复后截图 implemented-glass-desktop.png 确认位于右侧。
2. [P2] 初次 320px 卡片贴住右边缘。将移动内容层 margin-inline 改为两侧安全区与 12px 的较大值；修复后 implemented-glass-mobile.png 实测 x=12、right=308、width=296，无横向溢出。
3. [P2] 窄屏感谢语最后一字孤立换行。增加 text-wrap: balance，修复后按两个语义行展示。
4. [P2] 共享浮层关闭后焦点可能指向已隐藏菜单项。关闭事件在 nextTick 将焦点返回头像；浏览器确认 activeElement 的 aria-label 为用户菜单。

## 交互验证

- 右键头像打开菜单；社区贡献位于关于 MoviePilot 上方。
- 打开卡片后原菜单关闭。
- 展开贡献记录、逐仓 PR/提交 GitHub 链接地址检查、展开与收起等级规则。
- 刷新贡献、头像旁勋章开关、开关启用后的独立入口、关闭后返回头像焦点。
- 320px 展开规则后，底部刷新按钮可通过正文滚动触达，头部关闭按钮保留。
- 浏览器控制台 error/warn 检查结果为空。
- 不匹配隐藏入口、普通用户不继承系统 Token、迟到异步结果丢弃由组件与后端自动化测试覆盖。

## 其他截图

- implemented-light-desktop.png
- implemented-dark-desktop.png
- implemented-purple-desktop.png
- implemented-transparent-desktop.png
- implemented-glass-mobile.png

以上均在 /Users/jxxghp/MPProjects/output/community-badges/。

## 接受的差异与后续

- 按用户反馈，将普通主题色称号标签改为铜/银/金/铂金等级铭牌，使用克制的高光和描边，文字混色及圆角仍由全局 Token 决定；移除可见的 GitHub 身份验证文案与重复验证图标。桌面玻璃/浅色、320px 大圆角组合已复验，无新增 P0/P1/P2。
- 开关文案明确为“在顶部头像旁显示勋章”，默认关闭；它控制额外的小勋章入口，菜单入口仍仅由贡献匹配决定。

- 用户明确先用静态图片，所以没有伪装的旋转、拖拽、暂停控件；正式模型/动画替换时再接入对应交互。
- 用户明确遵循全局主题，所以背景、按钮、圆角、阴影与参考图的固定深蓝/固定发光效果有所不同。
- 勋章展示区较原图紧凑，贡献指标与等级文案按实际接口口径替换；层级与完整动作保持一致。
- [P3] 后续可按正式勋章资产的视觉重心微调舞台尺寸，当前不阻塞使用。
