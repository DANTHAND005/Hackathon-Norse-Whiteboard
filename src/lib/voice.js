// Browser text-to-speech for the lesson. Free, no key.
const FACTOR = { quick: 1.1, slow: 0.9, meditation: 0.85, rage: 1.15 }
const PITCH = { meditation: 0.8, rage: 1.3 }

const synth = typeof speechSynthesis === 'undefined' ? null : speechSynthesis
synth?.getVoices() // kicks off loading; the list is often empty until the browser fires voiceschanged

// Prefer natural-sounding voices for the language.
function pickVoice(lang) {
  const match = (synth?.getVoices() || []).filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()))
  return match.find(v => /natural|online|google/i.test(v.name)) || match[0] || null
}

// Resolves true if it spoke (or was cancelled mid-way), false if there is no voice, so callers show text only.
export function speak(text, { style, speed, language }) {
  return new Promise(resolve => {
    if (!synth) return resolve(false)
    const voice = pickVoice(language)
    if (!voice && language !== 'en') return resolve(false) // no voice for this language: text only
    const u = new SpeechSynthesisUtterance(text)
    if (voice) { u.voice = voice; u.lang = voice.lang } else u.lang = 'en-US'
    u.rate = (Number(speed) || 1) * (FACTOR[style] ?? 1.1)
    u.pitch = PITCH[style] ?? 1
    u.onend = () => resolve(true)
    u.onerror = () => resolve(true) // cancel() reports an error; the lesson loop checks whether it was stopped
    synth.speak(u)
  })
}

export const stopSpeaking = () => synth?.cancel()
