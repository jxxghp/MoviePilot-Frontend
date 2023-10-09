const path = require('node:path')
const express = require('express')
const proxy = require('express-http-proxy')

const app = express()
const port = process.env.NGINX_PORT || 3000

// 后端 API 地址
const proxyConfig = {
  URL: '127.0.0.1',
  PORT: process.env.PORT || 3001
}

// 静态文件服务目录
app.use(express.static(__dirname))

// 配置代理中间件将请求转发给后端API
app.use(
  '/api',
  proxy(`${proxyConfig.URL}:${proxyConfig.PORT}`, {
    // 路径加上 /api 前缀
    proxyReqPathResolver: (req) => {
      return `/api${req.url}`
    }
  })
);


// 处理根路径的请求
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html')) // 指向你的前端入口文件
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
