import { formRows } from '../../lib/taskFormat'

export function SubmittedDetails({ task }) {
  const rows = formRows(task.config?.formFields, task.form)
  const facts = [
    ['Reference', task.reference],
    ['Type', task.isClaim ? `${task.typeLabel} claim` : task.typeLabel],
    task.provider && ['Provider', task.provider.name],
    task.providerReference && [task.isClaim ? 'Insurer claim number' : 'Provider reference', task.providerReference],
    task.claimsHandler && ['Claims handler', task.claimsHandler],
    task.policyNumber && ['Policy number', task.policyNumber],
  ].filter(Boolean)
  return <section className="card">
    <h2>Details</h2>
    <dl className="rs-kv">
      {facts.map(([label, value]) => <div key={label} style={{ display: 'contents' }}><dt>{label}</dt><dd>{value}</dd></div>)}
      {rows.map(row => <div key={row.key} style={{ display: 'contents' }}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    </dl>
    {task.review && <p>Client review: {task.review.rating}/5{task.review.text ? `, "${task.review.text}"` : ''}</p>}
  </section>
}
