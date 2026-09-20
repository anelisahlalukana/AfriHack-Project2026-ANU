import { cloneElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from '../../src/pages/advisor/Dashboard'
import { useDashboard } from '../../src/hooks/useDashboard'
import { runReport } from '../../src/api/reports'

vi.mock('../../src/hooks/useDashboard', () => ({ useDashboard: vi.fn() }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'adviser-1' } } }) }))
vi.mock('../../src/api/reports', () => ({ runReport: vi.fn() }))
// jsdom has no layout, so ResponsiveContainer would measure 0 x 0 and draw nothing. Give it a size.
vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, ResponsiveContainer: ({ children, height }) => <div style={{ width: 640, height }}>{cloneElement(children, { width: 640, height })}</div> }
})

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const dashboard = (over = {}) => ({
  generatedAt: '2026-09-19T10:00:00.000Z',
  clients: { total: 12, byStatus: { onboarding: 3, active: 8, inactive: 1 }, newInWindow: 2, newWindowDays: 30, politicallyExposed: 1, noFinancialAnalysis: 4, riskMix: { conservative: 3, growth: 5, not_assessed: 4 } },
  portfolio: { assets: 5000000, liabilities: 1500000, netWorth: 3500000 },
  goals: { inProgress: 6, pastTargetDate: 1, totalTarget: 900000, totalProgress: 300000, fundedPercent: 33 },
  documents: { awaitingSignature: 5, oldestWaitingDays: 12, completeClients: 6, missingForOnboarding: 4, consentsExpired: 1, consentsExpiringSoon: 2, consentWarningDays: 30 },
  onboarding: { total: 3, stalled: 2, stalledAfterDays: 14, clients: [] },
  work: { open: 9, waitingOnUs: 4, waitingOnClients: 3, overdue: 2 },
  reminders: { overdue: 6, dueSoon: 4, dueSoonDays: 7 },
  activity: { unread: 2, recent: [] },
  compliance: null,
  ...over,
})

// What the reports engine returns for "claims and requests over time": one row per month, one series per type.
const report = (rows) => ({ kind: 'template', chartType: 'line', unit: 'tasks', period: 'month', series: [{ key: 's0', label: 'Claim' }, { key: 'other', label: 'Other' }], rows })
const CURRENT = report([{ label: '2026-03', s0: 3, other: 1 }, { label: '2026-04', s0: 5, other: 0 }, { label: '2026-05', s0: 2, other: 2 }])
const PREVIOUS = report([{ label: '2025-09', s0: 1, other: 1 }, { label: '2025-10', s0: 2, other: 1 }, { label: '2025-11', s0: 4, other: 0 }])

function renderDashboard(data) {
  useDashboard.mockReturnValue({ data, error: '', refresh: vi.fn() })
  return render(<MemoryRouter><Dashboard /></MemoryRouter>)
}

// Current period first, then the period before it.
const trendLoads = () => runReport.mockResolvedValueOnce(CURRENT).mockResolvedValueOnce(PREVIOUS)

