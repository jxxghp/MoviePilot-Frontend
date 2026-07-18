import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const selectorScript = resolve(process.cwd(), 'scripts/format-changed.mjs')
const temporaryRepositories: string[] = []

function git(repository: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
}

function write(repository: string, filePath: string, content: string) {
  const absolutePath = resolve(repository, filePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content)
}

function createRepository() {
  const repository = mkdtempSync(resolve(tmpdir(), 'moviepilot-format-changed-'))
  temporaryRepositories.push(repository)
  git(repository, 'init', '--initial-branch=v2')
  git(repository, 'config', 'user.name', 'Format Test')
  git(repository, 'config', 'user.email', 'format-test@example.invalid')
  write(repository, '.gitignore', 'coverage/\n')
  write(repository, '.prettierignore', 'generated/\n/vite.config.*.timestamp-*.mjs\n')
  write(repository, 'src/modified.ts', "export const value = 'before'\n")
  write(repository, 'src/rename old.ts', "export const renamed = 'before'\n")
  write(repository, 'src/deleted.ts', 'export const deleted = true\n')
  write(repository, 'coverage/tracked.ts', 'export const generated = true\n')
  git(repository, 'add', '.')
  git(repository, 'add', '--force', 'coverage/tracked.ts')
  git(repository, 'commit', '-m', 'base')

  return repository
}

function runSelector(repository: string, args: string[], env = process.env) {
  const output = execFileSync(process.execPath, [selectorScript, '--list', ...args], {
    cwd: repository,
    encoding: 'utf8',
    env,
    maxBuffer: 128 * 1024 * 1024,
  })

  return JSON.parse(output) as string[]
}

function listSelected(repository: string, ...args: string[]) {
  return runSelector(repository, args)
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) {
    rmSync(repository, { recursive: true, force: true })
  }
})

