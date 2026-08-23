# MoviePilot-Frontend

_[中文](README.md) | English_

Frontend project for [MoviePilot](https://github.com/jxxghp/MoviePilot). The minimum supported Node.js version is
`20.19`; Node.js `24` is recommended.

## Features

- Modern interface built with Vue 3 and Vuetify 3
- Fast development experience with Vite build tool
- Multi-language support (Chinese/English)
- Complete plugin system with dynamic remote component loading

## Development

### Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=johnsoncodehk.volar) (disable Vetur).

### Configure Vite

See [Vite Configuration Reference](https://vitejs.dev/config/).

### Install Dependencies

```sh
yarn
```

### Development Server

```sh
yarn dev
```

### Build for Production

```sh
yarn build
```

### Unit Tests

```sh
yarn test:run
yarn test:coverage
```

See the [unit testing architecture](docs/testing.md) for test organization, shared facilities, HTTP fixtures, and
coverage conventions. See the [frontend code quality evolution](docs/code-quality.md) for ESLint, Prettier, Node.js
compatibility, and incremental CI gates.

### Static Deployment

1. Host the `dist` static files using a web server like `nginx`. Refer to `public/nginx.conf` for nginx configuration.

2. Alternatively, run the `service.js` directly with the `node` command. It listens on port `3000` by default. Set the `NGINX_PORT` environment variable to adjust the port.

```shell
node dist/service.js
```

### Module Federation

MoviePilot now supports Module Federation, allowing plugin developers to create dynamically loadable remote components for richer plugin user interfaces.

- [Module Federation Troubleshooting Guide](docs/federation-troubleshooting.md) - Common issues and solutions
- [Plugin Remote Component Example](examples/plugin-component/) - Complete example project for developing plugin components
