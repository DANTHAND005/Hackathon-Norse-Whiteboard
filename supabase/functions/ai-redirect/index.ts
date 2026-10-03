import { cleanSteps, cors, DRAW_RULES, gemini, image, json, rateLimited, requireUser, STEPS_SCHEMA, tutorPrompt } from '../_shared/ai.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const user = await requireUser(req)
  if (!user) return json({ error: 'not_signed_in' }, 401)
  if (rateLimited(user.id)) return json({ error: 'rate_limited' }, 429)

  const b = await req.json().catch(() => ({}))
  const board = typeof b.board_image_base64 === 'string' ? b.board_image_base64 : ''
  const strokes = typeof b.student_strokes_image_base64 === 'string' ? b.student_strokes_image_base64 : ''
  if (!board || !strokes || board.length + strokes.length > 12_000_000) return json({ error: 'bad_image' }, 400)
  const done = (Array.isArray(b.steps_done) ? b.steps_done : []).map(String).slice(0, 12)
  const idx = Number.isInteger(b.current_step_index) ? b.current_step_index : done.length - 1

  const system = tutorPrompt(
    `You were mid-lesson ("${String(b.lesson_title ?? '').slice(0, 80)}") when the student wrote or drew on the board.
Image 1 is the board. Image 2 is only what the student just wrote. Work out what they are confused about,
then give 1 to 3 short steps that answer it, drawn in empty space on the board.
Also say where to continue: resume_from is the index (0-based) of the original lesson step to pick up from, or null if the lesson should end.
Steps already said (the lesson was paused at index ${idx}): ${JSON.stringify(done)}\n${DRAW_RULES}`,
    String(b.tutor_style), String(b.language ?? 'en'))

  try {
    const out = await gemini(system, [image(board), image(strokes), { text: 'What did the student write? Redirect the lesson.' }], {
      type: 'OBJECT',
      properties: { understanding: { type: 'STRING' }, steps: STEPS_SCHEMA, resume_from: { type: 'INTEGER', nullable: true } },
      required: ['understanding', 'steps'],
    })
    const steps = cleanSteps(out.steps, 3)
    if (!steps.length) throw new Error('no steps')
    const r = out.resume_from
    return json({
      understanding: String(out.understanding ?? '').slice(0, 200),
      steps,
      resume_from: Number.isInteger(r) && r >= 0 ? r : null,
    })
  } catch (e) {
    console.error((e as Error).message)
    return json({ error: 'ai_failed', detail: (e as Error).message }, 502)
  }
})
