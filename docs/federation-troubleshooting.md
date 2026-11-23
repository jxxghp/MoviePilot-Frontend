# MoviePilot 模块联邦问题排查指南

本文档提供了针对 MoviePilot 项目中使用模块联邦时可能遇到的常见问题及解决方案。

## 远程组件注册机制

MoviePilot 使用自动注册机制来加载远程组件：

1. 对于使用 Vue 渲染模式的插件，自动注册其远程组件
2. 每个远程组件根据插件 ID 唯一标识，确保不会冲突
3. 在需要加载组件时，会优先检查已注册的组件信息

这种设计使得插件开发者只需专注于组件开发，而不需要担心加载机制的复杂性。

## 常见错误

### 1. "Module name 'vue' does not resolve to a valid URL"

**原因**：远程组件无法正确解析共享依赖的 URL，通常是因为共享依赖配置不正确。

**解决方案**：

1. 在 **插件组件项目** 的 `vite.config.js` 中正确配置共享依赖：

```js
federation({
  // ...
  shared: {
    vue: {
      singleton: true,
      requiredVersion: false, // 关闭版本检查
    },
  },
})
```

2. 在 **主应用** 的 `vite.config.ts` 中确保共享依赖配置正确：

```ts
federation({
  name: 'host',
  remotes: {},
  shared: ['vue', 'vuetify'],
})
```

### 2. "Top-level await is not available in the configured target environment"

**原因**：模块联邦使用了顶层 await，但目标构建环境不支持此功能。

**解决方案**：

在 **主应用** 和 **插件组件项目** 的构建配置中添加 `target: 'esnext'`：

```js
build: {
  target: 'esnext', // 支持顶层await
  // 其他配置...
}
```

### 3. "TypeError: Failed to fetch dynamically imported module"

**原因**：远程组件 JS 文件无法被正确加载，可能是路径错误或网络问题。

**解决方案**：

1. 检查网络请求是否成功（状态码200）
2. 确认组件 URL 是否正确
3. 确保服务器允许访问该 JS 文件（CORS 配置）
4. 检查插件后端是否正确提供了静态文件服务

### 4. 组件加载后渲染为空白或出现错误

**原因**：组件内部代码错误或与主应用不兼容。

**解决方案**：

1. 检查浏览器控制台错误信息
2. 确保组件代码没有语法错误
3. 避免在组件中使用主应用未提供的依赖
4. 确保所有路径（如图片、API请求URL等）都是正确的

## 调试技巧

### 1. 启用详细日志

在浏览器控制台中设置：

```js
localStorage.setItem('debug', 'vite:*')
```

### 2. 分析网络请求

1. 打开浏览器开发者工具
2. 转到 Network 标签页
3. 确认远程组件 JS 文件请求是否成功
4. 分析响应内容是否为有效的 JavaScript

### 3. 隔离测试远程组件

创建一个独立的简单页面来测试插件组件，排除主应用的干扰因素。

## 其他资源

- [MoviePilot 插件组件示例](../examples/plugin-component/)
- [Module Federation for Vite 文档](https://github.com/module-federation/vite)
- [Vite 官方文档](https://vitejs.dev/guide/build.html)
- [从 OriginJS 迁移到 @module-federation/vite](https://github.com/module-federation/vite/blob/main/docs/MIGRATING_FROM_ORIGINJS.md)
