import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

// Tap anyone's avatar: their name, the tags they show, the classes you share, and a Message button.
export default function PersonPopup({ personId, note, me, myTags, onClose, onMessage }) {
  const [p, setP] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('public_profiles').select('id,display_name,classes,past_classes,message_privacy').eq('id', personId).maybeSingle()
      .then(({ data }) => setP(data || false))
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [personId])

  const theirs = p ? [...p.classes, ...p.past_classes] : []
  const shared = theirs.filter(t => myTags.includes(t))
  // Hidden when we already know the server would refuse (classmates only, nothing in common we can see).
  const allowed = p && personId !== me && (p.message_privacy === 'everyone' || shared.length > 0)

  async function message() {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('start_dm', { other_user: personId, note_title: note?.title ?? null, note_tag: note?.tag ?? null })
    setBusy(false)
    if (error) return setErr(error.message.includes('classmates') ? 'This person only accepts messages from classmates.' : "You can't message this person.")
    onMessage(data)
  }

  const Chip = ({ t, took }) => (
    <span className={`chip ${took ? 'took' : 'taking'} ${shared.includes(t) ? 'shared' : ''}`}>{took && '✓ '}{t}</span>
  )

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="person card" role="dialog" aria-modal="true" aria-label="Person">
        {p === null ? <p className="hint">Loading…</p> : p === false ? <p className="hint">This person isn't available.</p> : (
          <>
            <span className="avatar big">{initials(p.display_name)}</span>
            <h2>{p.display_name}{personId === me && ' (you)'}</h2>
            {theirs.length > 0 ? (
              <>
                <div className="tags">
                  {p.classes.map(t => <Chip key={t} t={t} />)}
                  {p.past_classes.map(t => <Chip key={t} t={t} took />)}
                </div>
                {shared.length > 0 && personId !== me && <p className="hint">You both have {shared.join(', ')}.</p>}
              </>
            ) : <p className="hint">No tags shown.</p>}
            <p className="msg" role="alert">{err}</p>
            <div className="form-btns">
              <button className="btn light" onClick={onClose}>Close</button>
              {allowed && <button className="btn" onClick={message} disabled={busy}>{busy ? <span className="spinner" aria-label="Working" /> : 'Message'}</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
