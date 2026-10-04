import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Excalidraw, getSceneVersion, convertToExcalidrawElements, exportToBlob, reconcileElements, restoreElements, CaptureUpdateAction } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { supabase, invokeFn } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { imageToPng, pdfToPngs, toDataURL } from '../lib/files'
import { useLesson } from '../lib/useLesson'
import ChatHistory from '../components/ChatHistory'
import LessonControls from '../components/LessonControls'

const CARD_W = 360
const NAVY = '#1D2B42'
const AVATAR_COLORS = ['#1D2B42', '#2F6F8F', '#8A4B2D', '#1F8A5B']
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

const SAVE_MS = 3000
const SLIDE_W = 900   // uploaded pages are laid out left to right like slides
const SLIDE_GAP = 60
const MAX_BYTES = 25 * 1024 * 1024
const BUCKET = 'board-files'
const SYNC_MS = 80          // how often local changes are broadcast while someone is drawing
const key = el => `${el.version}:${el.versionNonce}` // changes whenever an element changes

// readOnly = a saved board opened from Community: view it, or copy it to your own boards.
export default function Whiteboard({ readOnly = false }) {
  const { session, profile, refreshProfile } = useAuth()
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const uid = session.user.id

  const [board, setBoard] = useState(null)
  const [mine, setMine] = useState([])
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(null) // 'boards' | 'share' | 'edit'
  const [copied, setCopied] = useState(false)

  const pending = useRef(null)   // latest scene waiting to be saved
  const timer = useRef(null)
  const lastVersion = useRef(0)
  const boardId = useRef(null)

  const [api, setApi] = useState(null)
  const [pages, setPages] = useState([])     // ids of the pictures on the board, left to right
  const [pageIdx, setPageIdx] = useState(0)
  const [hasContent, setHasContent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState('')
  const known = useRef(new Set())            // file ids already stored, so we never upload twice

  const [questions, setQuestions] = useState([])
  const [names, setNames] = useState({})     // user id -> display name
  const [asking, setAsking] = useState(false)
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth > 640)
  const [copying, setCopying] = useState(false)
  const [here, setHere] = useState([])        // people on this board right now

  // Lessons play on one person's screen and are broadcast so everyone on the board hears the same lesson.
  const chan = useRef(null)
  const lesson = useLesson({ api, profile, send: payload => chan.current?.send({ type: 'broadcast', event: 'lesson', payload }) })
  const lessonRef = useRef(lesson)
  lessonRef.current = lesson

  useEffect(() => {
    if (!board) return
    const ch = supabase.channel(`board:${board.id}`)
      .on('broadcast', { event: 'lesson' }, ({ payload }) => lessonRef.current.onRemote(payload))
      .on('broadcast', { event: 'scene' }, ({ payload }) => syncRef.current.applyRemote(payload.elements))
      .subscribe(status => { if (status === 'SUBSCRIBED') syncRef.current.resync() })
    chan.current = ch
    return () => { chan.current = null; supabase.removeChannel(ch) }
  }, [board?.id])

  // ───── live drawing: broadcast what changed, merge what others changed (higher version wins) ─────
  const sent = useRef(new Map())      // element id -> key we last sent or received, so nothing is echoed back
  const outbox = useRef(new Map())
  const sendTimer = useRef(null)
  const fetching = useRef(new Set())  // image files being downloaded

  function flushOutbox() {
    sendTimer.current = null
    const els = [...outbox.current.values()]
    outbox.current.clear()
    for (let i = 0; i < els.length; i += 100) {
      chan.current?.send({ type: 'broadcast', event: 'scene', payload: { elements: els.slice(i, i + 100) } })
    }
  }

  // Images drawn by someone else arrive as elements only; fetch their pictures from Storage.
  async function loadMissingFiles(els, attempt = 0) {
    const a = apiRef.current
    if (!a) return
    const have = a.getFiles()
    const ids = [...new Set(els.filter(e => e.type === 'image' && e.fileId && !have[e.fileId] && !fetching.current.has(e.fileId)).map(e => e.fileId))]
    if (!ids.length) return
    ids.forEach(id => fetching.current.add(id))
    const { data: rows } = await supabase.from('board_files').select('*').eq('board_id', boardId.current).in('excalidraw_file_id', ids)
    const files = (await Promise.all((rows || []).map(async r => {
      const { data: blob } = await supabase.storage.from(BUCKET).download(r.storage_path)
      if (!blob) return null
      known.current.add(r.excalidraw_file_id)
      return { id: r.excalidraw_file_id, mimeType: 'image/png', dataURL: await toDataURL(blob), created: Date.parse(r.created_at) }
    }))).filter(Boolean)
    if (files.length) apiRef.current?.addFiles(files)
    ids.forEach(id => fetching.current.delete(id))
    // the uploader may still be saving the file record: try again shortly
    if (files.length < ids.length && attempt < 3) setTimeout(() => loadMissingFiles(els, attempt + 1), 3000)
  }

  function applyRemote(remote) {
    const a = apiRef.current
    if (!a || readOnly || !Array.isArray(remote)) return
    const merged = reconcileElements(a.getSceneElementsIncludingDeleted(), restoreElements(remote, null), a.getAppState())
    remote.forEach(e => sent.current.set(e.id, key(e)))
    a.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
    loadMissingFiles(remote)
  }

  // Catch up from the saved copy (after a tab sleeps, or when the channel connects).
  async function resync() {
    if (!boardId.current || readOnly) return
    const { data } = await supabase.from('boards').select('scene').eq('id', boardId.current).maybeSingle()
    if (data?.scene?.elements) applyRemote(data.scene.elements)
  }

  const apiRef = useRef(null); apiRef.current = api
  const syncRef = useRef({}); syncRef.current = { applyRemote, resync }

  const remember = id => supabase.from('profiles').update({ last_board_id: id }).eq('id', uid).then(refreshProfile)

  async function createBoard() {
    const { data, error } = await supabase.from('boards').insert({ owner: uid }).select().single()
    if (error) { console.error(error); return setError(`Could not create a board (${error.message}).`) }
    navigate(`/board/${data.id}`)
  }

  // Which board to show: the link, else the last one, else the newest, else a fresh one.
  useEffect(() => {
    let off = false
    ;(async () => {
      setError(''); setMenu(null); setNotice('')
      setApi(null); setPages([]); setPageIdx(0); known.current = new Set(); lessonRef.current.reset()
      const list = await supabase.from('boards').select('id,title,class_tag').eq('owner', uid).order('updated_at', { ascending: false })
      if (off) return
      setMine(list.data || [])

      let id = routeId || profile?.last_board_id || list.data?.[0]?.id
      if (!id) return createBoard()

      if (routeId) await supabase.rpc('open_board', { b: routeId }) // lets private-link visitors in
      const { data } = await supabase.from('boards').select('*').eq('id', id).maybeSingle()
      if (off) return
      if (!data) return routeId ? setError("That board doesn't exist or is private.") : createBoard()

      lastVersion.current = getSceneVersion(data.scene?.elements || [])
      sent.current = new Map((data.scene?.elements || []).map(e => [e.id, key(e)]))
      outbox.current.clear()
      boardId.current = data.id
      setBoard(data)
      if (!readOnly && profile?.last_board_id !== data.id) remember(data.id)
    })()
    return () => { off = true; flush() }
  }, [routeId])

  async function flush() {
    clearTimeout(timer.current)
    const scene = pending.current
    if (!scene) return
    pending.current = null
    await supabase.from('boards').update({ scene }).eq('id', boardId.current)
  }

  // Everyone on the board sees uploaded files: fetch them from Storage when the board opens.
  useEffect(() => {
    if (!api || !board) return
    let off = false
    ;(async () => {
      const { data: rows } = await supabase.from('board_files').select('*').eq('board_id', board.id)
        .order('created_at').order('page_number')
      if (off || !rows?.length) return
      const unique = [...new Map(rows.map(r => [r.excalidraw_file_id, r])).values()]
      const files = (await Promise.all(unique.map(async r => {
        const { data: blob } = await supabase.storage.from(BUCKET).download(r.storage_path)
        if (!blob) return null
        known.current.add(r.excalidraw_file_id)
        return { id: r.excalidraw_file_id, mimeType: 'image/png', dataURL: await toDataURL(blob), created: Date.parse(r.created_at) }
      }))).filter(Boolean)
      if (off) return
      api.addFiles(files)
    })()
    return () => { off = true }
  }, [api, board?.id])

  // "Live · N here": heartbeat every 20s, and anyone seen in the last 60s counts (ghost mode hides you).
  useEffect(() => {
    if (!board || readOnly) return
    const tick = async () => {
      if (!profile?.ghost_mode) await supabase.from('board_presence').upsert({ board_id: board.id, user_id: uid, last_seen: new Date().toISOString() })
      const { data } = await supabase.from('board_presence').select('user_id').eq('board_id', board.id)
        .gt('last_seen', new Date(Date.now() - 60000).toISOString())
      const ids = (data || []).map(r => r.user_id)
      if (!ids.length) return setHere([])
      const { data: people } = await supabase.from('public_profiles').select('id,display_name,ghost_mode').in('id', ids)
      setHere((people || []).filter(u => !u.ghost_mode))
    }
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [board?.id, profile?.ghost_mode])

  // Notices fade out on their own so they never sit on top of the tools.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(""), 25000)
    return () => clearTimeout(t)
  }, [notice])

  // Chat history: load the board's questions, then keep them live.
  useEffect(() => {
    if (!board) return
    setQuestions([])
    const add = q => {
      setQuestions(list => (list.some(x => x.id === q.id) ? list : [q, ...list]))
      if (!names[q.asked_by]) loadNames([q.asked_by])
    }
    supabase.from('questions').select('*').eq('board_id', board.id).order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        setQuestions(data || [])
        loadNames([...new Set((data || []).map(q => q.asked_by))])
      })
    const ch = supabase.channel(`questions:${board.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'questions', filter: `board_id=eq.${board.id}` },
        p => add(p.new))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [board?.id])

  async function loadNames(ids) {
    if (!ids.length) return
    const { data } = await supabase.from('public_profiles').select('id,display_name').in('id', ids)
    setNames(n => ({ ...n, ...Object.fromEntries((data || []).map(p => [p.id, p.display_name])) }))
  }

  // "Teach me this page": the page nearest the middle of the screen, or what is on screen if nothing was uploaded.
  async function teach() {
    setMenu(null); setNotice('')
    const st = api.getAppState()
    const all = api.getSceneElements().filter(el => !el.isDeleted)
    const mx = -st.scrollX + st.width / st.zoom.value / 2, my = -st.scrollY + st.height / st.zoom.value / 2
    const dist = el => Math.hypot(el.x + el.width / 2 - mx, el.y + el.height / 2 - my)
    const pageEl = all.filter(el => pages.includes(el.id)).sort((a, b) => dist(a) - dist(b))[0] || null
    const x0 = -st.scrollX, y0 = -st.scrollY, x1 = x0 + st.width / st.zoom.value, y1 = y0 + st.height / st.zoom.value
    const els = pageEl ? [pageEl]
      : all.filter(el => el.x < x1 && el.x + Math.abs(el.width) > x0 && el.y < y1 && el.y + Math.abs(el.height) > y0)
    if (!els.length) return setNotice('Upload something or draw first, then ask for a lesson.')
    try { await lesson.start({ els, pageEl }) }
    catch (err) { console.error(err); setNotice(`Could not start the lesson (${err.message}). Try again in a moment.`) }
  }

  // Ask AI: a selection if there is one, otherwise everything visible on screen.
  async function ask(text) {
    if (!api || asking) return
    setAsking(true); setNotice('')
    try {
      const st = api.getAppState()
      const all = api.getSceneElements().filter(el => !el.isDeleted)
      const x0 = -st.scrollX, y0 = -st.scrollY
      const x1 = x0 + st.width / st.zoom.value, y1 = y0 + st.height / st.zoom.value
      const picked = all.filter(el => st.selectedElementIds[el.id])
      const target = picked.length ? picked
        : all.filter(el => el.x < x1 && el.x + Math.abs(el.width) > x0 && el.y < y1 && el.y + Math.abs(el.height) > y0)
      if (!target.length) { setNotice('Nothing to look at yet. Upload something or draw first.'); return }

      const blob = await exportToBlob({
        elements: target, files: api.getFiles(), mimeType: 'image/png', maxWidthOrHeight: 1600, exportPadding: 16,
        appState: { ...st, exportBackground: true, viewBackgroundColor: '#ffffff' },
      })
      const q = text.trim() || 'Explain what is in this area.'
      const data = await invokeFn('ai-ask', {
        image_base64: (await toDataURL(blob)).split(',')[1], question: q,
        tutor_style: profile.tutor_style, language: profile.language,
        page_context: pages.length ? `Page ${pageIdx + 1} of ${pages.length}` : undefined,
      })

      // Answer card on the board, to the right of what was asked about.
      const left = Math.min(...target.map(el => el.x)), top = Math.min(...target.map(el => el.y))
      const right = Math.max(...target.map(el => el.x + el.width))
      const label = `AI TUTOR · answering ${profile.display_name || 'you'}\n\n${data.answer}`
      const lines = label.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length * 8.6 / (CARD_W - 40))), 0)
      const anchor = { x: Math.round(right + 40), y: Math.round(top) }
      const card = convertToExcalidrawElements([{
        type: 'rectangle', x: anchor.x, y: anchor.y, width: CARD_W, height: lines * 21 + 40,
        backgroundColor: NAVY, strokeColor: NAVY, fillStyle: 'solid', roundness: { type: 3 },
        label: { text: label, fontSize: 16, strokeColor: '#FFFFFF', textAlign: 'left', verticalAlign: 'top' },
      }])
      api.updateScene({ elements: [...api.getSceneElements(), ...card] })
      api.scrollToContent([...target, ...card], { fitToViewport: true, viewportZoomFactor: 0.9, animate: true }) // the card may be off screen

      const { data: row } = await supabase.from('questions').insert({
        board_id: board.id, asked_by: uid, question: q, answer: data.answer,
        page_number: pages.length ? pageIdx + 1 : null, anchor,
      }).select().single()
      if (row) setQuestions(list => (list.some(x => x.id === row.id) ? list : [row, ...list]))
      loadNames([uid])
    } catch (err) {
      console.error(err)
      setNotice(`The AI tutor could not answer (${err.message}). Try again in a moment.`)
    } finally {
      setAsking(false)
    }
  }

  function jumpTo({ x, y }) {
    const st = api.getAppState()
    api.updateScene({ appState: { scrollX: st.width / st.zoom.value / 2 - x - CARD_W / 2, scrollY: st.height / st.zoom.value / 2 - y } })
    setChatOpen(false)
  }

  async function storeFile(blob, row) {
    const path = `${board.id}/${crypto.randomUUID()}.png`
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/png' })
    if (error) throw error
    return { board_id: board.id, storage_path: path, ...row }
  }

  function goToPage(i) {
    const el = api.getSceneElements().find(e => e.id === pages[i])
    if (!el) return
    setPageIdx(i)
    api.scrollToContent(el, { fitToViewport: true, viewportZoomFactor: 0.9, animate: true })
  }

  async function onPick(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file || !api) return
    const isPdf = file.type === 'application/pdf'
    if (!isPdf && !file.type.startsWith('image/')) return setNotice('Pick a PNG, JPG or PDF.')
    if (file.size > MAX_BYTES) return setNotice('That file is over 25 MB.')
    setUploading(true); setNotice('')
    try {
      let rendered
      if (isPdf) {
        const r = await pdfToPngs(file)
        rendered = r.pages
        if (r.total > r.pages.length) setNotice(`Only the first ${r.pages.length} of ${r.total} pages were added.`)
      } else rendered = [await imageToPng(file)]

      const els = api.getSceneElements().filter(el => !el.isDeleted)
      let x = els.length ? Math.max(...els.map(el => el.x + el.width)) + SLIDE_GAP : 0
      const rows = [], newFiles = [], skeletons = []
      for (const [i, p] of rendered.entries()) {
        const fid = crypto.randomUUID()
        rows.push(await storeFile(p.blob, { file_type: isPdf ? 'pdf_page' : 'image', page_number: isPdf ? i + 1 : null, excalidraw_file_id: fid }))
        known.current.add(fid)
        newFiles.push({ id: fid, mimeType: 'image/png', dataURL: await toDataURL(p.blob), created: Date.now() })
        const h = Math.round(SLIDE_W * p.h / p.w)
        skeletons.push({ type: 'image', fileId: fid, x, y: 0, width: SLIDE_W, height: h })
        x += SLIDE_W + SLIDE_GAP
      }
      const { error } = await supabase.from('board_files').insert(rows)
      if (error) throw error
      api.addFiles(newFiles)
      const added = convertToExcalidrawElements(skeletons)
      api.updateScene({ elements: [...api.getSceneElements(), ...added] })
      api.scrollToContent(added[0], { fitToViewport: true, viewportZoomFactor: 0.9, animate: true })
    } catch (err) {
      console.error(err)
      setNotice('Upload failed. Try again.')
    }
    setUploading(false)
  }

  // Images added with Excalidraw's own image tool get stored too, so they survive a refresh.
  async function persistNative(id, f) {
    try {
      const { count } = await supabase.from('board_files').select('id', { count: 'exact', head: true })
        .eq('board_id', board.id).eq('excalidraw_file_id', id)
      if (count) return // already stored (uploaded here earlier, or by someone else)
      const blob = await (await fetch(f.dataURL)).blob()
      const row = await storeFile(blob, { file_type: 'image', page_number: null, excalidraw_file_id: id })
      const { error } = await supabase.from('board_files').insert(row)
      if (error) throw error
    } catch (err) {
      console.error(err) // the id stays in `known`, so one failure never turns into a retry loop
    }
  }

  function onChange(elements, appState, files) {
    for (const [id, f] of Object.entries(files || {})) {
      if (!known.current.has(id)) { known.current.add(id); persistNative(id, f) }
    }
    setHasContent(elements.some(el => !el.isDeleted))

    // Pages are the pictures actually on the board (so deleting one updates the count), and the
    // page number follows whichever one is nearest the middle of the screen.
    const imgs = elements.filter(el => el.type === 'image' && !el.isDeleted).sort((a, b) => a.x - b.x || a.y - b.y)
    const ids = imgs.map(el => el.id)
    setPages(prev => (prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids))
    if (imgs.length) {
      const cx = -appState.scrollX + appState.width / appState.zoom.value / 2
      const cy = -appState.scrollY + appState.height / appState.zoom.value / 2
      const near = imgs.reduce((best, el, i) => {
        const d = Math.hypot(el.x + el.width / 2 - cx, el.y + el.height / 2 - cy)
        return d < best.d ? { d, i } : best
      }, { d: Infinity, i: 0 })
      setPageIdx(near.i)
    }
    if (readOnly) return
    lesson.onSceneChange(elements)
    // Only elements this user changed are sent and saved; merged-in changes from others are already in `sent`.
    const changed = elements.filter(el => sent.current.get(el.id) !== key(el))
    if (!changed.length) return // Excalidraw also fires onChange for scrolling and selection
    changed.forEach(el => { sent.current.set(el.id, key(el)); outbox.current.set(el.id, el) })
    if (!sendTimer.current) sendTimer.current = setTimeout(flushOutbox, SYNC_MS)

    const v = getSceneVersion(elements)
    if (v === lastVersion.current) return
    lastVersion.current = v
    pending.current = { elements, appState: { viewBackgroundColor: appState.viewBackgroundColor } }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_MS)
  }

  // Save whatever is pending if the tab closes.
  useEffect(() => {
    const hide = () => (document.visibilityState === 'hidden' ? flush() : syncRef.current.resync())
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  async function patch(fields) {
    const { error } = await supabase.from('boards').update(fields).eq('id', board.id)
    if (error) return setError('Could not save that change.')
    setBoard({ ...board, ...fields })
    setMine(mine.map(b => (b.id === board.id ? { ...b, ...fields } : b)))
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/board/${board.id}`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const toggle = name => setMenu(menu === name ? null : name)

  if (error) return <main className="page"><p className="msg">{error}</p><button className="btn" onClick={() => navigate('/')}>Back to my board</button></main>
  if (!board) return <main className="page">Loading board…</main>

  const empty = !hasContent && !pages.length && !board.scene?.elements?.length
  const isOwner = board.owner === uid

  async function copyBoard() {
    setCopying(true)
    const { data: nb, error } = await supabase.from('boards')
      .insert({ owner: uid, title: `Copy of ${board.title}`, class_tag: board.class_tag, scene: board.scene }).select().single()
    if (error) { setCopying(false); return setNotice('Could not copy this board.') }
    const { data: files } = await supabase.from('board_files').select('*').eq('board_id', board.id)
    for (const f of files || []) {
      const path = `${nb.id}/${crypto.randomUUID()}.png`
      const { error: e } = await supabase.storage.from(BUCKET).copy(f.storage_path, path)
      if (!e) await supabase.from('board_files').insert({ board_id: nb.id, storage_path: path, file_type: f.file_type, page_number: f.page_number, excalidraw_file_id: f.excalidraw_file_id })
    }
    navigate(`/board/${nb.id}`)
  }

  return (
    <div className="wb">
      {readOnly ? (
        <header className="wb-top">
          <div className="wb-left">
            <button className="btn light" onClick={() => navigate('/community')}>Back to Community</button>
          </div>
          <div className="wb-center">
            <div className="wb-title"><b>{board.title}</b><span>{board.class_tag ? `${board.class_tag} · ` : ''}saved board, read only</span></div>
          </div>
          <div className="wb-right">
            <button className="btn" onClick={copyBoard} disabled={copying}>{copying ? <span className="spinner" aria-label="Copying" /> : 'Copy to my boards'}</button>
          </div>
        </header>
      ) : (
      <header className="wb-top">
        <div className="wb-left">
          <button className="icon-btn" onClick={() => setChatOpen(!chatOpen)} aria-expanded={chatOpen} aria-label={chatOpen ? 'Close chat history' : 'Open chat history'} title="Chat history">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          </button>
          {here.length > 0 && <span className="live-pill"><i /> Live · {here.length} here</span>}
          <div className="avatars">
            {here.slice(0, 4).map((u, n) => (
              <span key={u.id} className="avatar" style={{ background: AVATAR_COLORS[n % AVATAR_COLORS.length] }} title={u.display_name}>{initials(u.display_name)}</span>
            ))}
            {here.length > 4 && <span className="avatar more">+{here.length - 4}</span>}
          </div>
          <label className={`btn upload ${!api || uploading ? 'disabled' : ''}`}>
          {uploading ? <span className="spinner" aria-label="Uploading" /> : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg> Upload</>}
          <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={onPick} disabled={!api || uploading} hidden />
          </label>
        </div>

        <div className="wb-menu wb-center">
          <button className="wb-title" onClick={() => toggle('boards')} aria-expanded={menu === 'boards'}>
            <b>{board.title}</b>
            <span>{board.class_tag || 'No class'} ▾</span>
          </button>
          {menu === 'boards' && (
            <div className="pop" role="menu">
              {mine.map(b => (
                <button key={b.id} role="menuitem" className={b.id === board.id ? 'on' : ''} onClick={() => navigate(`/board/${b.id}`)}>
                  {b.title} <small>{b.class_tag}</small>
                </button>
              ))}
              <button role="menuitem" className="new" onClick={createBoard}>+ New board</button>
              {isOwner && <button role="menuitem" onClick={() => toggle('edit')}>Rename / change class</button>}
            </div>
          )}
          {menu === 'edit' && (
            <form className="pop edit" onSubmit={e => e.preventDefault()}>
              <label htmlFor="bt">Board name</label>
              <input id="bt" className="input" defaultValue={board.title} maxLength={60}
                onBlur={e => e.target.value.trim() && patch({ title: e.target.value.trim() })} />
              <label htmlFor="bc">Class</label>
              <select id="bc" className="input" value={board.class_tag || ''} onChange={e => patch({ class_tag: e.target.value || null })}>
                <option value="">No class</option>
                {(profile?.classes || []).concat(profile?.past_classes || []).map(c => <option key={c}>{c}</option>)}
              </select>
              <button className="btn" onClick={() => setMenu(null)}>Done</button>
            </form>
          )}
        </div>

        <div className="wb-right">
        <div className="wb-menu">
          <button className="btn light" onClick={() => toggle('share')}>Share</button>
          {menu === 'share' && (
            <div className="pop right">
              <button className="btn" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
              {isOwner && (
                <label className="switch">
                  <input type="checkbox" checked={board.is_public} onChange={e => patch({ is_public: e.target.checked })} />
                  {board.is_public ? 'Public: anyone at NKU can find it' : 'Private: only people with the link'}
                </label>
              )}
            </div>
          )}
        </div>

        <div className="wb-menu">
          <button className="btn dark" onClick={() => setMenu(menu === 'ai' ? null : 'ai')} disabled={!api || asking || lesson.state === 'loading'} aria-expanded={menu === 'ai'}>
            {asking ? <span className="spinner light" aria-label="Thinking" /> : (<>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /></svg> Ask AI
            </>)}
          </button>
          {menu === 'ai' && (
            <div className="pop right" role="menu">
              <button role="menuitem" onClick={() => { setMenu(null); ask('') }}>Ask about this area</button>
              <button role="menuitem" onClick={teach} disabled={lesson.state !== 'idle'}>Teach me this page</button>
            </div>
          )}
        </div>
        </div>
      </header>
      )}

      <div className="wb-main">
      <div className={`chat-wrap ${chatOpen ? 'open' : ''}`}>
        <ChatHistory items={questions} names={names} busy={asking} canAsk={!!api && !readOnly} onAsk={ask} onJump={jumpTo} />
      </div>
      <div className="wb-board">
        {empty && !readOnly && <p className="wb-hint">Upload notes or a PDF to get started</p>}
        <Excalidraw
          key={board.id}
          excalidrawAPI={setApi}
          initialData={{ elements: board.scene?.elements || [], appState: { ...board.scene?.appState, viewBackgroundColor: board.scene?.appState?.viewBackgroundColor && board.scene.appState.viewBackgroundColor !== 'transparent' ? board.scene.appState.viewBackgroundColor : '#ffffff' }, scrollToContent: true }}
          onChange={onChange}
          viewModeEnabled={readOnly}
        />
        {notice && <p className="wb-notice" role="status" onClick={() => setNotice("")} title="Click to dismiss">{notice}</p>}
        <LessonControls caption={lesson.caption} state={lesson.state} muted={lesson.muted}
          onPause={lesson.pause} onResume={lesson.resume} onSkip={lesson.skip} onMute={lesson.toggleMute} />
        {pages.length > 0 && (
          <div className="pager" aria-label="Pages">
            <button onClick={() => goToPage(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0} aria-label="Previous page">‹</button>
            <span>{pageIdx + 1} / {pages.length}</span>
            <button onClick={() => goToPage(Math.min(pages.length - 1, pageIdx + 1))} disabled={pageIdx >= pages.length - 1} aria-label="Next page">›</button>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
