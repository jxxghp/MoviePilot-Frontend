import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const packageJsonPath = resolve(process.cwd(), 'package.json')

function planTestRuns(args: string[]): string[][] {
  const script = [
    "import { planTestRuns } from './scripts/run-tests.mjs'",
    `process.stdout.write(JSON.stringify(planTestRuns(${JSON.stringify(args)})))`,
  ].join(';')

  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }),
  )
}

describe('前端测试统一入口', () => {
  it('由项目脚本接管 test:run', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

    expect(packageJson.scripts['test:run']).toBe('node scripts/run-tests.mjs')
  })

  it('全量测试默认拆成两个并行 shard', () => {
    expect(planTestRuns([])).toEqual([['--shard=1/2'], ['--shard=2/2']])
    expect(planTestRuns(['--silent=passed-only'])).toEqual([
      ['--silent=passed-only', '--shard=1/2'],
      ['--silent=passed-only', '--shard=2/2'],
    ])
  })

  it('显式 shard、串行模式和聚焦过滤只启动一个 Vitest 进程', () => {
    expect(planTestRuns(['--shard=2/2', '--silent=passed-only'])).toEqual([['--shard=2/2', '--silent=passed-only']])
    expect(planTestRuns(['--serial', '--silent=passed-only'])).toEqual([['--silent=passed-only']])
    expect(planTestRuns(['tests/config/frontend-workflow.spec.ts'])).toEqual([
      ['tests/config/frontend-workflow.spec.ts'],
    ])
  })
})
