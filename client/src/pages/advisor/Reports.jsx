import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, RotateCw, Search, Sparkles } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { isAdmin } from '../../lib/authRoles'
import { askReport, generateReport, getReportCatalogue, runReport } from '../../api/reports'
import { TRY_ASKING, featuredTemplates, formatGeneratedAt, groupTemplates, isClosestMatch, printTitle, showingLabel, storyParagraphs } from '../../lib/reportFormat'
import ReportChart from '../../components/reports/ReportChart'
import './Reports.css'

function Spinner({ label }) {
  return <div className="rpt-loading" role="status"><span className="rpt-spinner" aria-hidden="true" />{label}</div>
}

function Problem({ error, onRetry }) {
  return <div className="rpt-problem" role="alert">
    <p className="error">{error}</p>
    {onRetry && <button type="button" onClick={onRetry}><RotateCw size={15} /> Try again</button>}
  </div>
}

// Ask a plain-English question, see a live chart, and turn it into a short written report.
// Suggested-question chips and the browse list run templates directly (no model involved),
// so they always work. The server decides whose data is in scope from the signed-in user.
export default function Reports() {
  const { session } = useAuth()
  const admin = isAdmin(session.user)

  const [catalogue, setCatalogue] = useState({ templates: [], categories: [], ai: { enabled: true } })
  const templates = catalogue.templates
  const [templatesError, setTemplatesError] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState(null) // { message, request } — request is re-run by Try again
  const [report, setReport] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [reportProblem, setReportProblem] = useState(null)
  const inFlight = useRef(null)
  const reportRef = useRef(null)

  const loadTemplates = useCallback(async () => {
    setTemplatesError('')
    try {
      setCatalogue(await getReportCatalogue())
    } catch (error) {
      setTemplatesError(error.message)
    }
  }, [])

  useEffect(() => {
    let active = true
    getReportCatalogue()
      .then(data => { if (active) setCatalogue(data) })
      .catch(error => { if (active) setTemplatesError(error.message) })
    return () => { active = false; inFlight.current?.abort() }
  }, [])

  // Runs one request at a time: a new question cancels the previous one.
  const perform = useCallback(async (request) => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setLoading(true); setProblem(null); setReport(null); setReportProblem(null)
    try {
      const data = await request(controller.signal)
      setResult(data)
    } catch (error) {
      if (error.canceled) return
      setProblem({ message: error.message || 'The report could not be run.', request })
    } finally {
      if (inFlight.current === controller) { inFlight.current = null; setLoading(false) }
    }
  }, [])

  function ask(event, text = question.trim()) {
    event?.preventDefault()
    if (!text) return
    perform(signal => askReport(text, signal))
  }

  function tryAsking(text) {
    setQuestion(text)
    ask(null, text)
  }

  function runTemplate(template, parameters = {}, keepQuestion = false) {
    if (!keepQuestion) setQuestion(template.suggestedQuestion)
    perform(signal => runReport(template.id, parameters, signal))
  }

  async function generate() {
    if (!result) return
    setGenerating(true); setReportProblem(null)
    try {
      const data = result.kind === 'query'
        ? await generateReport(null, null, undefined, result.query)
        : await generateReport(result.template.id, result.parameters)
      setReport(data)
      requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (error) {
      setReportProblem(error.message || 'The report could not be written.')
    } finally {
      setGenerating(false)
    }
  }

  // Browser print → "Save as PDF". The print stylesheet (Reports.css) only applies while
  // body has .rpt-printing, so printing any other page is unchanged.
  function downloadPdf() {
    const previousTitle = document.title
    document.title = printTitle(report?.title)
    document.body.classList.add('rpt-printing')
    const done = () => {
      document.body.classList.remove('rpt-printing')
      document.title = previousTitle
      window.removeEventListener('afterprint', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
    setTimeout(done, 1000)
  }

  return <div className="rpt-page">
    <header className="page-heading rpt-no-print">
      <div>
        <h1>Ask about your data</h1>
        <p>{admin ? 'Live figures across every adviser\'s book.' : 'Live figures from your own clients.'} Pick a question below or type your own.</p>
      </div>
    </header>

    <section className="card rpt-ask rpt-no-print">
      <form className="rpt-form" onSubmit={ask}>
        <label className="sr-only" htmlFor="rpt-question">Your question</label>
        <div className="rpt-input">
          <Search size={17} aria-hidden="true" />
          <input id="rpt-question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about your data… e.g. how many motor claims were declined this year?" maxLength={500} autoComplete="off" />
        </div>
        <button className="primary" type="submit" disabled={loading || !question.trim()}><Sparkles size={16} /> Ask</button>
      </form>
      {!catalogue.ai.enabled && !templatesError && <p className="rpt-note">AI matching is off, so questions are matched by keyword. Suggested questions and the report list always work.</p>}
      {templatesError
        ? <Problem error={`Couldn't load the suggested questions: ${templatesError}`} onRetry={loadTemplates} />
        : <div className="rpt-chips" aria-label="Suggested questions">
          {featuredTemplates(templates).map(t => <button type="button" key={t.id} className="rpt-chip" onClick={() => runTemplate(t)} disabled={loading} title={t.description}>{t.suggestedQuestion}</button>)}
        </div>}
      <div className="rpt-try" aria-label="Free-form examples">
        <span>Or ask anything about your records:</span>
        {TRY_ASKING.map(text => <button type="button" key={text} className="rpt-link" onClick={() => tryAsking(text)} disabled={loading}>{text}</button>)}
      </div>
      {templates.length > 0 && <details className="rpt-browse">
        <summary>Browse all {templates.length} reports</summary>
        {groupTemplates(templates, catalogue.categories).map(group => <div className="rpt-group" key={group.category}>
          <h3>{group.category}</h3>
          <ul>
            {group.templates.map(t => <li key={t.id}>
              <button type="button" onClick={() => runTemplate(t)} disabled={loading}><b>{t.label}</b><span>{t.description}</span></button>
            </li>)}
          </ul>
        </div>)}
      </details>}
    </section>

    {loading && <section className="card rpt-no-print"><Spinner label="Running your report…" /></section>}
    {!loading && problem && <section className="card rpt-no-print"><Problem error={problem.message} onRetry={() => perform(problem.request)} /></section>}

    {!loading && !problem && result && <section className="card rpt-result rpt-no-print" aria-live="polite">
      <div className="rpt-result-head">
        <div>
          <p className="rpt-showing">{showingLabel(result)}</p>
          {result.kind === 'query'
            ? <span className="rs-chip ok" title="Built from your records for this question rather than a prepared report.">Custom query</span>
            : isClosestMatch(result) && <span className="rs-chip warn" title="We couldn't match your question exactly, so this is the nearest report.">Closest match</span>}
        </div>
        {result.readAs?.length > 0 && <div className="rpt-readas" aria-label="How we read your question">
          {result.readAs.map(part => <span key={part}>{part}</span>)}
        </div>}
        {result.headline && <h2>{result.headline}</h2>}
      </div>
      <ReportChart result={result} linkClients={!admin} showData />
      {result.alternatives?.length > 0 && <div className="rpt-alternatives">
        <span>{result.kind === 'query' ? 'Or see a prepared report:' : 'Not what you meant? Try:'}</span>
        {result.alternatives.map(alt => <button type="button" key={alt.id} className="rpt-chip" disabled={loading}
          onClick={() => runTemplate(alt, result.parameters, true)}>{alt.label}</button>)}
      </div>}
      <div className="rpt-actions">
        <button type="button" className="primary" onClick={generate} disabled={generating}>
          <FileText size={16} /> {generating ? 'Writing report…' : report ? 'Write it again' : 'Generate report'}
        </button>
        {generating && <Spinner label="Writing a short summary…" />}
      </div>
      {reportProblem && <Problem error={reportProblem} onRetry={generate} />}
    </section>}

    {report && !loading && <article className="card rpt-report" ref={reportRef}>
      <header className="rpt-report-head">
        <img className="rpt-print-logo" src="/images/slogan.png" alt="Royal Square Financial" />
        <p className="eyebrow">ROYAL SQUARE FINANCIAL · REPORT</p>
        <h2>{report.title}</h2>
        <p className="rpt-meta muted">Prepared for {report.generatedFor} · {formatGeneratedAt(report.generatedAt)}{report.scope ? ` · ${report.scope}` : ''}</p>
      </header>
      {report.highlights?.length > 0 && <dl className="rpt-kpis" aria-label="Key figures">
        {report.highlights.map(item => <div className="rpt-kpi" key={item.label}>
          <dt><span>{item.label}</span></dt>
          <dd><strong>{item.value}</strong></dd>
        </div>)}
      </dl>}
      <section className="rpt-story" aria-label="Summary">
        {storyParagraphs(report.narrative).map((text, i) => <p key={i}>{text}</p>)}
      </section>
      <figure className="rpt-figure">
        <h3>{report.template?.label || report.title}</h3>
        {report.headline && <figcaption className="rpt-caption muted">{report.headline}</figcaption>}
        <ReportChart result={report} linkClients={!admin} showData animate={false} />
      </figure>
      {report.related?.length > 0 && <>
        <h3 className="rpt-related-title">Related views</h3>
        <div className="rpt-related">
          {report.related.map(view => <figure className="rpt-figure" key={view.templateId || view.title}>
            <h3>{view.title}</h3>
            {view.caption && <figcaption className="rpt-caption muted">{view.caption}</figcaption>}
            <ReportChart result={view} linkClients={!admin} compact animate={false} />
          </figure>)}
        </div>
      </>}
      <footer className="rpt-footnote">
        Figures from the Royal Square workspace at the time shown.{report.writtenBy === 'template' ? ' Summary written automatically from the figures.' : ' Summary drafted by AI from aggregated figures; check before sharing.'}
      </footer>
      <div className="rpt-actions rpt-no-print">
        <button type="button" className="primary" onClick={downloadPdf}><Download size={16} /> Download PDF</button>
      </div>
    </article>}
  </div>
}
