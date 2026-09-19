Based on the brief, the transcript, and Vusi's Q&A follow-up — note there are really only two logged-in user types (the brief's "insurance provider" is a mock integration endpoint, not a user; Royal Square explicitly said they run with a maximum of one to two advisers, so this isn't a multi-broker marketplace).

**Client**
- Dashboard: real-time net worth (assets − liabilities), financial position in one place
- Goals: view individual and shared goals with visual progress
- Onboarding: fill in personal info, dependents/next-of-kin, static details (currently a 1-hour face-to-face session to digitize)
- Documents: view/sign Confidentiality Agreement, Broker Appointment, Client Consent, Service Agreement; receive FAIS Disclosure
- Report an Accident or Loss: guided scene checklist (photos, witness details, voice note, 48-hour police reminder)
- Register a Motor Claim: submit incident details, third-party info, upload photos/licence/sketch
- Track claim progress through the 10-step lifecycle, get notified at each stage
- Submit other requests: change of address, change of bank details, change debit order date, add/change beneficiary, request a policy document, request a border letter, request an IRP5, request a consultation, submit balance sheet/income statement
- Receive reminders: driving licence expiry, insurance valuation certificate (shared with adviser), birthdays/anniversaries
- App push notifications (confirmed as the preferred channel over WhatsApp/email — unique sound, floats over lock screen, doesn't get buried)
- Leave a review/close out a completed claim

**Adviser (Royal Square staff — company itself, not a broker marketplace)**
- Client dashboard across their book of clients
- Load and manage goals for a client (individual or shared)
- Manage the reminder rules engine: seed and add new reminder types (insurance valuation certificate, annual review meeting, retirement fee renewal, birthdays — list is expected to keep growing)
- Track and action every open query/task, see its stage, close it out
- Manage the motor claim lifecycle: see claim number/handler, assessment, repair quotes, authorise repairs, arrange car hire and delivery, see weekly repair updates, arrange hire car collection/return
- Document tracker: see status of every client's Confidentiality Agreement, Broker Appointment, Client Consent (with expiry), Service Agreement, FAIS Disclosure acknowledgement
- Compliance/regulatory tracking: adviser qualification and CPD status, politically-exposed-person checks, terrorism-financing checks, record-keeping for audit
- Communicate with any client (not siloed to "their own" clients only, per the transcript)
- Secure, POPIA-compliant storage for ID documents, banking details, photos, voice notes — encrypted and backed up

**Provider / integration layer (mocked insurers, with a provider portal login)**
- Receives claims, returns claim number and handler (simulated; Royal Square confirmed no real sandbox APIs will be given — mock everything against a fake company)
- Provider portal (`/provider`): each insurer's login sees only the claims and requests sent to it, completes its own steps, posts progress updates, declines with a reason, reassigns the claims handler, uploads documents and messages Royal Square
- Receives document/data pass-through (API, direct integration, or file transfer) — the brief's stated "more automatic pass-through, more useful" principle
- Client Consent-driven data pull (aggregator/bank/pension/insurer) feeding the net-worth dashboard

Want me to fold this into the project doc, or leave it as a standalone answer here?