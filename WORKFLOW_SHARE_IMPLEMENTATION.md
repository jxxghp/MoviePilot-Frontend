# 工作流分享功能实现

## 概述

基于现有的订阅分享功能，我为工作流模块新增了完整的分享功能，包括分享、浏览、复用和删除等操作。

## 实现的功能

### 1. 类型定义
- 在 `src/api/types.ts` 中新增了 `WorkflowShare` 接口
- 包含分享ID、工作流ID、分享标题、说明、分享人、动作列表、流程等字段

### 2. 前端组件

#### 2.1 工作流分享对话框 (`src/components/dialog/WorkflowShareDialog.vue`)
- 用于创建工作流分享
- 包含分享标题、说明、分享用户等字段
- 支持表单验证和错误处理

#### 2.2 工作流分享卡片 (`src/components/cards/WorkflowShareCard.vue`)
- 显示分享的工作流信息
- 支持点击查看详情和复用
- 显示分享人、复用次数、分享时间等信息

#### 2.3 复用工作流对话框 (`src/components/dialog/ForkWorkflowDialog.vue`)
- 显示工作流详细信息
- 支持复用工作流
- 支持删除分享（仅分享人或管理员）

#### 2.4 工作流分享视图 (`src/views/workflow/WorkflowShareView.vue`)
- 展示所有分享的工作流
- 支持搜索和分页加载
- 使用无限滚动加载更多数据

### 3. 页面集成

#### 3.1 工作流页面 (`src/pages/workflow.vue`)
- 新增标签页结构，分为"工作流"和"工作流分享"两个标签
- 在分享标签页中集成搜索功能和分享列表

#### 3.2 工作流卡片 (`src/components/cards/WorkflowTaskCard.vue`)
- 在右键菜单中新增"分享"选项
- 集成工作流分享对话框

### 4. 多语言支持
- 中文简体 (`src/locales/zh-CN.ts`)
- 中文繁体 (`src/locales/zh-TW.ts`)
- 英文 (`src/locales/en-US.ts`)

### 5. 样式支持
- 新增 `grid-workflow-share-card` CSS类
- 适配工作流分享卡片的网格布局

## API接口

根据提供的后端接口，前端需要调用以下API：

### 分享相关
- `POST /workflow/share` - 新增工作流分享
- `DELETE /workflow/share/{sid}` - 删除工作流分享
- `GET /workflow/shares` - 查询分享的工作流
- `GET /workflow/fork/{shareid}` - 复用分享的工作流

### 复用相关
- `POST /workflow/fork` - 复用工作流（创建新工作流）

## 使用流程

### 分享工作流
1. 在工作流列表页面，点击工作流卡片的菜单按钮
2. 选择"分享"选项
3. 在弹出的对话框中填写分享标题、说明和分享用户
4. 点击"确认分享"完成分享

### 浏览和复用分享
1. 切换到"工作流分享"标签页
2. 浏览分享的工作流列表
3. 点击任意分享卡片查看详情
4. 在详情对话框中点击"复用工作流"按钮
5. 系统会创建新的工作流并跳转到编辑页面

### 搜索分享
1. 在分享页面顶部的搜索框中输入关键字
2. 按回车或点击搜索按钮
3. 系统会过滤显示匹配的分享

### 删除分享
1. 在分享详情对话框中，如果是分享人或管理员
2. 点击"取消分享"按钮
3. 确认删除操作

## 技术特点

1. **响应式设计**: 支持不同屏幕尺寸的适配
2. **无限滚动**: 使用虚拟滚动优化大量数据的加载
3. **多语言支持**: 完整的中英文界面
4. **错误处理**: 完善的错误提示和异常处理
5. **用户体验**: 流畅的动画效果和交互反馈

## 文件结构

```
src/
├── api/
│   └── types.ts                    # 新增 WorkflowShare 接口
├── components/
│   ├── cards/
│   │   ├── WorkflowTaskCard.vue    # 修改：新增分享功能
│   │   └── WorkflowShareCard.vue   # 新增：分享卡片组件
│   └── dialog/
│       ├── WorkflowShareDialog.vue # 新增：分享对话框
│       └── ForkWorkflowDialog.vue  # 新增：复用对话框
├── views/
│   └── workflow/
│       └── WorkflowShareView.vue   # 新增：分享视图
├── pages/
│   └── workflow.vue                # 修改：新增标签页
├── locales/
│   ├── zh-CN.ts                    # 修改：新增中文翻译
│   ├── zh-TW.ts                    # 修改：新增繁体翻译
│   └── en-US.ts                    # 修改：新增英文翻译
└── styles/
    └── custom.scss                 # 修改：新增样式类
```

## 注意事项

1. 需要后端提供相应的API接口支持
2. 分享功能需要用户权限控制
3. 工作流复用时会创建新的工作流实例
4. 删除分享需要验证用户权限
5. 搜索功能支持按工作流名称过滤

## 后续优化建议

1. 添加分享统计功能
2. 支持分享分类和标签
3. 添加分享评分和评论功能
4. 支持批量操作
5. 添加分享历史记录