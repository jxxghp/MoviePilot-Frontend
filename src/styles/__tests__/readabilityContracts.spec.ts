import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

const root = cwd()
const srcDir = resolve(root, 'src')

// 暂存含历史 ESLint suppression 的旧文件棘轮清单，禁止新增任何未迁入 --mp-*-fg 的原始语义前景色。
const LEGACY_RAW_SEMANTIC_FG_ALLOWLIST = new Set([
  'src/@core/scss/_components.scss', // .v-slider-thumb__label::before 实心气泡三角指示箭头
  'src/components/agent/AgentAssistantPanel.vue',
  'src/components/dialog/SiteStatisticsDialog.vue',
  'src/layouts/default/components/UserNotification.vue',
  'src/views/system/ModuleTestView.vue',
  'src/views/system/WordsView.vue',
])

const RAW_SEMANTIC_FG_PATTERN = /(?<![-\w])color\s*:\s*rgb\(var\(--v-theme-(primary|success|info|warning|error)\)\)/gu
const SURFACE_CONTAINER_TAGS = new Set([
  'AppFilterBar',
  'VCard',
  'VDialog',
  'VMenu',
  'VBottomSheet',
  'VNavigationDrawer',
  'VExpansionPanel',
])
const SURFACE_CONTAINER_CLASS_PATTERN = /\b(app-filter-bar|app-surface|app-surface-static)\b/u

/** 线性移除模板中的 HTML 注释，避免复杂正则回溯。 */
function stripHtmlComments(input: string): string {
  let result = ''
  let cursor = 0
  while (cursor < input.length) {
    const start = input.indexOf('<!--', cursor)
    if (start === -1) {
      result += input.slice(cursor)
      break
    }
    result += input.slice(cursor, start)
    const end = input.indexOf('-->', start + 4)
    if (end === -1) break
    cursor = end + 3
  }
  return result
}

/** 解析模板嵌套栈，确认每个 VChipGroup / VSlider 都确实位于有衬底容器祖先节点内部。 */
function hasUnbackedFilterOrSlider(content: string): boolean {
  const openIdx = content.indexOf('<template')
  const closeIdx = content.lastIndexOf('</template>')
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) return false
  const openEnd = content.indexOf('>', openIdx)
  if (openEnd === -1 || openEnd >= closeIdx) return false

  const template = stripHtmlComments(content.slice(openEnd + 1, closeIdx))
  const stack: Array<{ tag: string; isSurface: boolean }> = []
  let surfaceDepth = 0
  let cursor = 0

  while (cursor < template.length) {
    const lt = template.indexOf('<', cursor)
    if (lt === -1) break
    const gt = template.indexOf('>', lt + 1)
    if (gt === -1) break
    cursor = gt + 1

    const raw = template.slice(lt + 1, gt).trim()
    if (!raw || raw.startsWith('!')) continue
    const closing = raw.startsWith('/')
    const body = closing ? raw.slice(1).trim() : raw
    const spaceIdx = body.search(/[\s/]/u)
    const tag = spaceIdx === -1 ? body : body.slice(0, spaceIdx)
    const attrs = spaceIdx === -1 ? '' : body.slice(spaceIdx)
    if (!tag) continue

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        const popped = stack.pop()!
        if (popped.isSurface) surfaceDepth--
        if (popped.tag === tag) break
      }
      continue
    }

    if ((tag === 'VChipGroup' || tag === 'VSlider') && surfaceDepth === 0) {
      return true
    }

    const selfClosing = raw.endsWith('/')
    if (!selfClosing) {
      const isSurface = SURFACE_CONTAINER_TAGS.has(tag) || SURFACE_CONTAINER_CLASS_PATTERN.test(attrs)
      stack.push({ tag, isSurface })
      if (isSurface) surfaceDepth++
    }
  }
  return false
}

