import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync('src/components/dialog/ForkWorkflowDialog.vue', 'utf8')

describe('ForkWorkflowDialog preview contract', () => {
  it('uses the static summary without loading an interactive VueFlow canvas', () => {
    expect(dialogSource).toContain('WorkflowSummaryPreview')
    expect(dialogSource).not.toContain('@vue-flow/core')
    expect(dialogSource).not.toContain('import.meta.glob')
    expect(dialogSource).not.toContain('<VueFlow')
  })

  it('reserves the close-button safe area on small screens', () => {
    expect(dialogSource).toMatch(
      /@media screen and \(width <= 600px\)[\s\S]*?\.workflow-share-layout\s*\{[\s\S]*?padding-block-start:\s*2rem/,
    )
  })
})
