import SearchDiagnosticsPanel from '@/components/states/SearchDiagnosticsPanel.vue'
import { screen } from '@testing-library/vue'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('SearchDiagnosticsPanel', () => {
  it('separates page counts, unsearched sources and skipped rules', async () => {
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics: createSearchDiagnostics() } })
    const panel = screen.getByRole('status', { name: '本页搜索情况' })
    expect(panel).toHaveTextContent('收到 0 个候选资源，保留 0 个')
    expect(panel).toHaveTextContent('站点 B — 未执行检索')
    expect(panel).toHaveTextContent('规则“中文字幕”未应用')
    expect(panel).not.toHaveTextContent('均不符合过滤规则')
  })

  it('uses generic text for future codes and never renders raw codes as markup', async () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.scope = 'search'
    diagnostics.rejection_reasons = [{ code: '<img src=x onerror=alert(1)>', count: 3 }]
    diagnostics.warnings = [{ code: 'new_warning' }]
    await renderWithProviders(SearchDiagnosticsPanel, { props: { diagnostics } })
    const panel = screen.getByRole('status', { name: '本次搜索情况' })
    expect(panel).toHaveTextContent('其他已排除资源: 3')
    expect(panel).toHaveTextContent('还有其他搜索提示')
    expect(panel.querySelector('img')).toBeNull()
  })
})
