import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Plus, Send, Trash2, X } from 'lucide-react'
import { createRequest, getCatalog, uploadTaskFile } from '../../api/tasks'
import { FINANCIAL_CATEGORIES, answerText, applyAnswer, buildRequest, buildSteps, emptyAnswers, summaryLines, validateAnswer } from '../../lib/askChat'
import { errorMessage } from '../../lib/taskFormat'

// "Ask for something": a chat that walks the client through a request (change of address,
// banking details, a border letter, ...) one question at a time and sends it to their provider.
// A round button in the bottom-right corner opens it; the conversation is kept while it is closed.

function ChoiceInput({ options, onPick }) {
  return <div className="chat-chips">{options.map(option => <button key={option.value} type="button" onClick={() => onPick(option.value)}>{option.label}</button>)}</div>
}

// One typed answer (text, number, date...). Re-created for every question, so it always starts empty.
function TypedInput({ step, onSubmit }) {
  const [value, setValue] = useState('')
  const props = { value, onChange: event => setValue(event.target.value), autoFocus: true, 'aria-label': step.label }
  const control = step.kind === 'textarea' ? <textarea rows={3} {...props} />
    : <input {...props} type={{ number: 'number', date: 'date', datetime: 'datetime-local' }[step.kind] || 'text'} min={step.kind === 'number' ? 0 : undefined} step={step.kind === 'number' ? 'any' : undefined} inputMode={step.kind === 'number' ? 'decimal' : undefined} />
  // noValidate: the chat checks answers itself and replies in the conversation, instead of a browser pop-up.
  return <form className="chat-send" noValidate onSubmit={event => { event.preventDefault(); onSubmit(value) }}>
    {control}
    <button className="primary" aria-label="Send"><Send size={16} /></button>
    {!step.required && <button type="button" onClick={() => onSubmit('')}>Skip</button>}
  </form>
}

function FileInput({ onSubmit }) {
  return <div className="chat-send">
    <input type="file" accept="image/*,application/pdf" aria-label="Choose a file to attach" onChange={event => { const file = event.target.files?.[0]; if (file) onSubmit(file) }} />
    <button type="button" onClick={() => onSubmit(null)}>Skip for now</button>
  </div>
}

