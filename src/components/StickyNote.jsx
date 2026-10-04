import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PAPER = ['#F6EC9E', '#BFE1F5', '#C9EBB5', '#92D6C6', '#F8CFA0', '#DDCCF1']
const PIN = ['#F2B01E', '#B57BD6', '#D2452C', '#1FA5B5', '#E0302B', '#3B4BD6']
const AVATAR = ['#1D2B42', '#2F6F8F', '#8A4B2D', '#1F8A5B']

// Same note always gets the same colour and tilt (between -1.5 and 1.5 degrees).
const hash = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

export function fmtWhen(iso) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }).toLowerCase().replace(' ', '')
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`
}

function People({ ids, names, onPerson }) {
  return (
    <span className="avatars sm">
      {ids.slice(0, 4).map((id, i) => (
        <button key={id} type="button" className="avatar" style={{ background: AVATAR[i % AVATAR.length] }} title={names[id]}
          aria-label={`About ${names[id] || 'this person'}`} onClick={() => onPerson?.(id)}>{initials(names[id])}</button>
      ))}
      {ids.length > 4 && <span className="avatar more">+{ids.length - 4}</span>}
    </span>
  )
}

export default function StickyNote({ note, me, names, tookIt, justAdded, onJoin, onLeave, onEdit, onRemove, onPerson }) {
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const h = hash(note.id)
  const style = { '--paper': PAPER[h % PAPER.length], '--pin': PIN[(h >> 3) % PIN.length], '--tilt': `${((h % 31) - 15) / 10}deg` }
  const badge = { meetup: 'Meetup', live: 'Live board', saved: 'Saved board' }[note.kind]

  const mine = note.kind === 'meetup' && note.creator === me
  const joined = note.kind === 'meetup' && note.going.includes(me)
  const full = note.kind === 'meetup' && note.going.length >= note.max && !joined

  return (
    <article className={`note ${justAdded ? 'drop' : ''}`} style={style}>
      <span className="pin" aria-hidden="true" />
      <div className="note-top">
        <span className={`badge ${note.kind}`}>{note.kind === 'live' && <i className="dot" />}{badge}</span>
        {mine && (
          <div className="note-menu">
            <button className="kebab" aria-label="Note options" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋮</button>
            {menu && (
              <div className="pop right" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); onEdit(note) }}>Edit</button>
                <button role="menuitem" onClick={() => { setMenu(false); onRemove(note) }}>Remove</button>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="note-tag">{note.tag}</p>
      <h2>{note.title}</h2>

      {note.kind === 'meetup' && (
        <>
          <p className="meta">{[note.building, note.room].filter(Boolean).join(' ')}</p>
          <p className="meta">{fmtWhen(note.startsAt)}</p>
          <p className="meta count">{note.going.length}/{note.max} participants <People ids={note.going} names={names} onPerson={id => onPerson?.(id, note)} /></p>
        </>
      )}
      {note.kind === 'live' && (
        <p className="meta count">{note.people.length} studying now <People ids={note.people} names={names} onPerson={id => onPerson?.(id, note)} /></p>
      )}
      {note.kind === 'saved' && <p className="meta">Built by {note.students} {note.students === 1 ? 'student' : 'students'}</p>}

      {tookIt && <p className="help">You took this, help out</p>}

      <div className="note-btns">
        {note.kind === 'meetup' && !mine && (
          joined ? <button className="btn light" onClick={() => onLeave(note)}>Leave</button>
            : full ? <button className="btn" disabled>Full</button>
            : <button className="btn" onClick={() => onJoin(note)}>Join</button>
        )}
        {note.kind === 'meetup' && note.boardId && (
          <button className="btn light" onClick={() => navigate(`/board/${note.boardId}`)}>Open board</button>
        )}
        {note.kind === 'live' && <button className="btn" onClick={() => navigate(`/board/${note.id}`)}>Join</button>}
        {note.kind === 'saved' && <button className="btn light" onClick={() => navigate(`/saved/${note.id}`)}>Open</button>}
      </div>
    </article>
  )
}
