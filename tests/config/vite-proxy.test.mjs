import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import http from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { createServer, loadConfigFromFile } from 'vite'

// 使用仓库真实代理配置，但仅启动回环地址上的独立服务，不加载业务插件或访问真实后端。
const loaded = await loadConfigFromFile({ command: 'serve', mode: 'test' })
const proxyOptions = loaded.config.server.proxy['/api/v1']
const image = Buffer.alloc(8 * 1024 * 1024, 1)

async function startFixture(t, { baseline = false, beforeHeaders = false } = {}) {
  const sockets = new Set()
  let releaseResponse
  let notifyRequest
  const received = new Promise(resolve => {
    notifyRequest = resolve
  })
  const responseGate = new Promise(resolve => {
    releaseResponse = resolve
  })
  const upstream = http.createServer(async (_req, res) => {
    notifyRequest()
    if (beforeHeaders) await responseGate
    if (!res.destroyed) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': image.length })
      res.end(image)
    }
  })
  upstream.on('connection', socket => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')

  let vite
  t.after(async () => {
    releaseResponse()
    for (const socket of sockets) socket.destroy()
    await vite?.close()
    await new Promise(resolve => upstream.close(resolve))
  })
  vite = await createServer({
    configFile: false,
    envFile: false,
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/api/v1': {
          ...proxyOptions,
          target: `http://127.0.0.1:${upstream.address().port}`,
          ...(baseline ? { configure: undefined } : {}),
        },
      },
    },
  })
  await vite.listen()
  return {
    url: `http://127.0.0.1:${vite.httpServer.address().port}/api/v1/system/img/0`,
    sockets,
    received,
    releaseResponse,
  }
}

async function waitForClosed(sockets) {
  const deadline = Date.now() + 2000
  while (sockets.size && Date.now() < deadline) await delay(20)
  assert.equal(sockets.size, 0, '取消请求后，上游连接必须释放')
}

test('对照组：原始代理在响应前取消后保留上游连接', { timeout: 10_000 }, async t => {
  const fixture = await startFixture(t, { baseline: true, beforeHeaders: true })
  const request = http.get(fixture.url)
  request.on('error', () => {})
  await fixture.received
  const closed = new Promise(resolve => request.once('close', resolve))
  request.destroy()
  await closed
  await delay(100)
  fixture.releaseResponse()
  // 超过默认 keep-alive 时间仍不回收，排除普通空闲连接。
  await delay(5500)
  assert.equal(fixture.sockets.size, 1)
})

test('响应前取消：重复请求均释放上游连接', { timeout: 15_000 }, async t => {
  for (let index = 0; index < 8; index++) {
    const fixture = await startFixture(t, { beforeHeaders: true })
    const request = http.get(fixture.url)
    request.on('error', () => {})
    await fixture.received
    request.destroy()
    await waitForClosed(fixture.sockets)
    fixture.releaseResponse()
  }
})

test('响应传输中取消：释放上游连接', { timeout: 5000 }, async t => {
  const fixture = await startFixture(t)
  await new Promise(resolve => {
    const request = http.get(fixture.url, response => {
      response.once('data', () => {
        response.destroy()
        request.destroy()
        resolve()
      })
      response.on('error', () => {})
    })
    request.on('error', () => {})
  })
  await waitForClosed(fixture.sockets)
})

test('正常请求：图片内容完整返回', { timeout: 5000 }, async t => {
  const fixture = await startFixture(t)
  const content = await new Promise((resolve, reject) => {
    http
      .get(fixture.url, response => {
        assert.equal(response.statusCode, 200)
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      })
      .on('error', reject)
  })
  assert.deepEqual(content, image)
})
