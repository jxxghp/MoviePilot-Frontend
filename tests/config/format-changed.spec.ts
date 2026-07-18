import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
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

function listSelected(repository: string, ...args: string[]) {
  const output = execFileSync(process.execPath, [selectorScript, '--list', ...args], {
    cwd: repository,
    encoding: 'utf8',
  })

  return JSON.parse(output) as string[]
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
})
