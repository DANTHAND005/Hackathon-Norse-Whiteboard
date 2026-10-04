import { cleanSteps, cors, DRAW_RULES, gemini, image, json, rateLimited, requireUser, STEPS_SCHEMA, tutorPrompt } from '../_shared/ai.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const user = await requireUser(req)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  if (rateLimited(user.id)) return json({ error: 'rate_limited' }, 429)

  const b = await req.json().catch(() => ({}))
  const img = typeof b.page_image_base64 === 'string' ? b.page_image_base64 : ''
  if (!img || img.length > 8_000_000) return json({ error: 'bad_image' }, 400)

  const system = tutorPrompt(
    `Teach the page in the image as a short lesson: you speak and draw a diagram on a whiteboard at the same time.
Produce 5 to 8 steps that build the idea up one piece at a time.\n${DRAW_RULES}`,
    String(b.tutor_style), String(b.language ?? 'en'))

  try {
    const out = await gemini(system, [image(img), { text: 'Teach me this page.' }], {
      type: 'OBJECT', properties: { title: { type: 'STRING' }, steps: STEPS_SCHEMA }, required: ['title', 'steps'],
    })
    const steps = cleanSteps(out.steps, 8)
    if (steps.length < 3) throw new Error('too few steps')
    return json({ title: String(out.title ?? 'Lesson').slice(0, 80), steps })
  } catch (e) {
    console.error((e as Error).message)
    return json({ error: 'ai_failed', detail: (e as Error).message }, 502)
  }
})
