// Reads a student's Canvas courses with a token they paste. The token is used for these two
// requests only: never stored, never logged.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const CODE = /([A-Z]{2,4})\s*-?\s*(\d{3})/

async function courses(base: string, token: string, state: 'active' | 'completed') {
  const r = await fetch(`${base}/api/v1/courses?enrollment_state=${state}&per_page=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (r.status === 401 || r.status === 403) throw new Error('bad_token')
  if (!r.ok) throw new Error('canvas_error')
  const list = await r.json()
  const tags = new Set<string>()
  for (const c of list) {
    const m = String(c.course_code ?? '').toUpperCase().match(CODE)
    if (m) tags.add(m[1] + m[2])
  }
  return [...tags]
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Signed-in users only (verified here so it works with any Supabase key style).
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return json({ error: 'not_signed_in' }, 401)

  const { token } = await req.json().catch(() => ({}))
  if (!token || typeof token !== 'string') return json({ error: 'bad_token' }, 400)
  const base = (Deno.env.get('CANVAS_BASE_URL') ?? '').replace(/\/$/, '')

  try {
    const taking = await courses(base, token.trim(), 'active')
    const took = (await courses(base, token.trim(), 'completed')).filter(t => !taking.includes(t))
    return json({ taking, took })
  } catch (e) {
    return json({ error: (e as Error).message === 'bad_token' ? 'bad_token' : 'canvas_error' }, 400)
  }
})
