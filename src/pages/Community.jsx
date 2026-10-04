import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { sortTags } from '../lib/tags'
import StickyNote from '../components/StickyNote'
import CreateNoteForm from '../components/CreateNoteForm'
import Messages from '../components/Messages'
import PersonPopup from '../components/PersonPopup'
import { useMessages } from '../lib/useMessages'

const HOUR = 3600e3

export default function Community() {
  const { session, profile } = useAuth()
  const uid = session.user.id
  const myTags = useMemo(() => sortTags([...(profile.classes || []), ...(profile.past_classes || [])]), [profile])

  const [data, setData] = useState({ meetups: [], live: [], saved: [] })
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [tag, setTag] = useState('All')
  const [view, setView] = useState('all') // all (live boards + meetups) | saved
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)  // null = closed, {} = new note, meetup note = editing
  const [boards, setBoards] = useState([])
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState(null)
  const [toast, setToast] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const inbox = useMessages(uid)
  const [panel, setPanel] = useState(null)   // null = closed, { id } = open (id = chat to show, or null for the list)
  const [person, setPerson] = useState(null) // { id, note } for the person popup

  // Status icon: green when you're online and visible, red when offline or in ghost mode.
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const status = !online ? ['off', "You're offline", 'Offline']
    : profile.ghost_mode ? ['off', "Ghost mode: you're hidden from live counts", 'Ghost mode']
    : ['on', "You're online and visible", 'Live']

  const load = useCallback(async () => {
    if (!myTags.length) return setLoading(false)
    const since60 = new Date(Date.now() - 60e3).toISOString()
    const [mu, lv, sv] = await Promise.all([
      supabase.from('meetups').select('*').gt('starts_at', new Date(Date.now() - 2 * HOUR).toISOString())
        .in('class_tag', myTags).order('starts_at'),
      supabase.from('board_live').select('board_id'),
      supabase.from('boards').select('id,title,class_tag').eq('is_public', true).in('class_tag', myTags)
        .not('scene', 'is', null).order('updated_at', { ascending: false }).limit(40),
    ])
    const meetups = mu.data || []
    const liveIds = (lv.data || []).map(r => r.board_id)
    const liveBoards = liveIds.length
      ? (await supabase.from('boards').select('id,title,class_tag').in('id', liveIds).in('class_tag', myTags)).data || []
      : []
    const saved = (sv.data || []).filter(b => !liveIds.includes(b.id))

    const boardIds = [...liveBoards, ...saved].map(b => b.id)
    const [rsvps, presence] = await Promise.all([
      meetups.length ? supabase.from('meetup_rsvps').select('meetup_id,user_id').in('meetup_id', meetups.map(m => m.id)) : { data: [] },
      boardIds.length ? supabase.from('board_presence').select('board_id,user_id,last_seen').in('board_id', boardIds) : { data: [] },
    ])

    const ids = [...new Set([...(rsvps.data || []).map(r => r.user_id), ...(presence.data || []).map(r => r.user_id)])]
    const people = ids.length ? (await supabase.from('public_profiles').select('id,display_name,ghost_mode').in('id', ids)).data || [] : []
    const ghosts = new Set(people.filter(p => p.ghost_mode).map(p => p.id))
    setNames(Object.fromEntries(people.map(p => [p.id, p.display_name])))

    const by = (rows, key, keep = () => true) => rows.reduce((m, r) => keep(r) ? { ...m, [r[key]]: [...(m[r[key]] || []), r.user_id] } : m, {})
    const going = by(rsvps.data || [], 'meetup_id')
    const here = by(presence.data || [], 'board_id', r => r.last_seen > since60 && !ghosts.has(r.user_id))
    const built = by(presence.data || [], 'board_id')

    setData({
      meetups: meetups.map(m => ({ kind: 'meetup', id: m.id, tag: m.class_tag, title: m.title, building: m.building, room: m.room,
        startsAt: m.starts_at, max: m.max_people, boardId: m.board_id, creator: m.created_by, going: going[m.id] || [] })),
      live: liveBoards.map(b => ({ kind: 'live', id: b.id, tag: b.class_tag, title: b.title, people: here[b.id] || [] })),
      saved: saved.map(b => ({ kind: 'saved', id: b.id, tag: b.class_tag, title: b.title, students: new Set(built[b.id] || []).size })),
    })
    setLoading(false)
  }, [myTags])

  // Counts and avatars update live: any RSVP or meetup change reloads; presence is polled.
  useEffect(() => {
    load()
    const t = setInterval(load, 20000)
    const ch = supabase.channel('community')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetup_rsvps' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetups' }, load)
      .subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const match = n => (tag === 'All' || n.tag === tag) && (!q.trim() || `${n.title} ${n.tag}`.toLowerCase().includes(q.trim().toLowerCase()))
  const list = (view === 'saved' ? data.saved : [...data.live, ...data.meetups]).filter(match)

  async function openForm(note = {}) {
    setFormErr('')
    setForm(note)
    const { data: mine } = await supabase.from('boards').select('id,title').eq('owner', uid).order('updated_at', { ascending: false })
    setBoards(mine || [])
  }

  async function join(m) {
    const { error } = await supabase.from('meetup_rsvps').insert({ meetup_id: m.id, user_id: uid })
    if (error) setToast(error.message.includes('full') ? 'That meetup just filled up.' : 'Could not join. Try again.')
    load()
  }
  async function leave(m) {
    if (!window.confirm(`Leave ${m.title}?`)) return
    await supabase.from('meetup_rsvps').delete().eq('meetup_id', m.id).eq('user_id', uid)
    load()
  }
  async function remove(m) {
    if (!window.confirm(`Remove ${m.title}? Everyone who joined will lose it.`)) return
    await supabase.from('meetups').delete().eq('id', m.id)
    load()
  }

  async function save(v) {
    const startsAt = new Date(`${v.date}T${v.time}`)
    if (isNaN(startsAt)) return setFormErr('Pick a date and time.')
    if (!form.id && startsAt < new Date()) return setFormErr('Pick a time in the future.')
    if (form.id && v.max < form.going.length) return setFormErr(`${form.going.length} people already joined, so the limit can't go lower.`)
    setBusy(true); setFormErr('')
    const fields = { title: v.title.trim(), building: v.building, room: v.room.trim() || null, starts_at: startsAt.toISOString(), max_people: v.max }

    if (form.id) {
      const { error } = await supabase.from('meetups').update(fields).eq('id', form.id)
      setBusy(false)
      if (error) return setFormErr('Could not save. Try again.')
    } else {
      let boardId = v.board === 'none' ? null : v.board
      if (v.board === 'new') {
        const { data: b, error } = await supabase.from('boards').insert({ owner: uid, title: fields.title, class_tag: v.tag }).select().single()
        if (error) { setBusy(false); return setFormErr('Could not create the study board.') }
        boardId = b.id
      }
      const { data: m, error } = await supabase.from('meetups').insert({ ...fields, created_by: uid, class_tag: v.tag, board_id: boardId }).select('id').single()
      setBusy(false)
      if (error) return setFormErr('Could not post the note. Try again.')
      setAdded(m.id); setTimeout(() => setAdded(null), 1500)
    }
    setForm(null)
    load()
  }

  const emptyTag = tag === 'All' ? myTags[0] : tag

  return (
    <div className="cork">
    <main className="page community">
      <header className="comm-head">
        <h1>Find Your People</h1>
        <button className="icon-btn msg-btn" aria-label={inbox.unread ? `Messages, ${inbox.unread} unread` : 'Messages'} title="Messages" onClick={() => setPanel({ id: null })}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
          {inbox.unread > 0 && <span className="count-badge">{inbox.unread > 9 ? '9+' : inbox.unread}</span>}
        </button>
      </header>

      <div className="comm-bar">
        <label className="select-pill">
          <span className="sr-only">Filter by class</span>
          <select value={tag} onChange={e => setTag(e.target.value)}>
            <option value="All">Class tags</option>
            {myTags.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <button className="btn" onClick={() => openForm()}>Create</button>
        <div className="seg" role="group" aria-label="Show">
          {[['all', 'All'], ['saved', 'Saved']].map(([id, label]) => (
            <button key={id} aria-pressed={view === id} className={view === id ? 'on' : ''} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className={`status ${status[0]}`} title={status[1]}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4" />
          </svg>
          {status[2]}
        </span>
        <label className="search">
          <span className="sr-only">Search</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or tag" />
        </label>
      </div>

      {loading ? <p className="muted">Loading…</p> : list.length === 0 ? (
        <div className="comm-empty">
          {view === 'saved'
            ? <p>No saved boards for {emptyTag} yet.</p>
            : <p>Nobody's studying {emptyTag} yet. <button className="linklike" onClick={() => openForm()}>Create</button> one.</p>}
        </div>
      ) : (
        <div className="notes">
          {list.map(n => (
            <StickyNote key={`${n.kind}-${n.id}`} note={n} me={uid} names={names}
              tookIt={(profile.past_classes || []).includes(n.tag)} justAdded={added === n.id}
              onJoin={join} onLeave={leave} onEdit={openForm} onRemove={remove} onPerson={(id, note) => setPerson({ id, note })} />
          ))}
        </div>
      )}

      {toast && <p className="toast" role="status">{toast}</p>}
      {person && (
        <PersonPopup personId={person.id} note={person.note} me={uid} myTags={myTags} onClose={() => setPerson(null)}
          onMessage={async convId => { await inbox.reload(); setPerson(null); setPanel({ id: convId }) }} />
      )}
      {panel && <Messages hook={inbox} me={uid} openId={panel.id} onClose={() => setPanel(null)} />}
      {form && (
        <CreateNoteForm tags={profile.classes || []} boards={boards} initial={form} busy={busy} error={formErr}
          onSave={save} onClose={() => setForm(null)} />
      )}
    </main>
    </div>
  )
}
