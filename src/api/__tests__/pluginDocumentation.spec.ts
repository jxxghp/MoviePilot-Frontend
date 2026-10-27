import { getPluginDocumentationUrl, normalizePluginDocumentationUrl } from '@/api/pluginDocumentation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/api', () => ({ default: createDataApiMock({ get: mocks.apiGet }) }))

describe('plugin documentation links', () => {
  beforeEach(() => mocks.apiGet.mockReset())

  it.each([
    null,
    3,
    '',
    '//example.com',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://a b.com',
    'https://user:pass@example.com',
    `https://example.com/${'x'.repeat(2048)}`,
  ])('rejects unsafe or malformed links: %s', value => {
    expect(normalizePluginDocumentationUrl(value)).toBeUndefined()
  })

  it('preserves a complete HTTP(S) documentation address', () => {
    expect(normalizePluginDocumentationUrl(' https://docs.example.com/demo?q=1#setup ')).toBe(
      'https://docs.example.com/demo?q=1#setup',
    )
  })

  it('queries the selected repository and validates the returned address', async () => {
    mocks.apiGet.mockResolvedValueOnce({ url: 'https://docs.example.com/demo' })
    expect(await getPluginDocumentationUrl('Demo', 'https://github.com/example/plugins')).toBe(
      'https://docs.example.com/demo',
    )
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/readme/Demo', {
      params: { repo_url: 'https://github.com/example/plugins' },
    })
  })

  it('hides absent or unsafe documentation', async () => {
    mocks.apiGet.mockResolvedValueOnce({ url: null }).mockResolvedValueOnce({ url: 'javascript:alert(1)' })
    expect(await getPluginDocumentationUrl('Demo', 'repo')).toBeUndefined()
    expect(await getPluginDocumentationUrl('Demo', 'repo')).toBeUndefined()
  })
})
