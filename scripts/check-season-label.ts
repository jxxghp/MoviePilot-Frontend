import assert from 'node:assert/strict'

import { formatSeasonLabel } from '../src/@core/utils/season.ts'

assert.equal(formatSeasonLabel(0, '特别篇'), '特别篇')
assert.equal(formatSeasonLabel('0', 'Specials'), 'Specials')
assert.equal(formatSeasonLabel(1, '特别篇'), 'S01')
assert.equal(formatSeasonLabel('12', '特别篇'), 'S12')
assert.equal(formatSeasonLabel(null, '特别篇'), '')
assert.equal(formatSeasonLabel(undefined, '特别篇'), '')

console.log('season label checks passed')