function FinancialInput({ onSubmit }) {
  const blank = () => ({ category: 'asset', item_type: '', amount: '' })
  const [rows, setRows] = useState([blank()])
  const change = (index, patch) => setRows(current => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  return <div className="chat-rows">
    {rows.map((row, index) => <div className="chat-row" key={index}>
      <select value={row.category} onChange={event => change(index, { category: event.target.value })} aria-label={`Item ${index + 1} type`}>
        {FINANCIAL_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <input value={row.item_type} onChange={event => change(index, { item_type: event.target.value })} placeholder="e.g. Unit trust, home loan" aria-label={`Item ${index + 1} description`} />
      <input type="number" min="0" step="any" inputMode="decimal" value={row.amount} onChange={event => change(index, { amount: event.target.value })} placeholder="Amount (ZAR)" aria-label={`Item ${index + 1} amount`} />
      {rows.length > 1 && <button type="button" onClick={() => setRows(current => current.filter((_, i) => i !== index))} aria-label={`Remove item ${index + 1}`}><Trash2 size={15} /></button>}
    </div>)}
    <div className="chat-chips">
      <button type="button" onClick={() => setRows(current => [...current, blank()])}><Plus size={15} /> Add another item</button>
      <button type="button" className="primary" onClick={() => onSubmit(rows)}>Done</button>
    </div>
  </div>
}

export function AskChat({ open, onOpen, onClose, name }) {
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [phase, setPhase] = useState('choose') // choose | asking | review | sending | done
  const [type, setType] = useState(null)
  const [steps, setSteps] = useState([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState(emptyAnswers)
  const [log, setLog] = useState([])
  const nextId = useRef(0)
  const logRef = useRef(null)

  useEffect(() => {
    if (!open || catalog || catalogError) return
    let active = true
    getCatalog()
      .then(data => { if (active) setCatalog(data) })
      .catch(error => { if (active) setCatalogError(errorMessage(error)) })
    return () => { active = false }
  }, [open, catalog, catalogError])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [log, phase, open, catalog])

  const say = (from, text, extra = {}) => setLog(current => [...current, { id: nextId.current++, from, text, ...extra }])

  function review(finalAnswers, allSteps, chosenType) {
    say('bot', `Here's what I have for "${chosenType.label}":\n${summaryLines(allSteps, finalAnswers).join('\n')}\n\nShall I send it?`)
    setPhase('review')
  }

  function chooseType(requestType) {
    const built = buildSteps(requestType, catalog.providers)
    setType(requestType)
    setSteps(built)
    setIndex(0)
    setAnswers(emptyAnswers())
    say('user', requestType.label)
    if (!built.length) { review(emptyAnswers(), built, requestType); return }
    say('bot', `${requestType.description ? `${requestType.description} ` : ''}Let's get that started. ${built[0].prompt}`)
    setPhase('asking')
  }

  function answer(raw) {
    const step = steps[index]
    const result = validateAnswer(step, raw)
    if (result.error) { say('bot', result.error); return }
    const next = applyAnswer(answers, step, result.value)
    setAnswers(next)
    say('user', answerText(step, result.value))
    if (index + 1 < steps.length) {
      say('bot', steps[index + 1].prompt)
      setIndex(index + 1)
    } else {
      setIndex(steps.length)
      review(next, steps, type)
    }
  }

  async function send() {
    setPhase('sending')
    try {
      const { payload, files } = buildRequest(type, answers)
      let task = await createRequest(payload)
      // Files are attached once the request exists; any that fail show as missing on the request page.
      for (const { documentKey, file } of files) {
        try { task = await uploadTaskFile(task.id, file, { documentKey }) } catch { /* can be added from the request page */ }
      }
      say('bot', `All done! Your request ${task.reference} has been sent. I'll show its progress on your Claims tab.`, { to: `/account/tasks/${task.id}`, linkLabel: 'View your request' })
      setPhase('done')
    } catch (error) {
      say('bot', `Sorry, I couldn't send that: ${errorMessage(error)}`)
      setPhase('review')
    }
  }

  function restart() {
    setPhase('choose'); setType(null); setSteps([]); setIndex(0); setAnswers(emptyAnswers()); setLog([])
  }

  const step = phase === 'asking' ? steps[index] : null

  if (!open) {
    return <button type="button" className="chat-fab" onClick={onOpen} aria-label="Ask for something" title="Ask for something"><MessageCircle size={26} /></button>
  }

  return <section className="chat-panel" role="dialog" aria-label="Ask for something">
    <header className="chat-head">
      <div><b>Ask for something</b><small>Royal Square assistant</small></div>
      <button type="button" onClick={onClose} aria-label="Close chat"><X size={18} /></button>
    </header>

    <div className="chat-log" ref={logRef} role="log" aria-live="polite">
      <p className="chat-msg bot">{`Hi${name ? ` ${name}` : ''}! I can send a request to your provider or Royal Square for you. What do you need?`}</p>
      {catalogError && <p className="chat-msg bot">Sorry, I couldn't load the list of requests: {catalogError}</p>}
      {!catalog && !catalogError && <p className="chat-msg bot" role="status">One moment…</p>}
      {log.map(message => <p key={message.id} className={`chat-msg ${message.from}`}>
        {message.text}
        {message.to && <><br /><Link className="chat-link" to={message.to} onClick={onClose}>{message.linkLabel}</Link></>}
      </p>)}
      {phase === 'sending' && <p className="chat-msg bot" role="status">Sending your request…</p>}
    </div>

    <div className="chat-input">
      {catalogError && <button type="button" onClick={() => setCatalogError('')}>Try again</button>}
      {phase === 'choose' && catalog && <div className="chat-list">{catalog.requestTypes.map(requestType => <button key={requestType.task_type} type="button" onClick={() => chooseType(requestType)}><b>{requestType.label}</b><small>{requestType.description}</small></button>)}</div>}
      {step && (step.kind === 'choice' || step.kind === 'boolean') && <ChoiceInput key={step.id} options={step.kind === 'boolean' ? [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] : step.options} onPick={answer} />}
      {step && ['text', 'textarea', 'number', 'date', 'datetime'].includes(step.kind) && <TypedInput key={step.id} step={step} onSubmit={answer} />}
      {step && step.kind === 'file' && <FileInput key={step.id} onSubmit={answer} />}
      {step && step.kind === 'financial' && <FinancialInput key={step.id} onSubmit={answer} />}
      {phase === 'review' && <div className="chat-chips"><button type="button" className="primary" onClick={send}>Send request</button><button type="button" onClick={restart}>Start again</button></div>}
      {phase === 'done' && <div className="chat-chips"><button type="button" onClick={restart}>Ask for something else</button></div>}
    </div>
  </section>
}
