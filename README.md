# MoviePilot-Frontend

[MoviePilot](https://github.com/jxxghp/MoviePilot) 的前端项目，NodeJS版本：>= `v20.12.1`。

## 推荐的IDE设置

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) (并禁用 Vetur).

## 配置Vite

请参阅 [Vite 配置参考](https://vitejs.dev/config/).

## 依赖安装

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

### 静态运行

1. 使用 `nginx` 等Web服务器托管 `dist` 静态文件，nginx配置参考 `public/nginx.conf`。

2. 使用 `node` 命令直接运行`service.js`，默认监听 `3000` 端口，设置环境变量 `NGINX_PORT` 来调整运行端口。

```shell
node dist/service.js
```
