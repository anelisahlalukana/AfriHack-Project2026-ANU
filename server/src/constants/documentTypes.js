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

module.exports = { DOCUMENT_TYPES, DOCUMENT_TYPE_VALUES, DOCUMENT_STATUSES };