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

/**
 * 门禁自身的路径。
 *
 * 本文件里写着喂给扫描函数的合成样本，那些 `plugin.xxx` 是测试输入而非真实引用。
 * 扫进去等于让门禁拿自己的样本证明自己，孤儿和动态拼键都会被样本掩盖。
 */
const gateSpecPath = __filename

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

/**
 * 取出源码里被完整引用到的键名。
 *
 * 引用判定必须落在整个键上。`plugin.update` 与 `plugin.updateHistoryTitle` 是两个
 * 不同的键，只比对前缀子串的话后者会替前者顶包：把 `plugin.update` 的引用删光，
 * 门禁依然全绿，「每个定义键都被真正引用」这条约束就名存实亡。这里一次性把
 * `plugin.` 后面的完整标识符贪婪吃掉再入表，长键只能代表它自己。
 *
 * 右边界不用另外列举，交给标识符字符集自己收尾即可：引号、反引号、右括号、空白、
 * 逗号等任何非 [A-Za-z0-9_] 字符都算键结束，足够宽，不会把正常引用误判成孤儿。
 * `.` 同样算结束，因为 `plugin.sort` 是嵌套对象，真实引用写作 `plugin.sort.xxx`，
 * 这种写法必须仍然算引用到了 `sort`。
 *
 * 左边界挡掉 `xxxplugin.foo` 这类恰好以命名空间收尾的无关标识符。
 *
 * @param source 待扫描的源码文本
 * @param namespace 语言命名空间
 * @returns 该命名空间下出现过完整静态引用的键名
 */
function referencedKeys(source: string, namespace: string): Set<string> {
  const reference = new RegExp(`(?<![A-Za-z0-9_])${namespace}\\.([A-Za-z][A-Za-z0-9_]*)`, 'g')
  return new Set([...source.matchAll(reference)].map(match => match[1]))
}

/**
 * 找出直接传给 i18n 调用、由代码拼出来的该命名空间的键。
 *
 * 静态孤儿判定成立的前提是键名在源码里写全了。一旦有人把键拼出来，扫描就看不见
 * 真正取到的是哪一个，孤儿名单随之不可信——所以这种写法一出现门禁必须先失败，
 * 由人决定是改判定还是改写法，而不是让它带着一份错误的名单继续绿。
 *
 * 两种拼法都要认：模板串插值 t(`plugin.${id}`)，以及字符串拼接 t('plugin.' + id)。
 * 只认前缀落在 i18n 调用实参上的写法：`plugin.${id}` 这类字面量也用于权限键等与
 * 语言包无关的场景，放开到全文会把大量合法写法判成违规。
 *
 * @param source 待扫描的源码文本
 * @param namespace 语言命名空间
 * @returns 命中的调用片段，空数组表示没有动态拼键
 */
function dynamicKeyUsages(source: string, namespace: string): string[] {
  const call = '\\$?\\bt\\(\\s*'
  const interpolated = new RegExp(`${call}\`${namespace}\\.\\$\\{`, 'g')
  const concatenated = new RegExp(`${call}(['"\`])${namespace}\\.[^'"\`\\n]*\\1\\s*\\+`, 'g')
  return [...source.matchAll(interpolated), ...source.matchAll(concatenated)].map(match => match[0])
}

/** 收集除语言包与门禁自身之外的全部前端源码文本。 */
function collectSources(directory: string, collected: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'locales' || entry === 'node_modules') continue
      collectSources(path, collected)
      continue
    }
    if (!SOURCE_EXTENSIONS.has(extname(path))) continue
    if (path === gateSpecPath) continue
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

    const dynamic = dynamicKeyUsages(blob, NAMESPACE)
    expect(dynamic, `出现了动态拼出的 plugin 语言键，静态孤儿判定已失效：\n${dynamic.join('\n')}`).toEqual([])

    const referenced = referencedKeys(blob, NAMESPACE)
    const orphans = keys.filter(key => !referenced.has(key))
    expect(orphans, `以下 plugin 语言键已无人引用，请随组件改动一并删除：\n${orphans.join('\n')}`).toEqual([])
  })

  it('keeps the other locales from drifting above the reference namespace', () => {
    // 多出来的键同样是孤儿：zh-CN 是基准，别的语言不该独有 plugin 键。
    // 反向的缺失不在这里判：那是翻译覆盖率，运行时会回落到 zh-CN，与死键堆积不是一回事。
    const reference = new Set(topLevelKeys(namespaceBody(readFileSync(localePath, 'utf8'), NAMESPACE)))
    for (const locale of ['zh-TW', 'en-US']) {
      const body = namespaceBody(readFileSync(join(projectRoot, `src/locales/${locale}.ts`), 'utf8'), NAMESPACE)
      const extra = topLevelKeys(body).filter(key => !reference.has(key))
      expect(extra, `${locale} 的 plugin 命名空间有 zh-CN 没有的键：\n${extra.join('\n')}`).toEqual([])
    }
  })
})

/**
 * 门禁自己的判定也要有用例兜着。
 *
 * 上面那条 it 读的是真实仓库，它变绿只说明「此刻仓库里没有违规」，说明不了判定本身
 * 拦得住什么——判定放宽到形同虚设时它照样绿。这组用例改喂合成源码，把「什么该被
 * 判成引用/孤儿/动态拼键」逐条钉死，判定再被放宽就会在这里先炸。
 */
describe('locale orphan scanning', () => {
  it('does not let a longer key stand in for its prefix', () => {
    const referenced = referencedKeys(`{{ t('plugin.updateHistoryTitle') }}`, NAMESPACE)
    expect(referenced.has('updateHistoryTitle')).toBe(true)
    expect(referenced.has('update')).toBe(false)
  })

  it('accepts every delimiter a real reference ends with', () => {
    const samples = [
      `t('plugin.update')`,
      `t("plugin.update")`,
      't(`plugin.update`)',
      `t('plugin.update', { name })`,
      `{{ t('plugin.update') }}`,
      `:text="t('plugin.update')"`,
    ]
    for (const sample of samples) expect(referencedKeys(sample, NAMESPACE).has('update'), sample).toBe(true)
  })

  it('counts a nested object key reached through its children', () => {
    expect(referencedKeys(`t('plugin.sort.title')`, NAMESPACE).has('sort')).toBe(true)
  })

  it('ignores an identifier that merely ends with the namespace', () => {
    expect(referencedKeys('myplugin.update', NAMESPACE).has('update')).toBe(false)
  })

  it('flags a key interpolated into an i18n call', () => {
    expect(dynamicKeyUsages('t(`plugin.${id}`)', NAMESPACE)).not.toEqual([])
  })

  it('flags a key concatenated into an i18n call', () => {
    const samples = [`$t('plugin.' + id)`, `t("plugin." + id)`, 't(`plugin.` + id)', `t('plugin.instance' + suffix)`]
    for (const sample of samples) expect(dynamicKeyUsages(sample, NAMESPACE), sample).not.toEqual([])
  })

  it('leaves static references, other namespaces and non-i18n literals alone', () => {
    const benign = [
      `t('plugin.update')`,
      `t('plugin.update') + suffix`,
      't(`setting.${key}`)',
      `t('setting.' + key)`,
      'const permission = `plugin.${id}`',
    ]
    for (const sample of benign) expect(dynamicKeyUsages(sample, NAMESPACE), sample).toEqual([])
  })
})
