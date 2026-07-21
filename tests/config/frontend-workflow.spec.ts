import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = resolve(process.cwd(), '.github/workflows/test.yml')
const testingGuidePath = resolve(process.cwd(), 'docs/testing.md')
const codeQualityGuidePath = resolve(process.cwd(), 'docs/code-quality.md')

describe('前端测试 workflow', () => {
  it('在 PR 与 v2 push 上运行，并将变更文件格式检查限制为 PR', () => {
    const workflow = readFileSync(workflowPath, 'utf8')
    const formatJob = workflow.match(/\n {2}format:\n(?<job>[\s\S]*?)(?=\n {2}[\w-]+:\n|$)/)?.groups?.job
    const qualityJob = workflow.match(/\n {2}typecheck-and-coverage:\n(?<job>[\s\S]*?)(?=\n {2}[\w-]+:\n|$)/)?.groups
      ?.job

    expect(workflow).toContain('permissions:\n  contents: read')
    expect(workflow).toContain('pull_request:\n    branches:\n      - v2')
    expect(workflow).toContain('push:\n    branches:\n      - v2')
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}')
    expect(formatJob).toBeDefined()
    expect(formatJob).toContain("if: github.event_name == 'pull_request'")
    expect(formatJob).toContain('fetch-depth: 0')
    expect(formatJob).toContain("node-version: '24'")
    expect(formatJob).toContain('run: yarn --frozen-lockfile')
    expect(formatJob).toContain('BASE_SHA: ${{ github.event.pull_request.base.sha }}')
    expect(formatJob).toContain('HEAD_SHA: ${{ github.event.pull_request.head.sha }}')
    expect(formatJob).toContain('run: yarn format:check --base "$BASE_SHA" --head "$HEAD_SHA"')
    expect(formatJob).not.toContain('--write')
    expect(qualityJob).toBeDefined()
    expect(qualityJob).toContain('run: yarn typecheck')
    expect(qualityJob).toContain('run: yarn test:coverage')
    expect(workflow).not.toContain('\n  unit-tests:\n')
  })

  it('文档使用当前测试 job 名称和触发范围', () => {
    const testingGuide = readFileSync(testingGuidePath, 'utf8')
    const codeQualityGuide = readFileSync(codeQualityGuidePath, 'utf8')

    expect(testingGuide).toContain('`typecheck-and-coverage` job')
    expect(testingGuide).toContain('推送到 `v2`')
    expect(testingGuide).toContain('只在 Pull Request 事件运行')
    expect(codeQualityGuide).toContain('lint 与 `typecheck-and-coverage` 使用不同 job')
    expect(testingGuide).not.toContain('`unit-tests`')
    expect(codeQualityGuide).not.toContain('`unit-tests`')
  })
})
