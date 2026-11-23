import backendProduced from '@tests/support/fixtures/backendSearchDiagnostics.json'
import { hasRuleConfigurationError, normalizeSearchDiagnostics } from '@/utils/searchDiagnostics'
import { createSearchDiagnostics } from '@tests/support/fixtures/searchDiagnostics'
import { describe, expect, it } from 'vitest'

describe('search diagnostics contract', () => {
  it('accepts an actual backend terminal-event projection without altering counts or rule warnings', () => {
    expect(normalizeSearchDiagnostics(backendProduced)).toEqual(backendProduced)
  })

  it.each([undefined, null, {}, { version: 2 }])('hides absent or unsupported diagnostics (%s)', value => {
    expect(normalizeSearchDiagnostics(value)).toBeNull()
  })

  it.each([
    { scope: ['page'] },
    { scope: { toString: null } },
    { stage_counts: { candidates: -1, retained: 0 } },
    { searched_sites: [{ site_id: 1, site_name: 'A', outcome: 'empty', raw_count: 0 }] },
    { rejection_reasons: [{ code: 'duplicate', count: 1.5 }] },
    { rule_groups: [{ name: 'rule', status: 'skipped', categories: null }] },
    { warnings: [{ code: 'new_warning', rule_group: 1 }] },
    { warnings: [{ code: 'rule_id_invalid', rule_ids: ' Pre Candidate' }] },
    { warnings: [{ code: 'rule_id_invalid', rule_ids: [1] }] },
  ])('rejects malformed diagnostics without affecting results', change => {
    const malformed = { ...createSearchDiagnostics(), ...change }
    expect(() => normalizeSearchDiagnostics(malformed)).not.toThrow()
    expect(normalizeSearchDiagnostics(malformed)).toBeNull()
  })

  it('accepts new reason and warning codes in version 1 for generic display', () => {
    const diagnostics = createSearchDiagnostics()
    diagnostics.rejection_reasons = [{ code: 'future_reason', count: 2 }]
    diagnostics.warnings = [{ code: 'future_warning', rule_group: null }]
    expect(normalizeSearchDiagnostics(diagnostics)).toEqual(diagnostics)
  })

  it('accepts optional complete rule IDs without changing old version-1 payloads', () => {
    const diagnostics = createSearchDiagnostics()
    expect(hasRuleConfigurationError(diagnostics)).toBe(false)
    expect(hasRuleConfigurationError(null)).toBe(false)
    diagnostics.warnings = [{ code: 'rule_id_invalid', rule_group: '国产剧', rule_ids: [' Pre Candidate'] }]
    expect(normalizeSearchDiagnostics(diagnostics)).toEqual(diagnostics)
    expect(hasRuleConfigurationError(diagnostics)).toBe(true)
  })
})
