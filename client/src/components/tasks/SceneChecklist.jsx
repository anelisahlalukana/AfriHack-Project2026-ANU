import { useState } from 'react'
import { useWatch } from 'react-hook-form'
import { Camera, Check, Mic, Phone } from 'lucide-react'
import { uploadTaskFile } from '../../api/tasks'
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

// The at-the-scene checklist, part of the claim draft's react-hook-form form
// (fields `checklist.<key>.done` and `checklist.<key>.note`). Photos and voice notes
// upload straight into the draft and tick their item.
export function SceneChecklist({ task, items, register, control, setValue, onTaskChange }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')
  const checklist = useWatch({ control, name: 'checklist' }) || {}
  const doneCount = items.filter(item => checklist[item.key]?.done).length

  async function capture(item, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusyKey(item.key); setError('')
    try {
      onTaskChange(await uploadTaskFile(task.id, file, { documentKey: item.document_key, label: item.label }))
      setValue(`checklist.${item.key}.done`, true)
    } catch (error) { setError(error.message) }
    finally { setBusyKey(null) }
  }

  return <div className="rs-checklist">
    <p className="rs-note">{doneCount} of {items.length} done. Camera and voice notes are used only for this claim; tell any witness before you record them.</p>
    {items.map(item => {
      const media = item.kind === 'photo' || item.kind === 'voice'
      return <div key={item.key} className="rs-check">
        <label className="rs-tick" aria-label={`Done: ${item.label}`}>
          <input type="checkbox" className="sr-only" {...register(`checklist.${item.key}.done`)} />
          <Check size={14} />
        </label>
        <div>
          <b>{item.label}</b>
          {item.hint && <small>{item.hint}</small>}
          {(item.kind === 'text' || item.kind === 'voice') && <input type="text" aria-label={`${item.label} notes`} placeholder="Notes" {...register(`checklist.${item.key}.note`)} />}
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
