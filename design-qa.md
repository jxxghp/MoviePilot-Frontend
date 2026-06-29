# Dashboard 后台任务组件 Design QA

- source visual truth path: `/var/folders/bg/whrysxz97c18y269rvshw3n00000gn/T/codex-clipboard-0ce83b91-83e5-4235-b128-a01f7c9fed84.png`
- implementation screenshot path: `/tmp/moviepilot-dashboard-scheduler-card-after.png`
- viewport: 1280 × 720；组件卡片 500 × 350
- state: 浅色主题；1 个运行任务、4 个等待任务

## Full-view comparison evidence

实现保持了原卡片的字体层级、任务头像、标题/副标题结构和卡片尺寸。标题前图标已移除，列表的纵向留白增大，原有任务分隔线不再显示。

## Focused region comparison evidence

卡片区域单独对比后确认：运行任务进度条与任务内容区同宽，右边界均为 868px；运行时钟为主题主色 `rgb(145, 85, 253)`；4 个等待时钟均为中性灰 `rgba(58, 53, 65, 0.6)`；标题区图标数量和分隔线数量均为 0。关键文字、任务头像和图标均清晰，无新增图片资产。

## Findings

- 字体与排版：沿用项目现有字体、字号、字重和截断规则，无可执行偏差。
- 间距与布局：任务间距已增至 0.45rem；状态区并入内容布局，进度条可延伸到最右侧，无重叠。
- 颜色与视觉令牌：等待态使用中性灰，运行态使用主题主色；任务头像和进度条原有任务色保持不变。
- 图片与资产：本组件仅使用既有 Material Design Icons，无图片质量问题或占位资产。
- 文案与内容：沿用后端状态与现有国际化文案，无变更。

## Patches made since previous QA pass

- 移除卡片标题图标。
- 增加任务间距并删除分隔线。
- 重排任务状态区，使进度条铺满剩余内容宽度。
- 统一等待/运行时钟的图标和语义色。

## Follow-up polish

无遗留 P0/P1/P2 问题。

final result: passed
