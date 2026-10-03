export default function LessonControls({ caption, state, muted, onPause, onResume, onSkip, onMute }) {
  if (state === 'idle' && !caption) return null
  const busy = state === 'loading' || state === 'thinking'
  const driving = state === 'playing' || state === 'paused'
  return (
    <div className="lesson" role="region" aria-label="Lesson">
      <p className="caption" aria-live="polite">{caption}</p>
      <div className="lesson-btns">
        {busy && <span className="spinner" aria-label="Working" />}
        {driving && (state === 'playing'
          ? <button onClick={onPause}>Pause</button>
          : <button onClick={onResume}>Resume</button>)}
        {driving && <button onClick={onSkip}>Skip</button>}
        {state !== 'idle' && <button onClick={onMute} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>}
      </div>
    </div>
  )
}