describe('Prettier 变更文件选择器', () => {
  it('按 base 与 head 选择受支持文件并排除删除、忽略和符号链接', () => {
    const repository = createRepository()
    git(repository, 'switch', '-c', 'feature')
    write(repository, 'src/modified.ts', "export const value='after'\n")
    git(repository, 'mv', 'src/rename old.ts', 'src/rename [new].ts')
    git(repository, 'rm', 'src/deleted.ts')
    write(repository, 'src/new file.vue', '<template><div>new</div></template>\n')
    write(repository, 'src/line\nbreak.ts', 'export const lineBreak=true\n')
    symlinkSync('modified.ts', resolve(repository, 'src/linked.ts'))
    write(repository, 'generated/ignored.ts', 'export const ignored=true\n')
    write(repository, 'coverage/tracked.ts', 'export const generated=false\n')
    write(repository, 'notes.bin', 'not prettier source\n')
    git(repository, 'add', '-A')
    git(repository, 'commit', '-m', 'feature')

    expect(listSelected(repository, '--base', 'v2', '--head', 'HEAD')).toEqual([
      'src/line\nbreak.ts',
      'src/modified.ts',
      'src/new file.vue',
      'src/rename [new].ts',
    ])
  })

  it('本地模式合并分支、工作区和未跟踪文件，并排除删除、忽略和符号链接', () => {
    const repository = createRepository()
    git(repository, 'switch', '-c', 'feature')
    write(repository, 'src/modified.ts', "export const value='working-tree'\n")
    write(repository, 'src/untracked file.ts', 'export const untracked=true\n')
    write(repository, 'scripts/feature.timestamp-parser.mjs', 'export const parser=true\n')
    write(repository, 'vite.config.ts.timestamp-123-generated.mjs', 'export const temporary=true\n')
    symlinkSync('modified.ts', resolve(repository, 'src/untracked-link.ts'))
    write(repository, 'generated/untracked.ts', 'export const ignored=true\n')
    git(repository, 'rm', 'src/deleted.ts')

    expect(listSelected(repository)).toEqual([
      'scripts/feature.timestamp-parser.mjs',
      'src/modified.ts',
      'src/untracked file.ts',
    ])
  })

  it('没有受支持的变更文件时正常通过', () => {
    const repository = createRepository()

    expect(listSelected(repository, '--base', 'HEAD', '--head', 'HEAD')).toEqual([])
    expect(
      spawnSync(process.execPath, [selectorScript, '--check', '--base', 'HEAD', '--head', 'HEAD'], {
        cwd: repository,
      }).status,
    ).toBe(0)
  })

  it('显式比较必须同时提供 base 与 head', () => {
    const repository = createRepository()
    const result = spawnSync(process.execPath, [selectorScript, '--check', '--base', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--base 与 --head 必须一起使用。')
  })

  it('通过参数数组安全格式化特殊文件名', () => {
    const repository = createRepository()
    git(repository, 'switch', '-c', 'feature')
    write(repository, '--special [file].ts', 'export const special=true\n')

    execFileSync(process.execPath, [selectorScript, '--write'], { cwd: repository })

    expect(readFileSync(resolve(repository, '--special [file].ts'), 'utf8')).toBe('export const special = true;\n')
  })

  it('本地基线使用完整分支引用，不受同名标签影响', () => {
    const repository = createRepository()
    git(repository, 'switch', '-c', 'feature')
    write(repository, 'src/modified.ts', "export const value='feature'\n")
    git(repository, 'add', 'src/modified.ts')
    git(repository, 'commit', '-m', 'feature')
    git(repository, 'tag', 'v2', 'HEAD')

    expect(listSelected(repository)).toEqual(['src/modified.ts'])
  })

  it('首个候选没有 merge base 时回退到后续可比较分支', () => {
    const repository = createRepository()
    const baseCommit = git(repository, 'rev-parse', 'HEAD')
    git(repository, 'switch', '-c', 'feature')
    write(repository, 'src/modified.ts', "export const value='feature'\n")
    git(repository, 'add', 'src/modified.ts')
    git(repository, 'commit', '-m', 'feature')
    const tree = git(repository, 'rev-parse', `${baseCommit}^{tree}`)
    const unrelatedCommit = execFileSync('git', ['commit-tree', tree, '-m', 'unrelated'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim()
    git(repository, 'update-ref', 'refs/remotes/upstream/v2', unrelatedCommit)
    git(repository, 'update-ref', 'refs/remotes/origin/v2', baseCommit)

    expect(listSelected(repository)).toEqual(['src/modified.ts'])
  })

  it('纳入转为普通文件的类型变更，并继续排除最终为符号链接的路径', () => {
    const repository = createRepository()
    symlinkSync('modified.ts', resolve(repository, 'src/to-regular.ts'))
    write(repository, 'src/to-link.ts', 'export const link = false\n')
    git(repository, 'add', 'src/to-regular.ts', 'src/to-link.ts')
    git(repository, 'commit', '-m', 'type-change base')
    git(repository, 'switch', '-c', 'feature')
    rmSync(resolve(repository, 'src/to-regular.ts'))
    write(repository, 'src/to-regular.ts', 'export const regular=true\n')
    rmSync(resolve(repository, 'src/to-link.ts'))
    symlinkSync('modified.ts', resolve(repository, 'src/to-link.ts'))
    git(repository, 'add', '-A')
    git(repository, 'commit', '-m', 'type changes')

    expect(listSelected(repository, '--base', 'v2', '--head', 'HEAD')).toEqual(['src/to-regular.ts'])
  })

  it('Git 路径输出超过默认缓冲区时仍能完成选择', () => {
    const repository = createRepository()
    const wrapperDirectory = resolve(repository, '.test-bin')
    const wrapperPath = resolve(wrapperDirectory, 'git')
    write(
      repository,
      '.test-bin/git',
      `#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { writeSync } = require('node:fs')
const args = process.argv.slice(2)
if (args[0] === 'ls-files') {
  const output = Buffer.from('src/modified.ts\\0'.repeat(300_000))
  let offset = 0
  while (offset < output.length) offset += writeSync(1, output, offset)
  process.exit(0)
}
const result = spawnSync('git', args, {
  env: { ...process.env, PATH: process.env.REAL_GIT_PATH },
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
`,
    )
    chmodSync(wrapperPath, 0o755)

    expect(
      runSelector(repository, [], {
        ...process.env,
        PATH: `${wrapperDirectory}${delimiter}${process.env.PATH ?? ''}`,
        REAL_GIT_PATH: process.env.PATH ?? '',
      }),
    ).toEqual(['src/modified.ts'])
  })
})
