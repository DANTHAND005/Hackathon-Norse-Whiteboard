import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ChatView from './ChatView'

const when = iso => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : `${d.getMonth() + 1}/${d.getDate()}`
}

// Slides in from the right on desktop, full screen on a phone.
export default function Messages({ hook, me, openId, onClose }) {
  const { convs, people, blocked, markRead, reload } = hook
  const [current, setCurrent] = useState(openId || null)
  const [menu, setMenu] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { if (openId) setCurrent(openId) }, [openId])
  useEffect(() => {
    const esc = e => e.key === 'Escape' && (current ? setCurrent(null) : onClose())
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [current])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const titleOf = c => c.type === 'meetup' ? c.meetup?.title || 'Meetup chat' : people[c.others[0]]?.display_name || 'Someone'
  const conv = convs.find(c => c.id === current)

  async function block(c) {
    const who = titleOf(c)
    setMenu(null)
    if (!window.confirm(`Block ${who}? They won't be able to message you.`)) return
    const { error } = await supabase.from('blocks').insert({ blocker: me, blocked: c.others[0] })
    setToast(error ? 'Could not block. Try again.' : `${who} is blocked.`)
    reload()
  }
  async function report(c) {
    setMenu(null)
    const reason = window.prompt(`Report ${titleOf(c)}. What happened?`)
    if (reason === null) return
    const { error } = await supabase.from('reports').insert({ reporter: me, reported_user: c.others[0], reason: reason.trim() || null })
    setToast(error ? 'Could not send the report.' : 'Report sent. Thank you.')
  }

  // Block / Report only make sense for one person, so group chats have no menu.
  const renderMenu = c => c.type !== 'dm' ? null : (
    <div className="note-menu" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button className="kebab" aria-label="Chat options" aria-expanded={menu === c.id}
        onClick={e => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id) }}>⋮</button>
      {menu === c.id && (
        <div className="pop right" role="menu">
          <button role="menuitem" onClick={() => block(c)} disabled={blocked.has(c.others[0])}>{blocked.has(c.others[0]) ? 'Blocked' : 'Block'}</button>
          <button role="menuitem" onClick={() => report(c)}>Report</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="msg-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="msg-panel" role="dialog" aria-modal="true" aria-label="Messages">
        <header className="msg-head">
          {conv && <button className="icon-btn" onClick={() => setCurrent(null)} aria-label="Back to all messages">‹</button>}
          <h2>{conv ? titleOf(conv) : 'Messages'}</h2>
          {conv && conv.type === 'dm' && conv.met_title && <NoteTag c={conv} />}
          <span className="grow" />
          {conv && renderMenu(conv)}
          <button className="icon-btn" onClick={onClose} aria-label="Close messages">×</button>
        </header>

        {conv ? (
          <ChatView key={conv.id} conv={conv} me={me} people={people} title={titleOf(conv)}
            isBlocked={conv.type === 'dm' && blocked.has(conv.others[0])} onRead={() => markRead(conv.id)} />
        ) : convs.length === 0 ? (
          <p className="msg-empty">No messages yet. Tap someone's picture on a sticky note to say hi.</p>
        ) : (
          <ul className="conv-list">
            {convs.map(c => (
              <li key={c.id}>
                <div className="conv" role="button" tabIndex={0} onClick={() => setCurrent(c.id)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setCurrent(c.id))}>
                  <div className="conv-main">
                    <div className="conv-top">
                      <b>{titleOf(c)}</b>
                      {c.type === 'meetup' && <span className="mini-badge">Meetup chat</span>}
                      {c.type === 'dm' && c.met_title && <NoteTag c={c} />}
                    </div>
                    <p className={c.unread ? 'unread' : ''}>
                      {c.last ? `${c.last.sender === me ? 'You: ' : ''}${c.last.body}` : 'No messages yet'}
                    </p>
                  </div>
                  <div className="conv-side">
                    {c.last && <time>{when(c.last.created_at)}</time>}
                    {c.unread > 0 && <span className="unread-dot" aria-label={`${c.unread} unread`} />}
                  </div>
                  {renderMenu(c)}
                </div>
              </li>
            ))}
          </ul>
        )}
        {toast && <p className="toast panel-toast" role="status">{toast}</p>}
      </aside>
    </div>
  )
}

// The sticky note you met this person through, shown next to their name.
function NoteTag({ c }) {
  return (
    <span className="note-tag-pill" title={`You met through: ${c.met_title}`}>
      <i className="mini-pin" aria-hidden="true" />{c.met_tag ? `${c.met_tag} · ` : ''}{c.met_title}
    </span>
  )
}
