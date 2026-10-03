import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const STYLES = [
  ['quick', 'Quick', 'Short and direct'],
  ['slow', 'Slow', 'Step by step, with examples'],
  ['meditation', 'Meditation', 'Calm and gentle'],
  ['rage', 'Rage', 'Drill sergeant, always encouraging'],
]
const SPEEDS = [1, 1.5, 2]
const LANGUAGES = [['en', 'English'], ['zh', 'Chinese'], ['de', 'German'], ['es', 'Spanish'], ['vi', 'Vietnamese'],
  ['fr', 'French'], ['pt', 'Portuguese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['ar', 'Arabic'], ['hi', 'Hindi']]

const initials = n => (n || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

export function Eye({ off }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" /><circle cx="12" cy="12" r="3" />{off && <path d="M3 3l18 18" />}
    </svg>
  )
}

export default function Profile() {
  const { session, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(profile.display_name || '')
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')

  const update = async fields => {
    const { error } = await supabase.from('profiles').update(fields).eq('id', session.user.id)
    if (error) setErr('Could not save that. Try again.')
    await refreshProfile()
  }

  async function saveName(e) {
    e.preventDefault()
    const v = name.trim()
    if (v.length < 2 || v.length > 20) return setErr('Display name must be 2 to 20 characters.')
    setErr('')
    await update({ display_name: v })
    setEditing(false)
  }

  const hidden = profile.hidden_tags || []
  const toggleTag = t => update({ hidden_tags: hidden.includes(t) ? hidden.filter(x => x !== t) : [...hidden, t] })

  const Tag = ({ t, took }) => (
    <span className={`tag-item ${hidden.includes(t) ? 'off' : ''}`}>
      <span className={`chip ${took ? 'took' : 'taking'}`}>{took && '✓ '}{t}</span>
      <button className="mini" onClick={() => toggleTag(t)} aria-pressed={hidden.includes(t)}
        aria-label={hidden.includes(t) ? `Show ${t} to others` : `Hide ${t} from others`} title={hidden.includes(t) ? 'Hidden from others' : 'Shown to others'}>
        <Eye off={hidden.includes(t)} />
      </button>
    </span>
  )

  return (
    <main className="page narrow">
      <header className="comm-head">
        <h1>Profile</h1>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings" title="Settings">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
          </svg>
        </button>
      </header>

      <section className="set-card">
        <div className="who">
          <span className="avatar big">{initials(profile.display_name)}</span>
          {editing ? (
            <form onSubmit={saveName} className="inline-edit">
              <label className="sr-only" htmlFor="dn">Display name</label>
              <input id="dn" className="input" value={name} onChange={e => setName(e.target.value)} maxLength={20} autoFocus />
              <button className="btn">Save</button>
              <button type="button" className="btn light" onClick={() => { setEditing(false); setName(profile.display_name || ''); setErr('') }}>Cancel</button>
            </form>
          ) : (
            <>
              <div><small>Display name</small><h2>{profile.display_name}</h2></div>
              <button className="btn light" onClick={() => setEditing(true)}>Edit</button>
            </>
          )}
        </div>
        <p className="msg" role="alert">{err}</p>

        <div className="line">
          <h3>Tags</h3>
          <div>
            <p className="hint">The eye decides whether other students can see each tag.</p>
            <div className="tags">
              {profile.classes.map(t => <Tag key={t} t={t} />)}
              {profile.past_classes.map(t => <Tag key={t} t={t} took />)}
            </div>
          </div>
        </div>

        <div className="line">
          <h3>Privacy</h3>
          <div className="stack">
            <label className="switch">
              <input type="checkbox" checked={profile.ghost_mode} onChange={e => update({ ghost_mode: e.target.checked })} />
              Ghost mode: hide me from live counts and avatars
            </label>
            <label className="field">Who can message me
              <select className="input" value={profile.message_privacy} onChange={e => update({ message_privacy: e.target.value })}>
                <option value="everyone">Everyone at NKU</option>
                <option value="classmates">Only classmates</option>
              </select>
            </label>
          </div>
        </div>

        <div className="line">
          <h3>AI tutor voice</h3>
          <div className="stack">
            <div className="choices" role="radiogroup" aria-label="Tutor style">
              {STYLES.map(([id, label, desc]) => (
                <button key={id} role="radio" aria-checked={profile.tutor_style === id} className={profile.tutor_style === id ? 'on' : ''} onClick={() => update({ tutor_style: id })}>
                  <b>{label}</b><span>{desc}</span>
                </button>
              ))}
            </div>
            <div>
              <p className="hint">Speed</p>
              <div className="seg" role="radiogroup" aria-label="Voice speed">
                {SPEEDS.map(s => (
                  <button key={s} role="radio" aria-checked={Number(profile.voice_speed) === s} className={Number(profile.voice_speed) === s ? 'on' : ''} onClick={() => update({ voice_speed: s })}>{s}x</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="line">
          <h3>Preferred language</h3>
          <div>
            <select className="input" aria-label="Preferred language" value={profile.language} onChange={e => update({ language: e.target.value })}>
              {LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <p className="hint">The tutor writes in this language. Spoken voices depend on your browser; if none exists you get text only.</p>
          </div>
        </div>
      </section>
    </main>
  )
}
