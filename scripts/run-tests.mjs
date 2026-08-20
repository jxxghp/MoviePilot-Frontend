import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const defaultShards = ['1/2', '2/2']
const serialFlag = '--serial'
const vitestCliPath = fileURLToPath(import.meta.resolve('vitest/vitest.mjs'))

/**
 * 生成一次 test:run 所需的 Vitest 参数组。全量测试默认并行；显式分片、串行模式和聚焦过滤保持单进程。
 *
 * @param {string[]} args test:run 接收的命令行参数
 * @returns {string[][]} 每个 Vitest 进程接收的一组参数
 */
export function planTestRuns(args) {
  const vitestArgs = args.filter(arg => arg !== serialFlag)
  const hasExplicitShard = vitestArgs.some(arg => arg === '--shard' || arg.startsWith('--shard='))
  const hasPositionalFilter = vitestArgs.some(arg => !arg.startsWith('-'))

  if (args.includes(serialFlag) || hasExplicitShard || hasPositionalFilter) return [vitestArgs]

  return defaultShards.map(shard => [...vitestArgs, `--shard=${shard}`])
}

function runVitest(args) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, [vitestCliPath, 'run', ...args], {
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', error => {
      console.error(`无法启动 Vitest: ${error.message}`)
      resolveRun(1)
    })
    child.on('close', (code, signal) => {
      if (signal) {
        console.error(`Vitest 被信号 ${signal} 终止`)
        resolveRun(1)
        return
      }

      resolveRun(code ?? 1)
    })
  })
}

async function main() {
  const runs = planTestRuns(process.argv.slice(2))
  const exitCodes = await Promise.all(runs.map(runVitest))

  process.exitCode = exitCodes.find(code => code !== 0) ?? 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}