/** 递归收集目录下匹配扩展名的相对路径（统一 POSIX 分隔符）。 */
function collectSourceFiles(dir: string, extensions: readonly string[]): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = resolve(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...collectSourceFiles(fullPath, extensions))
    } else if (extensions.some(ext => entry.endsWith(ext))) {
      results.push(relative(root, fullPath).replaceAll('\\', '/'))
    }
  }
  return results
}

describe('跨主题可读性与玻璃表面契约守卫', () => {
  it('禁止在业务样式中新增原始 rgb(var(--v-theme-*)) 语义前景色，统一使用 --mp-*-fg 令牌', () => {
    const files = collectSourceFiles(srcDir, ['.vue', '.scss']).filter(
      file =>
        !file.startsWith('src/native') &&
        !file.startsWith('src/styles/__tests__/') &&
        file !== 'src/styles/tokens.scss' &&
        !LEGACY_RAW_SEMANTIC_FG_ALLOWLIST.has(file),
    )

    const violations: string[] = []
    for (const file of files) {
      const content = readFileSync(resolve(root, file), 'utf8')
      const matches = [...content.matchAll(RAW_SEMANTIC_FG_PATTERN)]
      if (matches.length > 0) {
        violations.push(`${file} (${matches.length} 处)`)
      }
    }

    expect(violations).toEqual([])
  })

  it('视图与页面中的 VChipGroup 与 VSlider 必须落在阅读衬底或卡片容器内，禁止直接裸放于玻璃壁纸之上', () => {
    const files = [
      ...collectSourceFiles(resolve(srcDir, 'views'), ['.vue']),
      ...collectSourceFiles(resolve(srcDir, 'pages'), ['.vue']),
    ]

    const nakedViews: string[] = []
    for (const file of files) {
      const content = readFileSync(resolve(root, file), 'utf8')
      if (hasUnbackedFilterOrSlider(content)) {
        nakedViews.push(file)
      }
    }

    expect(nakedViews).toEqual([])
  })

  it('探索与订阅筛选视图的 VChip 统一使用满圆胶囊，不得回退为 tile 直角或单选 filter 勾选号', () => {
    const filterViews = [
      'src/views/discover/AniListView.vue',
      'src/views/discover/BangumiView.vue',
      'src/views/discover/DoubanView.vue',
      'src/views/discover/MusicView.vue',
      'src/views/discover/TheMovieDbView.vue',
      'src/views/subscribe/SubscribePopularView.vue',
      'src/views/subscribe/SubscribeShareView.vue',
    ]

    const violations: string[] = []
    for (const file of filterViews) {
      const content = readFileSync(resolve(root, file), 'utf8')
      const openIdx = content.indexOf('<template')
      const closeIdx = content.lastIndexOf('</template>')
      const template = openIdx >= 0 && closeIdx > openIdx ? content.slice(openIdx, closeIdx) : content
      for (const chipMatch of template.matchAll(/<VChip\b([^>]*)>/gu)) {
        const attrs = chipMatch[1]
        if (/(?:^|\s)(?:tile|filter)(?:\s|\/|$)/u.test(attrs)) {
          violations.push(`${file}: ${chipMatch[0]}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('降低透明度模式下深浅玻璃筛选微胶囊均回退至实心表面色 rgb(var(--mp-surface-rgb))', () => {
    const commonScss = readFileSync(resolve(root, 'src/styles/common.scss'), 'utf8')
    const reducedStart = commonScss.indexOf('@media (prefers-reduced-transparency: reduce)')
    expect(reducedStart).toBeGreaterThanOrEqual(0)
    const reducedBlock = commonScss.slice(reducedStart)
    expect(reducedBlock).toContain("html[data-theme='glass']")
    expect(reducedBlock).toContain("html[data-theme='glass'][data-glass-color-scheme='light']")
    expect(reducedBlock).toContain('--mp-filter-pill-bg: rgb(var(--mp-surface-rgb));')
  })
})
