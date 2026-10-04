// Plays an AI lesson on the board: draw each step, show the caption, speak it, then move on.
// If anyone draws mid-lesson it pauses, waits for them to finish, and asks ai-redirect what to do.
import { useRef, useState, useEffect } from 'react'
import { exportToBlob, convertToExcalidrawElements } from '@excalidraw/excalidraw'
import { invokeFn } from './supabase'
import { toDataURL } from './files'
import { speak, stopSpeaking } from './voice'
import { stepToSkeletons } from './lesson'

const IDLE_MS = 2000 // quiet time after the student's last stroke before we read it

const wait = ms => new Promise(r => setTimeout(r, ms))

export function useLesson({ api, profile, send }) {
  const [state, setStateRaw] = useState('idle') // idle | loading | playing | paused | thinking | remote
  const [caption, setCaption] = useState('')
  const [muted, setMuted] = useState(false)

  // Refs so the long-running async loop never reads stale values.
  const R = useRef({})
  R.current.api = api; R.current.profile = profile; R.current.send = send
  const stateRef = useRef('idle')
  const mutedRef = useRef(false)
  const L = useRef(null)          // the lesson in progress (leader only)
  const seen = useRef(new Set())  // element ids we have already seen, to spot new drawing
  const lessonCount = useRef(0)

  const setState = s => { stateRef.current = s; setStateRaw(s) }
  const voice = () => ({ style: R.current.profile.tutor_style, speed: R.current.profile.voice_speed, language: R.current.profile.language })
  const ai = () => ({ tutor_style: R.current.profile.tutor_style, language: R.current.profile.language })

  const shot = async els => {
    const a = R.current.api
    const blob = await exportToBlob({
      elements: els, files: a.getFiles(), mimeType: 'image/png', maxWidthOrHeight: 1600, exportPadding: 16,
      appState: { ...a.getAppState(), exportBackground: true, viewBackgroundColor: '#ffffff' },
    })
    return (await toDataURL(blob)).split(',')[1]
  }

  function draw(S, step) {
    const a = R.current.api
    const els = convertToExcalidrawElements(
      stepToSkeletons(step, { origin: S.origin, page: S.page, geo: S.geo, tag: `L${S.n}-${S.count++}` }))
    els.forEach(e => { seen.current.add(e.id); S.ids.add(e.id) })
    a.updateScene({ elements: [...a.getSceneElements(), ...els] })
    S.drawn.add(step)
    if (els.length) a.scrollToContent(els, { fitToViewport: false, animate: true })
  }

  // Speak the sentence, or just wait a reading-time if muted / no voice for this language.
  async function say(text) {
    if (!mutedRef.current && await speak(text, voice())) return
    await wait(Math.max(2000, text.length * 65))
  }

  async function play(from) {
    const S = L.current
    const run = ++S.run
    setState('playing')
    for (let i = from; i < S.plan.length; i++) {
      if (S.run !== run) return
      S.i = i
      const step = S.plan[i]
      if (!S.drawn.has(step)) draw(S, step)
      setCaption(step.say)
      R.current.send?.({ kind: 'step', say: step.say })
      await say(step.say)
    }
    if (S.run === run) finish()
  }

  function finish() {
    L.current = null
    setState('idle')
    setCaption('Lesson finished')
    R.current.send?.({ kind: 'end' })
    setTimeout(() => stateRef.current === 'idle' && setCaption(''), 3000)
  }

  const halt = () => { if (L.current) L.current.run++; stopSpeaking() }

  function pause() {
    if (stateRef.current !== 'playing') return
    halt(); setState('paused')
    R.current.send?.({ kind: 'pause' })
  }
  function resume() {
    if (stateRef.current !== 'paused') return
    R.current.send?.({ kind: 'resume' })
    play(L.current.i)
  }
  function skip() {
    if (!L.current || !['playing', 'paused'].includes(stateRef.current)) return
    halt(); play(L.current.i + 1)
  }
  function toggleMute() {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
    if (mutedRef.current) stopSpeaking()
  }

  // target = { els: page elements to show the AI, pageEl: the page image element or null }
  async function start(target) {
    if (stateRef.current !== 'idle') return
    setState('loading'); setCaption('Getting the lesson ready…')
    try {
      const data = await invokeFn('ai-lesson', { page_image_base64: await shot(target.els), ...ai() })
      const { pageEl } = target
      const bottom = Math.max(...target.els.map(e => e.y + e.height))
      L.current = {
        n: ++lessonCount.current, title: data.title, original: data.steps, plan: data.steps, i: 0, run: 0,
        // The lesson area sits just below the page so it never covers the next slide.
        origin: pageEl ? { x: pageEl.x, y: pageEl.y + pageEl.height + 60 } : { x: Math.min(...target.els.map(e => e.x)), y: bottom + 60 },
        page: pageEl ? { x: pageEl.x, y: pageEl.y } : null,
        count: 0, drawn: new WeakSet(), geo: new Map(), ids: new Set(), student: new Set(), els: target.els, ver: 0,
      }
      R.current.send?.({ kind: 'start', title: data.title })
      play(0)
    } catch (e) {
      setState('idle'); setCaption(''); L.current = null
      throw e
    }
  }

  // The student wrote something: read it, get new steps, splice them in, and carry on.
  async function redirect() {
    const S = L.current
    if (!S || stateRef.current !== 'paused') return
    const a = R.current.api
    const all = a.getSceneElements().filter(e => !e.isDeleted)
    const mine = all.filter(e => S.student.has(e.id))
    if (!mine.length) { S.student.clear(); return resume() } // they erased it again
    setState('thinking'); setCaption('Got it, let me explain that…')
    try {
      const lessonEls = all.filter(e => S.ids.has(e.id))
      const data = await invokeFn('ai-redirect', {
        board_image_base64: await shot([...S.els, ...lessonEls, ...mine]),
        student_strokes_image_base64: await shot(mine),
        lesson_title: S.title,
        steps_done: S.plan.slice(0, S.i + 1).map(s => s.say),
        current_step_index: S.i,
        ...ai(),
      })
      S.student.clear()
      const tail = data.resume_from === null ? [] : S.original.slice(data.resume_from)
      S.plan = [...S.plan.slice(0, S.i + 1), ...data.steps, ...tail]
      setCaption(`Got it, let me explain that. ${data.understanding}`)
      await wait(2500)
      if (stateRef.current === 'thinking') play(S.i + 1)
    } catch (e) {
      console.error(e)
      S.student.clear()
      setState('paused'); setCaption('I could not read that. Press Resume to carry on.')
    }
  }

  // Called with the board's elements on every change.
  function onSceneChange(elements) {
    const S = L.current
    const active = S && ['playing', 'paused'].includes(stateRef.current)
    if (!active) { elements.forEach(e => seen.current.add(e.id)); return }

    const fresh = elements.filter(e => !seen.current.has(e.id))
    fresh.forEach(e => { seen.current.add(e.id); S.student.add(e.id) })
    if (!S.student.size) return
    if (stateRef.current === 'playing') { pause(); setCaption('Go ahead, I will wait…') }

    // Every stroke bumps element versions, so a version change means they are still writing.
    const ver = elements.reduce((n, e) => (S.student.has(e.id) ? n + e.version : n), 0)
    if (fresh.length || ver !== S.ver) {
      S.ver = ver
      clearTimeout(S.idle)
      S.idle = setTimeout(redirect, IDLE_MS)
    }
  }

  // Everyone else on the board hears and sees the same lesson, and can mute locally.
  function onRemote(m) {
    if (L.current) return
    if (m.kind === 'start') { setState('remote'); setCaption(m.title) }
    else if (m.kind === 'step') {
      setState('remote'); setCaption(m.say); stopSpeaking()
      if (!mutedRef.current) speak(m.say, voice())
    } else if (m.kind === 'pause') stopSpeaking()
    else if (m.kind === 'end') {
      stopSpeaking(); setState('idle'); setCaption('Lesson finished')
      setTimeout(() => stateRef.current === 'idle' && setCaption(''), 3000)
    }
  }

  // New board or leaving the page: drop the lesson and silence the voice.
  function reset() {
    halt(); clearTimeout(L.current?.idle); L.current = null
    setState('idle'); setCaption(''); seen.current = new Set()
  }
  useEffect(() => reset, [])

  return { state, caption, muted, start, pause, resume, skip, toggleMute, onSceneChange, onRemote, reset }
}
