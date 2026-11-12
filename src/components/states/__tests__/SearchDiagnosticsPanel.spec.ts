import SearchDiagnosticsPanel from '@/components/states/SearchDiagnosticsPanel.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('SearchDiagnosticsPanel', () => {
  it('shows the full invalid ID and rule group without rendering ID content as markup', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.warnings = [
      {
        code: 'rule_id_invalid',
        rule_group: '国产剧',
        rule_ids: [' Pre Candidate', '<img src=x onerror=alert(1)>'],
      },
    ]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status')
    expect(panel).toHaveTextContent('规则组“国产剧”引用了无效的规则 ID：" Pre Candidate"')
    expect(panel).toHaveTextContent('至少包含一个字母')
    expect(panel.querySelector('img')).toBeNull()
  })

  it.each([
    ['rule_id_missing', '引用的规则 ID 不存在'],
    ['rule_syntax_invalid', '表达式语法无效'],
  ])('explains rule configuration warnings (%s)', async (code, message) => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.warnings = [{ code, rule_group: '国产剧', rule_ids: ['Missing'] }]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(screen.getByRole('status')).toHaveTextContent('国产剧')
  })

  it('omits the details control when only warnings are available', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.searched_sites = []
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('规则“中文字幕”未应用')
  })

  it('separates page counts, unsearched sources and skipped rules', async () => {
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics: createSearchDiagnostics() } })
    const panel = screen.getByRole('status', { name: '本页搜索情况' })
    expect(panel).toHaveTextContent('候选 0 · 保留 0')
    const toggle = screen.getByRole('button', { name: '查看详情' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toHaveTextContent('站点 B')
    await fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveTextContent('站点 B — 未执行检索')
    expect(panel).toHaveTextContent('规则“中文字幕”未应用')
    expect(panel).not.toHaveTextContent('均不符合过滤规则')
    await fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(panel).not.toHaveTextContent('站点 B')
    expect(panel).toHaveTextContent('规则“中文字幕”未应用')
  })

  it('uses generic text for future codes and never renders raw codes as markup', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.scope = 'search'
    diagnostics.rejection_reasons = [{ code: '<img src=x onerror=alert(1)>', count: 3 }]
    diagnostics.warnings = [{ code: 'new_warning' }]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status', { name: '本次搜索情况' })
    await fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    expect(panel).toHaveTextContent('其他已排除资源: 3')
    expect(panel).toHaveTextContent('还有其他搜索提示')
    expect(panel.querySelector('img')).toBeNull()
  })
})
