import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as prettier from 'prettier'

const DEFAULT_BASE_REFS = ['upstream/v2', 'origin/v2', 'v2']
const PRETTIER_ARGUMENT_BUDGET = 24_000
const prettierCliPath = fileURLToPath(new URL('../node_modules/prettier/bin/prettier.cjs', import.meta.url))

/** 解析 Git 的 NUL 分隔输出，保留文件名中的空格、换行和通配符字符。 */
function parseNullDelimited(output) {
  return output.toString('utf8').split('\0').filter(Boolean)
}

/** 运行只返回仓库相对路径的 Git 查询。 */
function gitPaths(cwd, args) {
  return parseNullDelimited(execFileSync('git', args, { cwd, encoding: 'buffer' }))
}

/** 判断本地仓库是否存在可用于三点 diff 的提交引用。 */
function hasCommitRef(cwd, ref) {
  return (
    spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd,
      stdio: 'ignore',
    }).status === 0
  )
}

/** 把外部引用解析为提交 SHA，后续 Git diff 不再解释用户提供的选项样式字符串。 */
function resolveCommit(cwd, ref) {
  try {
    return execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], {
      cwd,
      encoding: 'utf8',
    }).trim()
  } catch {
    throw new Error(`无法解析 Git 提交引用：${ref}`)
  }
}

/** 为本地命令选择现有 v2 基线；CI 应显式传入事件中的 base/head SHA。 */
function resolveDefaultBase(cwd) {
  const base = DEFAULT_BASE_REFS.find(ref => hasCommitRef(cwd, ref))
  if (!base) {
    throw new Error('无法定位 v2 基线，请通过 --base <ref> 显式指定比较起点。')
  }

  return base
}

/**
 * 收集当前分支相对基线的文件集合。
 * 显式 base/head 模式只读取提交区间，默认本地模式还会合并暂存区、工作区和未跟踪文件。
 */
function collectChangedPaths({ cwd, base, head }) {
  if (Boolean(base) !== Boolean(head)) {
    throw new Error('--base 与 --head 必须一起使用。')
  }

  const explicitRange = Boolean(base)
  const resolvedBase = base ?? resolveDefaultBase(cwd)
  const resolvedHead = head ?? 'HEAD'
  const baseCommit = resolveCommit(cwd, resolvedBase)
  const headCommit = resolveCommit(cwd, resolvedHead)
  const paths = new Set(
    gitPaths(cwd, ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${baseCommit}...${headCommit}`]),
  )

  if (!explicitRange) {
    for (const filePath of gitPaths(cwd, ['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD'])) {
      paths.add(filePath)
    }
    for (const filePath of gitPaths(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])) {
      paths.add(filePath)
    }
  }

  return [...paths]
    .filter(filePath => {
      const absolutePath = resolve(cwd, filePath)
      if (!existsSync(absolutePath)) return false
      try {
        return lstatSync(absolutePath).isFile()
      } catch {
        return false
      }
    })
    .sort()
}

/** 使用仓库 ignore 文件和 Prettier parser 推断筛出真正受格式化工具管理的文件。 */
async function selectPrettierFiles(filePaths, cwd) {
  const ignorePaths = ['.gitignore', '.prettierignore'].map(filePath => resolve(cwd, filePath)).filter(existsSync)
  const selected = []

  for (const filePath of filePaths) {
    const absolutePath = resolve(cwd, filePath)
    const fileInfo = await prettier.getFileInfo(absolutePath)
    if (!fileInfo.inferredParser) continue

    let ignored = false
    for (const ignorePath of ignorePaths) {
      if ((await prettier.getFileInfo(absolutePath, { ignorePath })).ignored) {
        ignored = true
        break
      }
    }

    if (!ignored) selected.push(filePath)
  }

  return selected
}

/** 按保守的参数长度预算拆批，避免大型 PR 超过操作系统命令行上限。 */
function batchPaths(filePaths) {
  const batches = []
  let batch = []
  let length = 0

  for (const filePath of filePaths) {
    if (batch.length > 0 && length + filePath.length + 1 > PRETTIER_ARGUMENT_BUDGET) {
      batches.push(batch)
      batch = []
      length = 0
    }
    batch.push(filePath)
    length += filePath.length + 1
  }

  if (batch.length > 0) batches.push(batch)
  return batches
}

/** 通过参数数组调用项目内 Prettier，避免 shell 展开或拼接特殊文件名。 */
function runPrettier(filePaths, mode, cwd) {
  if (filePaths.length === 0) {
    console.log('没有需要 Prettier 处理的变更文件。')
    return
  }

  for (const batch of batchPaths(filePaths)) {
    const result = spawnSync(process.execPath, [prettierCliPath, mode, '--ignore-unknown', '--', ...batch], {
      cwd,
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      throw new Error(`Prettier ${mode} 失败，退出码：${result.status ?? 'unknown'}`)
    }
  }
}

/** 解析面向开发者和 CI 的稳定命令行契约。 */
function parseArguments(args) {
  const options = { action: undefined, base: undefined, head: undefined }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (['--check', '--write', '--list'].includes(argument)) {
      if (options.action) throw new Error('只能指定 --check、--write 或 --list 中的一种操作。')
      options.action = argument
      continue
    }
    if (argument === '--base' || argument === '--head') {
      const value = args[index + 1]
      if (!value) throw new Error(`${argument} 缺少引用值。`)
      options[argument.slice(2)] = value
      index += 1
      continue
    }
    throw new Error(`未知参数：${argument}`)
  }

  if (!options.action) throw new Error('必须指定 --check、--write 或 --list。')
  return options
}

/** 执行变更文件选择与格式化；显式引用模式为后续 PR workflow 提供确定输入。 */
async function main() {
  const cwd = process.cwd()
  const { action, base, head } = parseArguments(process.argv.slice(2))
  const changedPaths = collectChangedPaths({ cwd, base, head })
  const selectedPaths = await selectPrettierFiles(changedPaths, cwd)

  if (action === '--list') {
    process.stdout.write(`${JSON.stringify(selectedPaths)}\n`)
    return
  }

  runPrettier(selectedPaths, action, cwd)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
