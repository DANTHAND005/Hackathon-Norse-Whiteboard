import { useEffect, useRef, useState } from 'react'

const BUILDINGS = ['Steely Library', 'Student Union', 'Griffin Hall (GH)', 'Norse Commons', 'Other']

const pad = n => String(n).padStart(2, '0')
const dateOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeOf = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`

// Sticky-note styled popup. `initial` is {} for a new note, or the meetup note being edited.
export default function CreateNoteForm({ tags, boards, initial, busy, error, onSave, onClose }) {
  const editing = !!initial.id
  const start = editing ? new Date(initial.startsAt) : new Date(Date.now() + 24 * 3600e3)
  const [v, setV] = useState({
    tag: initial.tag || tags[0] || '', title: initial.title || '', building: initial.building || BUILDINGS[0],
    room: initial.room || '', date: dateOf(start), time: editing ? timeOf(start) : '10:00',
    max: initial.max || 5, board: 'none',
  })
  const first = useRef(null)
  const set = k => e => setV({ ...v, [k]: k === 'max' ? Number(e.target.value) : e.target.value })

  useEffect(() => {
    first.current?.focus()
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="note form-note" role="dialog" aria-modal="true" aria-labelledby="fn-h"
        onSubmit={e => { e.preventDefault(); onSave(v) }}>
        <span className="pin" aria-hidden="true" />
        <h2 id="fn-h">{editing ? 'Edit note' : 'New note'}</h2>

        <label>Tag
          <select ref={first} className="input" value={v.tag} onChange={set('tag')} disabled={editing} required>
            {tags.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Title
          <input className="input" value={v.title} onChange={set('title')} maxLength={60} placeholder="Topic, like Design patterns cram" required />
        </label>
        <div className="row2">
          <label>Where
            <select className="input" value={v.building} onChange={set('building')}>
              {BUILDINGS.map(b => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label>Room
            <input className="input" value={v.room} onChange={set('room')} maxLength={30} placeholder="144" />
          </label>
        </div>
        <div className="row2">
          <label>Date
            <input className="input" type="date" value={v.date} onChange={set('date')} required />
          </label>
          <label>Time
            <input className="input" type="time" value={v.time} onChange={set('time')} required />
          </label>
        </div>
        <label>Max people (2 to 10)
          <input className="input" type="number" min={2} max={10} value={v.max} onChange={set('max')} required />
        </label>
        {!editing && (
          <label>Add a study board
            <select className="input" value={v.board} onChange={set('board')}>
              <option value="none">None</option>
              <option value="new">New blank board</option>
              {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </label>
        )}

        <p className="msg" role="alert">{error}</p>
        <div className="form-btns">
          <button type="button" className="btn light" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy}>{busy ? <span className="spinner" aria-label="Saving" /> : editing ? 'Save' : 'Attach'}</button>
        </div>
      </form>
    </div>
  )
}
