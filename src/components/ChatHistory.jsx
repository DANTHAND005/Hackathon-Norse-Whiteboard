import { useEffect, useRef, useState } from 'react'

export default function ChatHistory({ items, names, busy, canAsk, onAsk, onJump }) {
  const [text, setText] = useState('')
  const list = useRef(null)

  // Oldest at the top, newest at the bottom; keep the newest in view.
  const ordered = [...items].reverse()
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [items.length])

  function submit(e) {
    e.preventDefault()
    onAsk(text)
    setText('')
  }

  return (
    <aside className="chat" aria-label="Chat history">
      <h2>Chat history <small>{items.length} {items.length === 1 ? 'question' : 'questions'}</small></h2>
      <ol className="chat-list" ref={list}>
        {items.length === 0 && <li className="chat-empty">Ask the AI about anything on the board. Circle it first to point at one spot.</li>}
        {ordered.map(q => (
          <li key={q.id}>
            <button className="q" onClick={() => q.anchor && onJump(q.anchor)}>
              <small>{names[q.asked_by] || 'Someone'}{q.page_number ? ` · p.${q.page_number}` : ''}</small>
              <b>{q.question}</b>
              <span>{q.answer}</span>
            </button>
          </li>
        ))}
      </ol>
      <form className="chat-ask" onSubmit={submit}>
        <label htmlFor="ask">Ask about the board</label>
        <div>
          <input id="ask" className="input" value={text} onChange={e => setText(e.target.value)}
            placeholder="Type a question…" maxLength={500} />
          <button className="btn dark send" disabled={busy || !canAsk} aria-label="Send question">
            {busy ? <span className="spinner light" aria-label="Thinking" /> : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
            )}
          </button>
        </div>
      </form>
    </aside>
  )
}
