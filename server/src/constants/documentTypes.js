// The 5 compliance document types tracked per client.
// `type` is the documents.document_type value; `templateFile` is the object
// name expected inside the document-templates Storage bucket.
const DOCUMENT_TYPES = [
  { type: "fica", label: "FICA / KYC Verification", templateFile: "fica.pdf" },
  { type: "client_consent", label: "Client Consent", templateFile: "client_consent.pdf" },
  {
    type: "risk_profile_declaration",
    label: "Risk Profile Declaration",
    templateFile: "risk_profile_declaration.pdf",
  },
  {
    type: "fee_disclosure",
    label: "Fee Disclosure & Mandate",
    templateFile: "fee_disclosure.pdf",
  },
  { type: "record_of_advice", label: "Record of Advice", templateFile: "record_of_advice.pdf" },
];

const DOCUMENT_TYPE_VALUES = DOCUMENT_TYPES.map((d) => d.type);

const DOCUMENT_STATUSES = ["not_sent", "sent", "signed", "filed"];

module.exports = { DOCUMENT_TYPES, DOCUMENT_TYPE_VALUES, DOCUMENT_STATUSES };
