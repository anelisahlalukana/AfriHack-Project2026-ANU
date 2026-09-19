// The 5 compliance document types tracked per client, matching the actual
// templates Royal Square Financial supplied (see docs/ and the CEO's
// onboarding brief). `type` is the documents.document_type value;
// `templateFile` is the object name expected inside the
// document-templates Storage bucket.
const DOCUMENT_TYPES = [
  {
    type: "confidentiality_agreement",
    label: "Confidentiality Agreement",
    templateFile: "confidentiality_agreement.pdf",
  },
  {
    type: "broker_appointment",
    label: "Broker Appointment",
    templateFile: "broker_appointment.pdf",
  },
  {
    type: "client_consent",
    label: "Client Consent",
    templateFile: "client_consent.pdf",
  },
  {
    type: "service_agreement",
    label: "Service Agreement",
    templateFile: "service_agreement.pdf",
  },
  {
    type: "fais_disclosure",
    label: "FAIS Disclosure",
    templateFile: "fais_disclosure.pdf",
  },
];

const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES.map((d) => d.type);

const DOCUMENT_STATUSES = ["not_sent", "sent", "signed", "filed"];

// Sent to a client automatically when they finish registering. The other three
// types are sent later by an adviser.
const REGISTRATION_DOCUMENT_TYPES = ["fais_disclosure", "confidentiality_agreement"];

// Acknowledged with a typed name instead of a drawn signature. Still ends up as
// status 'signed'; the signature image is simply optional for these types.
const ACKNOWLEDGE_ONLY_TYPES = ["fais_disclosure"];

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  DOCUMENT_STATUSES,
  REGISTRATION_DOCUMENT_TYPES,
  ACKNOWLEDGE_ONLY_TYPES,
};