import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DocumentStatusList } from '../../src/components/documents/DocumentStatusList'
import { listDocuments } from '../../src/api/documents'
import { useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/api/documents', () => ({ listDocuments: vi.fn(), getDownloadUrl: vi.fn(), sendDocument: vi.fn() }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: vi.fn() }))
// The real card loads a PDF and a signature pad. All that matters here is what happens when it reports "signed".
vi.mock('../../src/components/documents/DocumentCard', () => ({
  DocumentCard: ({ label, onSigned }) => <div role="dialog" aria-label={label}><button onClick={onSigned}>Finish signing</button></div>,
}))

afterEach(cleanup)
beforeEach(() => vi.resetAllMocks())

const CLIENT = { id: 'auth-1', app_metadata: {} }
const ADVISER = { id: 'auth-2', app_metadata: { role: 'advisor' } }
const doc = (documentType, label, status, extra = {}) => ({ documentType, label, status, id: `${documentType}-1`, sentAt: null, signedAt: null, ...extra })

const DOCS = [
  doc('confidentiality_agreement', 'Confidentiality Agreement', 'signed', { signedAt: '2026-09-10T08:00:00Z' }),
  doc('broker_appointment', 'Broker Appointment', 'sent', { sentAt: '2026-09-15T08:00:00Z' }),
  doc('client_consent', 'Client Consent', 'filed', { signedAt: '2026-09-01T08:00:00Z' }),
  doc('service_agreement', 'Service Agreement', 'not_sent'),
  doc('fais_disclosure', 'FAIS Disclosure', 'signed', { signedAt: '2026-09-11T08:00:00Z' }),
]

const rowOf = label => screen.getByText(label).closest('.doc-row')
const buttonNames = row => within(row).queryAllByRole('button').map(button => button.textContent)

function renderList(user, props = {}) {
  useAuth.mockReturnValue({ user })
  return render(<DocumentStatusList clientId="client-1" {...props} />)
}

describe('Document list for a client', () => {
  it('shows Sign only on a document that is waiting to be signed', async () => {
    listDocuments.mockResolvedValue(DOCS)
    renderList(CLIENT)
    await screen.findByText('Broker Appointment')

    expect(buttonNames(rowOf('Broker Appointment'))).toEqual(['View', 'Sign'])
    expect(buttonNames(rowOf('Confidentiality Agreement'))).toEqual(['View'])
    expect(buttonNames(rowOf('Client Consent'))).toEqual(['View'])
    expect(buttonNames(rowOf('Service Agreement'))).toEqual(['View'])
  })

  it('leaves no Acknowledge button once the FAIS disclosure has been acknowledged', async () => {
    listDocuments.mockResolvedValue(DOCS)
    renderList(CLIENT)
    await screen.findByText('FAIS Disclosure')

    expect(buttonNames(rowOf('FAIS Disclosure'))).toEqual(['View'])
    expect(within(rowOf('FAIS Disclosure')).getByText('Acknowledged', { selector: '.badge' })).toBeTruthy()
  })

  it('offers Acknowledge, not Sign, on a FAIS disclosure that is waiting', async () => {
    listDocuments.mockResolvedValue([doc('fais_disclosure', 'FAIS Disclosure', 'sent')])
    renderList(CLIENT)
    await screen.findByText('FAIS Disclosure')

    expect(buttonNames(rowOf('FAIS Disclosure'))).toEqual(['View', 'Acknowledge'])
  })

  it('removes the Sign button as soon as the document has been signed', async () => {
    listDocuments.mockResolvedValueOnce([doc('broker_appointment', 'Broker Appointment', 'sent')])
    const onChanged = vi.fn()
    renderList(CLIENT, { onChanged })
    fireEvent.click(await screen.findByRole('button', { name: 'Sign' }))

    // Signing succeeds; the list reloads and the document now comes back signed.
    listDocuments.mockResolvedValue([doc('broker_appointment', 'Broker Appointment', 'signed', { signedAt: '2026-09-20T08:00:00Z' })])
    fireEvent.click(screen.getByRole('button', { name: 'Finish signing' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sign' })).toBeNull())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(rowOf('Broker Appointment')).getByText('Signed', { selector: '.badge' })).toBeTruthy()
    expect(buttonNames(rowOf('Broker Appointment'))).toEqual(['View'])
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows no Sign button at all when everything has been signed', async () => {
    listDocuments.mockResolvedValue(DOCS.map(item => ({ ...item, status: 'signed' })))
    renderList(CLIENT, { onlySent: true })
    await screen.findByText('Broker Appointment')

    expect(screen.queryByRole('button', { name: /^(Sign|Acknowledge)$/ })).toBeNull()
  })
})

describe('Document list for an adviser', () => {
  it('never offers Sign; only Send on documents that have not been sent', async () => {
    listDocuments.mockResolvedValue(DOCS)
    renderList(ADVISER)
    await screen.findByText('Broker Appointment')

    expect(screen.queryByRole('button', { name: /^(Sign|Acknowledge)$/ })).toBeNull()
    expect(buttonNames(rowOf('Service Agreement'))).toEqual(['View', 'Send to client'])
    expect(buttonNames(rowOf('Broker Appointment'))).toEqual(['View'])
  })
})
