import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 守住 plugin 语言命名空间不再堆积无引用的键。
 *
 * 重写一个组件时留下的旧文案不会让任何测试变红——它既不报错也不显示，只是永远
 * 留在三份语言包里，下一个人读到时无从判断还该不该用。这条检查把那种沉默的堆积
 * 变成一次失败。
 *
 * 只覆盖 plugin：该命名空间没有动态拼键，静态比对即可判定。别的命名空间（anilist、
 * douban.music、setting.system 等）大量使用 `前缀.${变量}` 取键，静态扫描会把仍在
 * 用的键误判成孤儿，照单删会在运行时炸而测试全绿——那需要先逐个命名空间登记动态
 * 访问点，是另一件事。
 */

const projectRoot = resolve(__dirname, '../..')
const localePath = join(projectRoot, 'src/locales/zh-CN.ts')
const NAMESPACE = 'plugin'
const SOURCE_EXTENSIONS = new Set(['.vue', '.ts', '.tsx'])

/** 按大括号配平取出命名空间对象的字面量正文。 */
function namespaceBody(source: string, namespace: string): string {
  const header = new RegExp(`^\\s*${namespace}:\\s*\\{`, 'm').exec(source)
  if (!header) throw new Error(`语言包中找不到命名空间：${namespace}`)
  const start = header.index + header[0].length - 1
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index)
    }
  }
  throw new Error(`命名空间 ${namespace} 的大括号未配平`)
}

/** 取出命名空间正文里的一级键，嵌套对象内部的键不算。 */
function topLevelKeys(body: string): string[] {
  const keys: string[] = []
  let depth = 0
  for (const line of body.split('\n')) {
    const match = /^([a-zA-Z][a-zA-Z0-9_]*):/.exec(line.trim())
    if (match && depth === 1) keys.push(match[1])
    depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0)
  }
  return keys
}

/** 收集除语言包自身之外的全部前端源码文本。 */
function collectSources(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'locales' || entry === 'node_modules') continue
      collectSources(path, collected)
      continue
    }
    if (!SOURCE_EXTENSIONS.has(extname(path))) continue
    collected.push(readFileSync(path, 'utf8'))
  }
  return collected
}

describe('locale orphans', () => {
  it('keeps every plugin translation key referenced by the code', () => {
    const locale = readFileSync(localePath, 'utf8')
    const keys = topLevelKeys(namespaceBody(locale, NAMESPACE))
    expect(keys.length).toBeGreaterThan(0)

    const blob = [...collectSources(join(projectRoot, 'src')), ...collectSources(join(projectRoot, 'tests'))].join('\n')

    // 该命名空间一旦有人把拼出来的键传给 i18n，静态判定就不再可信，这条检查必须先被修正。
    // 只认 i18n 调用点：`plugin.${id}` 这种字面量也用于权限键等场景，与语言包无关。
    expect(blob, '出现了动态拼出的 plugin 语言键，静态孤儿判定已失效').not.toMatch(/\$?\bt\(\s*`plugin\.\$\{/)

    const orphans = keys.filter(key => !blob.includes(`${NAMESPACE}.${key}`))
    expect(orphans, `以下 plugin 语言键已无人引用，请随组件改动一并删除：\n${orphans.join('\n')}`).toEqual([])
  })

  it('keeps the other locales from drifting above the reference namespace', () => {
    // 多出来的键同样是孤儿：zh-CN 是基准，别的语言不该独有 plugin 键
    const reference = new Set(topLevelKeys(namespaceBody(readFileSync(localePath, 'utf8'), NAMESPACE)))
    for (const locale of ['zh-TW', 'en-US']) {
      const body = namespaceBody(readFileSync(join(projectRoot, `src/locales/${locale}.ts`), 'utf8'), NAMESPACE)
      const extra = topLevelKeys(body).filter(key => !reference.has(key))
      expect(extra, `${locale} 的 plugin 命名空间有 zh-CN 没有的键：\n${extra.join('\n')}`).toEqual([])
    }
  })
})
