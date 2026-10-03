import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtWhen } from './StickyNote'

const time = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function ChatView({ conv, me, people, title, isBlocked, onRead }) {
  const navigate = useNavigate()
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [sharing, setSharing] = useState(false)
  const [boards, setBoards] = useState([])
  const end = useRef(null)
  const name = id => people[id]?.display_name || 'Someone'

  // Load the history, then keep it live while this chat is open.
  useEffect(() => {
    let off = false
    supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at')
      .then(({ data }) => { if (!off) { setMsgs(data || []); onRead() } })
    const ch = supabase.channel(`chat:${conv.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        p => { setMsgs(list => (list.some(m => m.id === p.new.id) ? list : [...list, p.new])); onRead() })
      .subscribe()
    return () => { off = true; supabase.removeChannel(ch) }
  }, [conv.id])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs.length])

  async function send(body, boardId = null) {
    setErr('')
    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: conv.id, sender: me, body, board_id: boardId }).select().single()
    if (error) return setErr("Couldn't send. This person may not accept messages from you.")
    setMsgs(list => (list.some(m => m.id === data.id) ? list : [...list, data]))
  }

  function submit(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    send(body)
  }

  async function openShare() {
    setSharing(!sharing)
    const { data } = await supabase.from('boards').select('id,title').eq('owner', me).order('updated_at', { ascending: false })
    setBoards(data || [])
  }
  async function shareBoard(b) {
    setSharing(false)
    await send(`Shared a board: ${b.title}`, b.id)
  }

  const m = conv.meetup
  return (
    <div className="chatview">
      <div className="cv-head">
        {conv.type === 'meetup' ? (
          <p>{[m?.building, m?.room].filter(Boolean).join(' ')} · {m ? fmtWhen(m.starts_at) : ''} · {conv.members.length} people</p>
        ) : (
          <div className="tags">
            {[...(people[conv.others[0]]?.classes || [])].map(t => <span key={t} className="chip taking">{t}</span>)}
            {[...(people[conv.others[0]]?.past_classes || [])].map(t => <span key={t} className="chip took">✓ {t}</span>)}
          </div>
        )}
      </div>

      <div className="cv-list">
        {msgs.length === 0 && <p className="hint">No messages yet. Say hi to {title}.</p>}
        {msgs.map(x => (
          <div key={x.id} className={`bubble ${x.sender === me ? 'mine' : ''}`}>
            {conv.type === 'meetup' && x.sender !== me && <small>{name(x.sender)}</small>}
            {x.board_id ? (
              <div className="board-card">
                <b>{x.body}</b>
                <button className="btn" onClick={() => navigate(`/board/${x.board_id}`)}>Join</button>
              </div>
            ) : <span>{x.body}</span>}
            <time>{time(x.created_at)}</time>
          </div>
        ))}
        <div ref={end} />
      </div>

      {sharing && (
        <div className="share-pick" role="menu">
          {boards.length === 0 && <p className="hint">You have no boards yet.</p>}
          {boards.map(b => <button key={b.id} role="menuitem" onClick={() => shareBoard(b)}>{b.title}</button>)}
        </div>
      )}
      <p className="msg" role="alert">{err}</p>
      {isBlocked ? <p className="hint cv-blocked">You blocked this person. Unblock them in Settings to message again.</p> : (
        <form className="composer" onSubmit={submit}>
          <button type="button" className="btn light" onClick={openShare} aria-expanded={sharing}>Share a board</button>
          <label className="sr-only" htmlFor="msg-in">Message</label>
          <input id="msg-in" className="input" value={text} onChange={e => setText(e.target.value)} placeholder="Type a message…" maxLength={2000} autoComplete="off" />
          <button className="btn dark send" aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </form>
      )}
    </div>
  )
}
