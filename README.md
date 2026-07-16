# MoviePilot-Frontend

*中文 | [English](README_EN.md)*

[MoviePilot](https://github.com/jxxghp/MoviePilot) 的前端项目，NodeJS版本：>= `v20.12.1`。

## 特性

- 基于 Vue 3 和 Vuetify 3 构建的现代化界面
- 使用 Vite 作为构建工具，提供快速的开发体验
- 支持多语言（中文/英文）
- 完整的插件系统支持，包括远程组件动态加载


## 开发部署

### 推荐的IDE设置

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) (并禁用 Vetur).

### 配置Vite

请参阅 [Vite 配置参考](https://vitejs.dev/config/).

### 依赖安装

```sh
yarn
```

### 开发运行

```sh
yarn dev
```

### 编译打包

```sh
yarn build
```

### 单元测试

```sh
yarn test:run
yarn test:coverage
```

测试文件组织、共享测试设施、HTTP mock、覆盖率门禁和新增用例规范见[单元测试架构](docs/testing.md)。

### 静态运行

1. 使用 `nginx` 等Web服务器托管 `dist` 静态文件，nginx配置参考 `public/nginx.conf`。

2. 使用 `node` 命令直接运行`service.js`，默认监听 `3000` 端口，设置环境变量 `NGINX_PORT` 来调整运行端口。

```shell
node dist/service.js
```


### 模块联邦功能

MoviePilot 现已支持模块联邦（Module Federation）功能，允许插件开发者创建可动态加载的远程组件，实现更丰富的插件用户界面。

- [模块联邦开发指南](docs/module-federation-guide.md) - 如何开发远程组件插件
- [模块联邦问题排查指南](docs/federation-troubleshooting.md) - 常见问题和解决方案
- [插件远程组件示例](examples/plugin-component/) - 开发插件组件的完整示例项目 
