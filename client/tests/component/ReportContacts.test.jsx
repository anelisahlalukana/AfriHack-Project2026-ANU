import { cloneElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Reports from '../../src/pages/advisor/Reports'
import { askReport, generateReport, getReportCatalogue } from '../../src/api/reports'
import { useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/api/reports', () => ({ askReport: vi.fn(), generateReport: vi.fn(), getReportCatalogue: vi.fn(), runReport: vi.fn() }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: vi.fn() }))
// jsdom has no layout, so give the chart a size.
vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children, height }) => <div style={{ width: 600, height }}>{cloneElement(children, { width: 600, height })}</div> }
})

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  // The page scrolls the new report into view; jsdom has no layout to scroll.
  Element.prototype.scrollIntoView = vi.fn()
})

const ADVISER = { id: 'adviser-1', app_metadata: { role: 'advisor' }, user_metadata: { full_name: 'Test Adviser' } }
const ADMIN = { id: 'admin-1', app_metadata: { role: 'admin' }, user_metadata: { full_name: 'Test Admin' } }
const LERATO = '00000000-0000-4000-8000-0000000000a1'
const SIBUSISO = '00000000-0000-4000-8000-0000000000a2'

const TEMPLATE = { id: 'monthly_cash_flow', category: 'Money & goals', featured: true, label: 'Monthly cash flow', description: 'Income minus expenses.', suggestedQuestion: 'Which clients are spending more than they earn each month?', parameters: {} }
const chart = {
  kind: 'template',
  template: { id: TEMPLATE.id, label: TEMPLATE.label, description: TEMPLATE.description },
  parameters: {},
  scope: 'all clients',
  chartType: 'bar',
  rows: [{ label: 'In deficit', value: 2 }, { label: 'R0 – R5k', value: 1 }],
  series: [{ key: 'value', label: 'Clients' }],
  unit: 'clients',
  headline: 'Average monthly surplus R3 000; 2 clients spend more than they earn',
  matchedBy: 'keyword',
  alternatives: [],
}
const contacts = (extra = {}) => ({
  title: 'Clients spending more than they earn',
  intro: 'Book a budget review with each, starting with the biggest monthly shortfall.',
  order: 'biggest monthly shortfall first',
  total: 2,
  clients: [
    { id: LERATO, name: 'Lerato Khumalo', detail: 'Spends R9 000 more than they earn each month (R20 000 in, R29 000 out)' },
    { id: SIBUSISO, name: 'Sibusiso Dlamini', detail: 'Spends R5 000 more than they earn each month (R20 000 in, R25 000 out)' },
  ],
  ...extra,
})
const written = (extra = {}) => ({
  ...chart,
  title: 'Monthly cash flow',
  narrative: 'Two clients spend more than they earn.',
  meaning: 'Two clients are in deficit. The 2 clients to contact are listed below, biggest monthly shortfall first.',
  writtenBy: 'template',
  highlights: [{ label: 'Clients in deficit', value: '2' }],
  related: [],
  generatedAt: '2026-09-20T10:00:00.000Z',
  generatedFor: 'Test Adviser',
  ...extra,
})

async function generateReportFor(user, report) {
  useAuth.mockReturnValue({ session: { user } })
  getReportCatalogue.mockResolvedValue({ templates: [TEMPLATE], categories: ['Money & goals'], ai: { enabled: true } })
  askReport.mockResolvedValue(chart)
  generateReport.mockResolvedValue(report)

  render(<MemoryRouter><Reports /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('Your question'), { target: { value: 'How many clients spend more than they earn each month?' } })
  fireEvent.click(screen.getByRole('button', { name: /^Ask$/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Generate report' }))
  return screen.findByRole('region', { name: 'What this means for the business' }).catch(() => screen.findByText('What this means for the business').then(heading => heading.closest('section')))
}

describe('Who to contact, in the written report', () => {
  it('lists the clients under "What this means for the business", each linking to their profile', async () => {
    const meaning = await generateReportFor(ADVISER, written({ contacts: contacts() }))
    const list = within(meaning)

    expect(list.getByRole('heading', { name: 'Clients spending more than they earn' })).toBeTruthy()
    expect(list.getByText('Book a budget review with each, starting with the biggest monthly shortfall.')).toBeTruthy()

    const rows = list.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'Lerato Khumalo' }).getAttribute('href')).toBe(`/clients/${LERATO}`)
    expect(within(rows[0]).getByText(/Spends R9 000 more than they earn each month/)).toBeTruthy()
    expect(within(rows[1]).getByRole('link', { name: 'Sibusiso Dlamini' }).getAttribute('href')).toBe(`/clients/${SIBUSISO}`)
    // The reading points at the list rather than repeating the names.
    expect(list.getByText(/The 2 clients to contact are listed below/)).toBeTruthy()
    expect(list.queryByText('Showing', { exact: false })).toBeNull()
  })

  it('says how many more there are when the list is cut off', async () => {
    const meaning = await generateReportFor(ADVISER, written({ contacts: contacts({ total: 21 }) }))
    expect(within(meaning).getByText('Showing the 2 most urgent of 21.')).toBeTruthy()
  })

  it('shows no list at all for a report that has nobody to contact', async () => {
    const meaning = await generateReportFor(ADVISER, written())
    expect(within(meaning).queryByRole('list')).toBeNull()
    expect(within(meaning).queryByRole('heading', { name: /spending more than they earn/ })).toBeNull()
  })

  it('never turns a name into a link for an admin', async () => {
    const meaning = await generateReportFor(ADMIN, written({ contacts: contacts() }))
    expect(within(meaning).getByText('Lerato Khumalo')).toBeTruthy()
    expect(within(meaning).queryByRole('link')).toBeNull()
  })
})