describe('Advisor dashboard', () => {
  it('shows charts instead of a wall of stat tiles', async () => {
    trendLoads()
    const { container } = renderDashboard(dashboard())

    expect(container.querySelector('.metric')).toBeNull()
    expect(container.querySelector('.stats')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Work over time' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Clients by risk profile' })).toBeTruthy()
    await screen.findByRole('figure', { name: 'Claims and requests logged per month' })
    expect(container.querySelectorAll('svg.recharts-surface').length).toBeGreaterThanOrEqual(3)
  })

  it('gives every attention bar a label that links to where it is dealt with', () => {
    trendLoads()
    const { container } = renderDashboard(dashboard())
    const chart = within(screen.getByRole('figure', { name: 'Items that need attention' }))

    expect(chart.getByText(/Waiting on us: 4, Documents to sign: 5, Stalled onboarding: 2, Consents to renew: 3, Reminders overdue: 6, Needs financial analysis: 4/)).toBeTruthy()
    const links = Object.fromEntries([...container.querySelectorAll('a.dash-tick')].map(a => [a.textContent, a.getAttribute('href')]))
    expect(links['Stalled onboarding']).toBe('/clients?status=onboarding')
    expect(links['Waiting on us']).toBe('/tasks')
    expect(links['Reminders overdue']).toBe('/reminders')
  })

  it('draws the work trend as a line over a filled area, with the previous period dashed beside it', async () => {
    trendLoads()
    const { container } = renderDashboard(dashboard())
    const chart = await screen.findByRole('figure', { name: 'Claims and requests logged per month' })

    // Each month adds every type together: 4, 5 and 4 this period.
    expect(within(chart).getByText('March 2026: 4, April 2026: 5, May 2026: 4')).toBeTruthy()
    expect(within(chart).getByText('This period')).toBeTruthy()
    expect(within(chart).getByText('Previous period')).toBeTruthy()
    expect(container.querySelector('.recharts-area-area')).toBeTruthy()
    expect(container.querySelector('.recharts-area-curve')).toBeTruthy()
    expect(container.querySelector('.recharts-line-curve')?.getAttribute('stroke-dasharray')).toBe('6 5')
    expect(container.querySelectorAll('.recharts-area-dots .recharts-dot').length).toBe(3)
    // The first request is the last six completed months, the second the six before them.
    expect(runReport).toHaveBeenCalledTimes(2)
    expect(runReport.mock.calls[0][0]).toBe('task_volume_trend')
    expect(runReport.mock.calls[0][1].date_range.from < runReport.mock.calls[0][1].date_range.to).toBe(true)
    expect(runReport.mock.calls[1][1].date_range.to < runReport.mock.calls[0][1].date_range.from).toBe(true)
  })

  it('reloads the trend when a different period is chosen', async () => {
    runReport.mockResolvedValue(CURRENT)
    renderDashboard(dashboard())
    await screen.findByRole('figure', { name: 'Claims and requests logged per month' })
    const first = runReport.mock.calls[0][1].date_range

    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '12' } })

    await waitFor(() => expect(runReport).toHaveBeenCalledTimes(4))
    expect(runReport.mock.calls[2][1].date_range.from < first.from).toBe(true)
  })

  it('says so when the trend cannot be loaded, and the rest of the dashboard still shows', async () => {
    // Lazily, so each call gets its own rejected promise that the hook is already waiting on.
    runReport.mockImplementation(() => Promise.reject(new Error('The report took too long. Please try again.')))
    renderDashboard(dashboard())

    expect((await screen.findByRole('alert')).textContent).toBe('The report took too long. Please try again.')
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeTruthy()
  })

  it('says so, instead of drawing empty charts, when nothing needs doing', async () => {
    runReport.mockResolvedValue(report([{ label: '2026-03', s0: 0, other: 0 }]))
    renderDashboard(dashboard({
      work: { open: 0, waitingOnUs: 0, waitingOnClients: 0, overdue: 0 },
      documents: { awaitingSignature: 0, oldestWaitingDays: 0, completeClients: 12, missingForOnboarding: 0, consentsExpired: 0, consentsExpiringSoon: 0, consentWarningDays: 30 },
      onboarding: { total: 0, stalled: 0, stalledAfterDays: 14, clients: [] },
      reminders: { overdue: 0, dueSoon: 0, dueSoonDays: 7 },
      clients: { total: 0, byStatus: { onboarding: 0, active: 0, inactive: 0 }, newInWindow: 0, newWindowDays: 30, politicallyExposed: 0, noFinancialAnalysis: 0, riskMix: { not_assessed: 0 } },
    }))

    expect(screen.getByText('Nothing needs attention right now.')).toBeTruthy()
    expect(screen.getByText('No clients yet.')).toBeTruthy()
    expect(await screen.findByText('No claims or requests were logged in this period.')).toBeTruthy()
  })
})
