// Turns one lesson step (from ai-lesson / ai-redirect) into Excalidraw element skeletons.
// Coordinates in a step are relative to the lesson area; highlights are relative to the page image.
const BLUE = '#2F6F8F'
const FONT = 22

// Start and end points on the facing edges of two boxes.
function edges(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  const dx = bc.x - ac.x, dy = bc.y - ac.y
  if (Math.abs(dx) * a.h >= Math.abs(dy) * a.w) {
    return [{ x: dx > 0 ? a.x + a.w : a.x, y: ac.y }, { x: dx > 0 ? b.x : b.x + b.w, y: bc.y }]
  }
  return [{ x: ac.x, y: dy > 0 ? a.y + a.h : a.y }, { x: bc.x, y: dy > 0 ? b.y : b.y + b.h }]
}

// geo remembers where each drawn shape is, so arrows in later steps can point at earlier shapes.
export function stepToSkeletons(step, { origin, page, geo, tag }) {
  const out = []
  step.draw.forEach((d, n) => {
    const id = `${tag}-${n}-${d.id ?? d.type}`
    const x = origin.x + (d.x ?? 0), y = origin.y + (d.y ?? 0)
    if (d.type === 'text') {
      if (d.id) geo.set(d.id, { x, y, w: d.text.length * FONT * 0.55, h: FONT * 1.3 })
      out.push({ type: 'text', id, x, y, text: d.text, fontSize: FONT, strokeColor: BLUE })
    } else if (d.type === 'rect' || d.type === 'ellipse') {
      if (d.id) geo.set(d.id, { x, y, w: d.w, h: d.h })
      out.push({ type: d.type === 'rect' ? 'rectangle' : 'ellipse', id, x, y, width: d.w, height: d.h, strokeColor: BLUE, strokeWidth: 2 })
    } else if (d.type === 'arrow') {
      const a = geo.get(d.from), b = geo.get(d.to)
      if (!a || !b) return
      const [p, q] = edges(a, b)
      out.push({ type: 'arrow', id, x: p.x, y: p.y, points: [[0, 0], [q.x - p.x, q.y - p.y]], strokeColor: BLUE, strokeWidth: 2, endArrowhead: 'arrow' })
    } else if (d.type === 'highlight') {
      const base = page || origin
      out.push({ type: 'rectangle', id, x: base.x + d.x, y: base.y + d.y, width: d.w, height: d.h,
        backgroundColor: '#FFC72C', fillStyle: 'solid', strokeColor: 'transparent', opacity: 35 })
    }
  })
  return out
}
