import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ClientPulse from '../../src/pages/advisor/ClientPulse'
import ClientPulseDetail from '../../src/pages/advisor/ClientPulseDetail'
import * as api from '../../src/api/dashboard'

vi.mock('../../src/api/dashboard', () => ({
  getDashboard: vi.fn(),
  getAtRiskClients: vi.fn(),
  getClientPulse: vi.fn(),
  sendCheckIn: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const CLIENT_ID = '00000000-0000-4000-8000-000000000001'
const SCALE = { mediumAbove: 2, highAbove: 5 }

const ranking = (clients, extra = {}) => ({
  generatedAt: '2026-09-19T10:00:00.000Z', flaggedTotal: clients.length, limit: 5, scale: SCALE, clients, ...extra,
})
const thabo = {
  id: CLIENT_ID, name: 'Thabo Mokoena', status: 'onboarding', score: 14, level: 'high',
  reasons: ['Still in onboarding after 20 days', 'Broker Appointment unsigned for 10 days'],
}
const ayesha = { id: '00000000-0000-4000-8000-000000000002', name: 'Ayesha Patel', status: 'active', score: 3, level: 'medium', reasons: ['Client Consent unsigned for 8 days'] }

const pulse = {
  generatedAt: '2026-09-19T10:00:00.000Z',
  client: { id: CLIENT_ID, name: 'Thabo Mokoena', status: 'onboarding' },
  score: 14, level: 'high', scale: SCALE, reasons: [],
  signals: [
    { kind: 'onboarding', reason: 'Still in onboarding after 20 days', weight: 4, since: '2026-08-30T10:00:00.000Z', days: 20, signed: 1, awaitingClient: 1, notSent: 3 },
    { kind: 'document', reason: 'Broker Appointment unsigned for 10 days', weight: 3, since: '2026-09-09T10:00:00.000Z', days: 10, documentType: 'broker_appointment', label: 'Broker Appointment' },
    { kind: 'task', reason: 'Request open 9 days with no update', weight: 3, since: '2026-09-10T10:00:00.000Z', days: 9, taskId: 't-1', reference: 'RSF-12', title: 'Change of address', typeLabel: 'Change of address', status: 'open', waitingOn: 'us' },
    { kind: 'reminder', reason: '2 overdue reminders', weight: 2, since: '2026-09-16T00:00:00.000Z', days: 3, reminders: [{ id: 'r1', title: 'Annual review', triggerDate: '2026-09-16', daysOverdue: 3 }, { id: 'r2', title: 'Valuation', triggerDate: '2026-09-18', daysOverdue: 1 }] },
    { kind: 'goal', reason: 'Emergency fund goal has no progress', weight: 2, since: null, days: null, goalId: 'g-1', goalName: 'Emergency fund', targetAmount: 50000, currentProgress: 0, targetDate: '2027-01-01' },
  ],
}

function renderList() {
  return render(<MemoryRouter initialEntries={['/client-pulse']}>
    <Routes>
      <Route path="/client-pulse" element={<ClientPulse />} />
      <Route path="/client-pulse/:clientId" element={<p>drill-down opened</p>} />
    </Routes>
  </MemoryRouter>)
}
function renderDetail() {
  return render(<MemoryRouter initialEntries={[`/client-pulse/${CLIENT_ID}`]}>
    <Routes>
      <Route path="/client-pulse" element={<p>ranking page</p>} />
      <Route path="/client-pulse/:clientId" element={<ClientPulseDetail />} />
    </Routes>
  </MemoryRouter>)
}

describe('Client Pulse list', () => {
  it('ranks clients with a risk badge and their heaviest reason, noting how many more there are', async () => {
    api.getAtRiskClients.mockResolvedValue(ranking([thabo, ayesha]))
    renderList()

    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Thabo Mokoena')).toBeTruthy()
    expect(within(rows[0]).getByText('High').className).toContain('status-flagged')
    expect(within(rows[0]).getByText('Score 14')).toBeTruthy()
    expect(within(rows[0]).getByText('Still in onboarding after 20 days')).toBeTruthy()
    // Only the heaviest reason is listed; the rest are on the client's own page.
    expect(within(rows[0]).queryByText('Broker Appointment unsigned for 10 days')).toBeNull()
    expect(within(rows[0]).getByText('+1 more')).toBeTruthy()
    expect(within(rows[1]).getByText('Medium').className).toContain('status-sent')
    expect(within(rows[1]).getByText('Client Consent unsigned for 8 days')).toBeTruthy()
    expect(within(rows[1]).queryByText(/more$/)).toBeNull()
    expect(screen.getByText('High risk is a score above 5; medium is above 2.')).toBeTruthy()
  })

  it('opens the drill-down when a row is clicked', async () => {
    api.getAtRiskClients.mockResolvedValue(ranking([thabo]))
    renderList()
    fireEvent.click((await screen.findAllByRole('row'))[1])
    expect(await screen.findByText('drill-down opened')).toBeTruthy()
  })

  it('says how many more clients there are when the ranking is cut off', async () => {
    api.getAtRiskClients.mockResolvedValue(ranking([thabo, ayesha], { flaggedTotal: 9 }))
    renderList()
    expect(await screen.findByText('Showing the 2 highest-risk of 9 clients that need attention.')).toBeTruthy()
  })

  it('shows a friendly empty state when nobody is at risk', async () => {
    api.getAtRiskClients.mockResolvedValue(ranking([]))
    renderList()
    expect((await screen.findByText(/No clients need attention right now/)).className).toBe('empty')
  })

  it('shows the first of two identical reasons and counts the other, with no console errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const twice = { ...thabo, reasons: ['Request open 9 days with no update', 'Request open 9 days with no update'] }
    api.getAtRiskClients.mockResolvedValue(ranking([twice]))
    renderList()
    expect(await screen.findAllByText('Request open 9 days with no update')).toHaveLength(1)
    expect(screen.getByText('+1 more')).toBeTruthy()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('shows the error with a retry when the first load fails', async () => {
    api.getAtRiskClients.mockRejectedValueOnce(new Error('Couldn\'t reach the server. Check your connection and try again.'))
    api.getAtRiskClients.mockResolvedValue(ranking([thabo]))
    renderList()
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't reach the server")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Thabo Mokoena')).toBeTruthy()
  })
})

describe('Client Pulse drill-down', () => {
  it('lists every signal with the data behind it, oldest first', async () => {
    api.getClientPulse.mockResolvedValue(pulse)
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Thabo Mokoena' })).toBeTruthy()
    expect(screen.getByText('High risk · score 14')).toBeTruthy()
    const order = ['Still in onboarding after 20 days', 'Broker Appointment unsigned for 10 days', 'Request open 9 days with no update', '2 overdue reminders', 'Emergency fund goal has no progress']
    const positions = order.map(text => document.body.textContent.indexOf(text))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))

    expect(screen.getByText('1 of 5 documents signed')).toBeTruthy()
    expect(screen.getByText('Sent to the client on 9 Sep 2026')).toBeTruthy()
    expect(screen.getByText('RSF-12 · Change of address')).toBeTruthy()
    expect(screen.getByText('Last updated 10 Sep 2026 · Waiting on us')).toBeTruthy()
    expect(screen.getByText('Annual review · due 16 Sep 2026 · 3 days overdue')).toBeTruthy()
    expect(screen.getByText('Valuation · due 18 Sep 2026 · 1 day overdue')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Emergency fund progress' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open request' }).getAttribute('href')).toBe('/tasks/t-1')
    expect(api.getClientPulse).toHaveBeenCalledWith(CLIENT_ID)
  })

  it('says so when a client has nothing flagged', async () => {
    api.getClientPulse.mockResolvedValue({ ...pulse, score: 0, level: 'low', signals: [] })
    renderDetail()
    expect(await screen.findByText('Nothing is flagged for this client right now.')).toBeTruthy()
    expect(screen.getByText('Not at risk · score 0')).toBeTruthy()
  })

  it('sends the check-in and confirms it clearly, showing what the client will see', async () => {
    api.getClientPulse.mockResolvedValue(pulse)
    let finish
    api.sendCheckIn.mockReturnValue(new Promise(resolve => { finish = resolve }))
    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: /Send a check-in/ }))
    const pending = screen.getByRole('button', { name: /Sending/ })
    expect(pending.disabled).toBe(true)
    expect(api.sendCheckIn).toHaveBeenCalledExactlyOnceWith(CLIENT_ID)

    fireEvent.click(pending) // a double click can't send a second one
    expect(api.sendCheckIn).toHaveBeenCalledTimes(1)

    finish({ clientId: CLIENT_ID, clientName: 'Thabo Mokoena', title: 'Your adviser is checking in', body: 'Your adviser wanted to check in: your onboarding isn\'t finished yet. Get in touch if you need a hand.', sentAt: '2026-09-19T10:00:00.000Z' })
    const confirmation = await screen.findByText(/Check-in sent to Thabo Mokoena\./)
    expect(confirmation.closest('[role="status"]').textContent).toContain("your onboarding isn't finished yet")
    expect(screen.getByRole('button', { name: /Send a check-in/ }).disabled).toBe(false)
    await waitFor(() => expect(api.getClientPulse).toHaveBeenCalledTimes(2)) // refreshed after the action
  })

  it('shows the real error, and no confirmation, when the check-in fails', async () => {
    api.getClientPulse.mockResolvedValue(pulse)
    api.sendCheckIn.mockRejectedValue(new Error("The check-in couldn't be sent. Please try again in a moment."))
    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: /Send a check-in/ }))
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't be sent")
    expect(screen.queryByText(/Check-in sent to/)).toBeNull()
    expect(screen.getByRole('button', { name: /Send a check-in/ }).disabled).toBe(false)
  })

  it('shows an error with a way back when the client cannot be loaded', async () => {
    api.getClientPulse.mockRejectedValue(new Error('Client not found'))
    renderDetail()
    expect((await screen.findByRole('alert')).textContent).toContain('Client not found')
    fireEvent.click(screen.getByRole('link', { name: /All at-risk clients/ }))
    expect(await screen.findByText('ranking page')).toBeTruthy()
  })
})
