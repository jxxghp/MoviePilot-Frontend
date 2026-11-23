import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { test } from 'vitest'

const runNode = promisify(execFile)

/** 让回环代理集成测试进入统一测试门禁，避免 jsdom 改写 Node HTTP 的全局环境。 */
async function verifyIsolatedProxyContracts() {
  await runNode(
    process.execPath,
    ['--test', 'tests/config/service-proxy.test.mjs', 'tests/config/vite-proxy.test.mjs'],
    { cwd: process.cwd(), timeout: 20_000 },
  )
}

test('正式与开发代理保留媒体来源并正确转发流请求', verifyIsolatedProxyContracts, 25_000)
