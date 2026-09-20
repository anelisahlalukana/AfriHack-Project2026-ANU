import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SignaturePad } from '../../src/components/documents/SignaturePad'
import { signDocument } from '../../src/api/documents'
import { trimmedSignatureDataUrl } from '../../src/lib/signature'

const pad = vi.hoisted(() => ({ empty: false, canvas: { id: 'the-pad-canvas' } }))

// The real library's getTrimmedCanvas() throws this once the app is bundled (it calls trim-canvas
// through a default import that isn't a function). The fake throws the same, so a component that
// goes back to using it fails here.
vi.mock('react-signature-canvas', async () => {
  const { forwardRef, useImperativeHandle } = await import('react')
  return {
    default: forwardRef((_props, ref) => {
      useImperativeHandle(ref, () => ({
        isEmpty: () => pad.empty,
        clear: () => {},
        getCanvas: () => pad.canvas,
        getTrimmedCanvas: () => { throw new TypeError('(0 , import_build.default) is not a function') },
      }))
      return <canvas />
    }),
  }
})
vi.mock('../../src/lib/signature', () => ({ trimmedSignatureDataUrl: vi.fn() }))
vi.mock('../../src/api/documents', () => ({ signDocument: vi.fn() }))

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  pad.empty = false
  trimmedSignatureDataUrl.mockReturnValue('data:image/png;base64,CROPPED')
})

function open(props = {}) {
  render(<SignaturePad clientId="client-1" documentType="client_consent" onCancel={vi.fn()} onSigned={vi.fn()} {...props} />)
}
const type = name => fireEvent.change(screen.getByPlaceholderText('Full name'), { target: { value: name } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit signature' }))

describe('Signature pad', () => {
  it('saves the signature cropped to its ink, without the library trimming that breaks in the bundle', async () => {
    signDocument.mockResolvedValue({})
    const onSigned = vi.fn()
    open({ onSigned })
    type('  Thabo Radebe ')
    submit()

    await waitFor(() => expect(signDocument).toHaveBeenCalledTimes(1))
    expect(trimmedSignatureDataUrl).toHaveBeenCalledWith(pad.canvas)
    expect(signDocument).toHaveBeenCalledWith('client-1', 'client_consent', { signature: 'data:image/png;base64,CROPPED', signerName: 'Thabo Radebe' })
    expect((await screen.findByRole('status')).textContent).toBe('Signed successfully.')
    await waitFor(() => expect(onSigned).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('asks for a name before saving', () => {
    open()
    submit()
    expect(screen.getByRole('alert').textContent).toBe('Signer name is required')
    expect(signDocument).not.toHaveBeenCalled()
  })

  it('asks for a drawn signature before saving', () => {
    pad.empty = true
    open()
    type('Thabo Radebe')
    submit()
    expect(screen.getByRole('alert').textContent).toBe('Please draw a signature before submitting')
    expect(signDocument).not.toHaveBeenCalled()
  })

  it('shows the server error and lets the person try again', async () => {
    signDocument.mockRejectedValueOnce(new Error('The document is already signed'))
    open()
    type('Thabo Radebe')
    submit()

    expect((await screen.findByRole('alert')).textContent).toBe('The document is already signed')
    expect(screen.getByRole('button', { name: 'Submit signature' }).disabled).toBe(false)
  })
})
