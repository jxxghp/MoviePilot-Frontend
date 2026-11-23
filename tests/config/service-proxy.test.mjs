import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'
import { test } from 'node:test'
import { startMediaUpstream, verifyMediaProxy } from './proxy-stream-fixture.mjs'

const sourceURL = new URL('../../public/service.js', import.meta.url)
const serviceRequire = createRequire(sourceURL)

/** 执行正式服务源码及真实 Express 代理，仅将监听端口替换为随机的回环端口。 */
async function startService(t, upstream) {
  const temporaryRoot = tmpdir()
  await mkdir(temporaryRoot, { recursive: true })
  const directory = await mkdtemp(path.join(temporaryRoot, 'moviepilot-service-proxy-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const serviceFile = path.join(directory, 'service.cjs')
  await copyFile(sourceURL, serviceFile)
  await symlink(fileURLToPath(new URL('../../node_modules/', import.meta.url)), path.join(directory, 'node_modules'))
  const express = serviceRequire('express')
  const originalListen = express.application.listen
  const originalPort = process.env.PORT
  const originalNginxPort = process.env.NGINX_PORT
  let service
  // 保留正式 Express 应用与代理中间件，仅拦截测试服务的监听地址。
  express.application.listen = function listenOnLoopback(_port, callback) {
    service = originalListen.call(this, 0, '127.0.0.1', callback)
    return service
  }
  try {
    process.env.PORT = new URL(upstream.url).port
    process.env.NGINX_PORT = '0'
    serviceRequire(serviceFile)
  } finally {
    express.application.listen = originalListen
    if (originalPort === undefined) delete process.env.PORT
    else process.env.PORT = originalPort
    if (originalNginxPort === undefined) delete process.env.NGINX_PORT
    else process.env.NGINX_PORT = originalNginxPort
  }
  t.after(async () => {
    service.closeAllConnections()
    await new Promise(resolve => service.close(resolve))
  })
  await once(service, 'listening')
  return `http://127.0.0.1:${service.address().port}`
}

test('正式 API 代理保留媒体清单来源与认证，并直接转发 Range 响应', { timeout: 10_000 }, async t => {
  const upstream = await startMediaUpstream(t)
  const base = await startService(t, upstream)
  await verifyMediaProxy(base, upstream)
})
