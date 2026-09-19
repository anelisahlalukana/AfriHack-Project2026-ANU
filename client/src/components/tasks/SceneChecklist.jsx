import { useState } from 'react'
import { Camera, Check, Mic, Phone } from 'lucide-react'
import { uploadTaskFile } from '../../api/tasks'
import { errorMessage } from '../../lib/taskFormat'
import { Alert } from './TaskBits'

export function SafetyBanner() {
  return <div className="rs-safety" role="note">
    <div><b>Is anyone hurt? Call for help first.</b><p>Move to safety before you take photos.</p></div>
    <div className="rs-calls">
      <a className="button primary" href="tel:112"><Phone size={15} /> Call 112</a>
      <a className="button" href="tel:10111"><Phone size={15} /> Police 10111</a>
    </div>
  </div>
}

// The at-the-scene checklist: one job at a time, photos and voice notes captured straight into the draft.
export function SceneChecklist({ task, items, value, onChange, onTaskChange }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')
  const doneCount = items.filter(item => value[item.key]?.done).length
  const set = (key, patch) => onChange({ ...value, [key]: { done: false, note: '', ...value[key], ...patch } })

  async function capture(item, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusyKey(item.key); setError('')
    try {
      onTaskChange(await uploadTaskFile(task.id, file, { documentKey: item.document_key, label: item.label }))
      set(item.key, { done: true })
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusyKey(null) }
  }

  return <div className="rs-checklist">
    <p className="rs-note">{doneCount} of {items.length} done. Camera and voice notes are used only for this claim; tell any witness before you record them.</p>
    {items.map(item => {
      const entry = value[item.key] || {}
      const media = item.kind === 'photo' || item.kind === 'voice'
      return <div key={item.key} className={`rs-check ${entry.done ? 'done' : ''}`}>
        <button type="button" className="rs-tick" aria-pressed={Boolean(entry.done)} aria-label={`${entry.done ? 'Undo' : 'Mark done'}: ${item.label}`} onClick={() => set(item.key, { done: !entry.done })}>{entry.done && <Check size={14} />}</button>
        <div>
          <b>{item.label}</b>
          {item.hint && <small>{item.hint}</small>}
          {(item.kind === 'text' || item.kind === 'voice') && <input type="text" aria-label={`${item.label} notes`} value={entry.note || ''} placeholder="Notes" onChange={e => set(item.key, { note: e.target.value, done: Boolean(e.target.value.trim()) || entry.done })} />}
        </div>
        {media && <label className="button rs-capture" aria-busy={busyKey === item.key}>
          {item.kind === 'photo' ? <Camera size={15} /> : <Mic size={15} />} {busyKey === item.key ? 'Saving…' : item.kind === 'photo' ? 'Photo' : 'Voice note'}
          <input className="sr-only" type="file" accept={item.kind === 'photo' ? 'image/*' : 'audio/*'} capture={item.kind === 'photo' ? 'environment' : undefined} onChange={e => capture(item, e)} />
        </label>}
      </div>
    })}
    <Alert>{error}</Alert>
  </div>
}
