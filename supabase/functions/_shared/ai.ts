// Shared by ai-ask, ai-lesson and ai-redirect. The Gemini key only ever lives here, server side.
import { createClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Signed-in users only. Checked here (not by the platform) so it works with any Supabase key style.
export async function requireUser(req: Request) {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await sb.auth.getUser()
  return user
}

// 20 AI calls per minute per user. ponytail: per-instance memory, so it is best effort; use a table if abuse shows up.
const hits = new Map<string, number[]>()
export function rateLimited(uid: string) {
  const now = Date.now()
  const recent = (hits.get(uid) ?? []).filter(t => now - t < 60_000)
  if (recent.length >= 20) return true
  hits.set(uid, [...recent, now])
  return false
}

const STYLE: Record<string, string> = {
  quick: 'Short and direct. Use the minimum words.',
  slow: 'Go step by step with extra detail and a concrete example.',
  meditation: 'Calm, reassuring and gentle. Unhurried pacing.',
  rage: 'Loud drill-sergeant energy. Use CAPS for emphasis. Always encouraging, never insulting.',
}

export function tutorPrompt(task: string, style: string, language: string) {
  return `You are a patient tutor helping a college student. ${task}
Guide the student toward understanding; do not just hand over homework answers.
Tone: ${STYLE[style] ?? STYLE.quick}
Write in the language with code "${language}".`
}

// Calls Gemini in JSON mode and returns the parsed object. Throws on any failure.
// The free tier is often "high demand" (503/429): retry once, then fall back to the lighter model.
export async function gemini(system: string, parts: unknown[], schema: unknown) {
  const models = [Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest', 'gemini-flash-lite-latest']
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6 },
  })
  let r!: Response
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '', 'Content-Type': 'application/json' },
        body,
      })
      if (r.ok || (r.status !== 503 && r.status !== 429)) break
      await new Promise(res => setTimeout(res, 1200))
    }
    if (r.ok || (r.status !== 503 && r.status !== 429)) break
  }
  if (!r.ok) {
    const why = (await r.json().catch(() => null))?.error?.message ?? ''
    throw new Error(`gemini ${r.status}: ${String(why).slice(0, 160)}`)
  }
  const out = await r.json()
  const text = out.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('gemini empty')
  return JSON.parse(text)
}

export const image = (b64: string) => ({ inline_data: { mime_type: 'image/png', data: b64 } })

// ───── lesson steps (shared by ai-lesson and ai-redirect) ─────

const num = { type: 'NUMBER' }
const str = { type: 'STRING' }
export const STEPS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      say: str,
      draw: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING', enum: ['text', 'rect', 'ellipse', 'arrow', 'highlight'] },
            id: str, text: str, x: num, y: num, w: num, h: num, from: str, to: str,
          },
          required: ['type'],
        },
      },
    },
    required: ['say', 'draw'],
  },
}

export const DRAW_RULES = `Drawing rules. The lesson area is 900 wide by 700 tall; (0,0) is its top-left corner. Keep every shape inside it.
Types: text {id,text,x,y} (x,y = top-left; about 13px per character, so keep labels to 3 words or fewer);
rect {id,x,y,w,h}; ellipse {id,x,y,w,h}; arrow {from,to} (ids of shapes already drawn, in this or an earlier step);
highlight {x,y,w,h} marks a spot ON THE PAGE IMAGE the student sent, where the page is 900 pixels wide.
Give every text, rect and ellipse a short unique id like "b1". Each "say" is one or two short spoken sentences, no markdown.
Make a real diagram, not a list of words: use boxes (rect/ellipse) for the main ideas, a short text label inside or beside each box, and arrows to show relationships or order.
Add a few pieces per step and lay them out in a clear grid with space between them; do not stack text lines on top of each other. Use a highlight to point at the matching spot on the page.`

const n = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null

// Drop anything malformed so the client can trust what it draws.
export function cleanSteps(raw: unknown, max = 8) {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, max).flatMap((s: any) => {
    const say = typeof s?.say === 'string' ? s.say.trim().slice(0, 300) : ''
    if (!say) return []
    const draw = (Array.isArray(s.draw) ? s.draw : []).slice(0, 12).flatMap((d: any) => {
      const id = typeof d?.id === 'string' ? d.id.slice(0, 20) : undefined
      const x = n(d?.x, -200, 1200), y = n(d?.y, -200, 1200)
      const w = n(d?.w, 4, 900), h = n(d?.h, 4, 700)
      if (d?.type === 'text' && typeof d.text === 'string' && d.text && x !== null && y !== null)
        return [{ type: 'text', id, text: d.text.slice(0, 60), x, y }]
      if ((d?.type === 'rect' || d?.type === 'ellipse') && x !== null && y !== null && w && h)
        return [{ type: d.type, id, x, y, w, h }]
      if (d?.type === 'arrow' && typeof d.from === 'string' && typeof d.to === 'string')
        return [{ type: 'arrow', from: d.from, to: d.to }]
      if (d?.type === 'highlight' && x !== null && y !== null && w && h)
        return [{ type: 'highlight', x, y, w, h }]
      return []
    })
    return [{ say, draw }]
  })
}
