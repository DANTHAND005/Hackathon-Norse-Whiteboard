import { cors, gemini, image, json, rateLimited, requireUser, tutorPrompt } from '../_shared/ai.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const user = await requireUser(req)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  if (rateLimited(user.id)) return json({ error: 'rate_limited' }, 429)

  const b = await req.json().catch(() => ({}))
  const img = typeof b.image_base64 === 'string' ? b.image_base64 : ''
  if (!img || img.length > 8_000_000) return json({ error: 'bad_image' }, 400)
  const question = String(b.question ?? '').slice(0, 500) || 'Explain what is in this image.'

  const system = tutorPrompt(
    'Explain the concept shown in the image the student sent. Keep the answer under 120 words.',
    String(b.tutor_style), String(b.language ?? 'en'))
  const context = b.page_context ? `\n(${String(b.page_context).slice(0, 100)})` : ''

  try {
    const out = await gemini(system, [image(img), { text: `Student question: ${question}${context}` }], {
      type: 'OBJECT', properties: { answer: { type: 'STRING' } }, required: ['answer'],
    })
    if (typeof out.answer !== 'string' || !out.answer.trim()) throw new Error('bad shape')
    return json({ answer: out.answer.trim() })
  } catch (e) {
    console.error((e as Error).message) // never the image or the question
    return json({ error: 'ai_failed', detail: (e as Error).message }, 502)
  }
})
