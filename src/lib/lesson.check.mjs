// Run: node src/lib/lesson.check.mjs
import assert from 'node:assert/strict'
import { stepToSkeletons } from './lesson.js'

const geo = new Map()
const ctx = { origin: { x: 100, y: 1000 }, page: { x: 0, y: 0 }, geo, tag: 'T' }

const one = stepToSkeletons({ say: 'a', draw: [
  { type: 'rect', id: 'a', x: 0, y: 0, w: 100, h: 50 },
  { type: 'rect', id: 'b', x: 300, y: 0, w: 100, h: 50 },
] }, ctx)
assert.equal(one[0].x, 100); assert.equal(one[0].y, 1000) // placed relative to the lesson area

// An arrow in a LATER step finds shapes drawn earlier and leaves from the facing edge.
const two = stepToSkeletons({ say: 'b', draw: [{ type: 'arrow', from: 'a', to: 'b' }] }, ctx)
assert.equal(two.length, 1)
assert.equal(two[0].x, 200); assert.equal(two[0].y, 1025)   // right edge of a
assert.deepEqual(two[0].points[1], [200, 0])                  // to left edge of b

// Unknown arrow targets are skipped instead of crashing.
assert.equal(stepToSkeletons({ say: 'c', draw: [{ type: 'arrow', from: 'x', to: 'y' }] }, ctx).length, 0)

// Highlights use page coordinates, not the lesson area.
const hl = stepToSkeletons({ say: 'd', draw: [{ type: 'highlight', x: 10, y: 20, w: 30, h: 40 }] }, ctx)
assert.equal(hl[0].x, 10); assert.equal(hl[0].y, 20)
console.log('lesson checks pass')
