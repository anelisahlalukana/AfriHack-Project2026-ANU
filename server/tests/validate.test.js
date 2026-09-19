const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/middleware/validate");

const UUID = "3f2b8a4e-1c5d-4e6f-9a7b-0c1d2e3f4a5b";

// Runs a validator against a fake request and reports whether it called next() or replied.
function run(validator, { body, params = {}, query = {}, file } = {}) {
  const outcome = { nextCalled: false, status: null, body: null };
  const req = { body, params, query, file };
  const res = {
    status(code) {
      outcome.status = code;
      return this;
    },
    json(payload) {
      outcome.body = payload;
      return this;
    },
  };
  validator(req, res, () => {
    outcome.nextCalled = true;
  });
  return { ...outcome, req };
}
const passes = (validator, input) => assert.equal(run(validator, input).nextCalled, true, JSON.stringify(input));
function rejects(validator, input, message) {
  const out = run(validator, input);
  assert.equal(out.nextCalled, false, `should reject ${JSON.stringify(input)}`);
  assert.equal(out.status, 400);
  if (message) assert.match(out.body.error, message);
}

test("every validator the routes import actually exists (a missing one crashes server start-up)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routesDir = path.join(__dirname, "../src/routes");
  for (const file of fs.readdirSync(routesDir)) {
    const source = fs.readFileSync(path.join(routesDir, file), "utf8");
    const match = source.match(/const \{([^}]+)\} = require\("\.\.\/middleware\/validate"\)/);
    if (!match) continue;
    for (const name of match[1].split(",").map((n) => n.trim()).filter(Boolean)) {
      assert.equal(typeof v[name], "function", `${file} imports ${name} from middleware/validate`);
    }
  }
});

test("document type must be one of the five known types", () => {
  passes(v.validateDocumentType, { params: { type: "client_consent" } });
  rejects(v.validateDocumentType, { params: { type: "passport" } }, /Invalid document type/);
});

test("signatures must be png/jpeg data URLs with a signer name; FAIS Disclosure only needs the name", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  passes(v.validateSignaturePayload, { params: { type: "client_consent" }, body: { signature: png, signerName: "Thabo" } });
  rejects(v.validateSignaturePayload, { params: { type: "client_consent" }, body: { signerName: "Thabo" } }, /signature/);
  rejects(v.validateSignaturePayload, { params: { type: "client_consent" }, body: { signature: "data:text/html;base64,PHA+", signerName: "Thabo" } }, /base64 data URL/);
  rejects(v.validateSignaturePayload, { params: { type: "client_consent" }, body: { signature: png, signerName: "   " } }, /signerName/);
  passes(v.validateSignaturePayload, { params: { type: "fais_disclosure" }, body: { signerName: "Thabo" } });
  rejects(v.validateSignaturePayload, { params: { type: "fais_disclosure" }, body: { signature: "", signerName: "" } }, /signerName/);
});

test("uploaded signed copies must really be PDFs, and acknowledge-only documents can't be uploaded", () => {
  const file = (text) => ({ buffer: Buffer.from(text) });
  passes(v.validateSignedUpload, { params: { type: "client_consent" }, file: file("%PDF-1.7 ...") });
  rejects(v.validateSignedUpload, { params: { type: "client_consent" }, file: file("<html>not a pdf</html>") }, /valid PDF/);
  rejects(v.validateSignedUpload, { params: { type: "client_consent" } }, /Attach the signed PDF/);
  rejects(v.validateSignedUpload, { params: { type: "fais_disclosure" }, file: file("%PDF-1.7") }, /acknowledged/);
});

test("new staff accounts need a full email, a name and a known role; providers need a provider id", () => {
  const good = { email: "sam@example.com", fullName: "Sam Dube", role: "advisor" };
  passes(v.validateNewUserPayload, { body: good });
  rejects(v.validateNewUserPayload, { body: { ...good, email: "sam@localhost" } }, /email/);
  rejects(v.validateNewUserPayload, { body: { ...good, fullName: " " } }, /fullName/);
  rejects(v.validateNewUserPayload, { body: { ...good, role: "client" } }, /role/);
  rejects(v.validateNewUserPayload, { body: { ...good, role: "superuser" } }, /role/);
  rejects(v.validateNewUserPayload, { body: { ...good, role: "provider" } }, /provider/i);
  rejects(v.validateNewUserPayload, { body: { ...good, role: "provider", providerId: "nope" } }, /provider/i);
  passes(v.validateNewUserPayload, { body: { ...good, role: "provider", providerId: UUID } });
  rejects(v.validateNewUserPayload, {}, /email/);
});

test("adding a client needs names and a valid contact email", () => {
  const good = { first_name: "Thabo", surname: "Mokoena", contact_email: "thabo@example.com" };
  passes(v.validateNewClientPayload, { body: good });
  passes(v.validateNewClientPayload, { body: { ...good, second_name: null, contact_mobile: "0821234567" } });
  rejects(v.validateNewClientPayload, { body: { ...good, first_name: "" } }, /first_name/);
  rejects(v.validateNewClientPayload, { body: { ...good, surname: undefined } }, /surname/);
  rejects(v.validateNewClientPayload, { body: { ...good, contact_email: "thabo" } }, /contact_email/);
  rejects(v.validateNewClientPayload, { body: { ...good, contact_mobile: 821234567 } }, /contact_mobile/);
});

test("client registration and login enforce a 13-digit ID number and password limits", () => {
  const reg = { email: "thabo@example.com", id_number: "9001015800085", password: "longenough1" };
  passes(v.validateCompleteRegistrationPayload, { body: reg });
  rejects(v.validateCompleteRegistrationPayload, { body: { ...reg, id_number: "90010158000" } }, /13 digits/);
  rejects(v.validateCompleteRegistrationPayload, { body: { ...reg, id_number: "90010158000AB" } }, /13 digits/);
  rejects(v.validateCompleteRegistrationPayload, { body: { ...reg, password: "short" } }, /between 8 and 72/);
  rejects(v.validateCompleteRegistrationPayload, { body: { ...reg, password: "x".repeat(73) } }, /between 8 and 72/);
  rejects(v.validateCompleteRegistrationPayload, { body: { ...reg, email: "nope" } }, /email/);

  passes(v.validateClientLoginPayload, { body: { id_number: "9001015800085", password: "x" } });
  rejects(v.validateClientLoginPayload, { body: { id_number: "123", password: "x" } }, /13 digits/);
  rejects(v.validateClientLoginPayload, { body: { id_number: "9001015800085", password: "" } }, /password/);
  rejects(v.validateClientLoginPayload, {}, /13 digits/);
});

test("id parameters must be UUIDs", () => {
  passes(v.validateUserIdParam, { params: { id: UUID } });
  rejects(v.validateUserIdParam, { params: { id: "1; drop table users" } }, /user id/);

  passes(v.validateTaskIdParam, { params: { taskId: UUID } });
  passes(v.validateTaskIdParam, { params: { taskId: UUID, fileId: UUID } });
  rejects(v.validateTaskIdParam, { params: { taskId: "abc" } }, /claim or request id/);
  rejects(v.validateTaskIdParam, { params: {} }, /claim or request id/);
  rejects(v.validateTaskIdParam, { params: { taskId: UUID, fileId: "abc" } }, /file id/);

  passes(v.validateComplianceIds, { params: { clientId: UUID, adviserId: UUID } });
  passes(v.validateComplianceIds, { params: {} });
  rejects(v.validateComplianceIds, { params: { adviserId: "me" } }, /adviserId/);
});

test("new claims and requests need a type and well-formed optional fields", () => {
  passes(v.validateNewClaimPayload, { body: { category: "death", form: { a: 1 }, clientId: UUID, providerId: UUID, policyNumber: "P-1" } });
  rejects(v.validateNewClaimPayload, { body: { category: "  " } }, /kind of claim/);
  rejects(v.validateNewClaimPayload, { body: { category: "death", clientId: "x" } }, /clientId/);
  rejects(v.validateNewClaimPayload, { body: { category: "death", providerId: "x" } }, /provider/);
  rejects(v.validateNewClaimPayload, { body: { category: "death", form: [] } }, /form/);
  rejects(v.validateNewClaimPayload, { body: { category: "death", policyNumber: 12 } }, /policyNumber/);
  passes(v.validateNewClaimPayload, { body: { category: "death", providerId: "" } });

  passes(v.validateNewRequestPayload, { body: { taskType: "change_of_address" } });
  rejects(v.validateNewRequestPayload, { body: {} }, /help with/);

  passes(v.validateDraftPayload, { body: { checklist: { done: true } } });
  passes(v.validateDraftPayload, { body: {} });
  rejects(v.validateDraftPayload, { body: { checklist: "all" } }, /checklist/);
});

test("task updates limit note length and restrict outcome values", () => {
  passes(v.validateTaskUpdatePayload, { body: { note: "ok", stageKey: "lodged", visibleToClient: true, outcome: "completed" } });
  passes(v.validateTaskUpdatePayload, { body: {} });
  rejects(v.validateTaskUpdatePayload, { body: { note: "x".repeat(2001) } }, /2000/);
  rejects(v.validateTaskUpdatePayload, { body: { visibleToClient: "yes" } }, /visibleToClient/);
  rejects(v.validateTaskUpdatePayload, { body: { outcome: "paid" } }, /outcome/);
  rejects(v.validateTaskUpdatePayload, { body: { stageKey: 5 } }, /stageKey/);
});

test("client actions validate the date and the 1-5 rating", () => {
  passes(v.validateClientActionPayload, { body: { date: "2026-09-19", rating: 5, review: "great" } });
  rejects(v.validateClientActionPayload, { body: { date: "19/09/2026" } }, /date/);
  rejects(v.validateClientActionPayload, { body: { rating: 0 } }, /1 to 5/);
  rejects(v.validateClientActionPayload, { body: { rating: 6 } }, /1 to 5/);
  rejects(v.validateClientActionPayload, { body: { rating: 2.5 } }, /1 to 5/);
  rejects(v.validateClientActionPayload, { body: { review: "x".repeat(2001) } }, /2000/);
});

test("provider messages need text; a handler change needs a name of at most 120 characters", () => {
  passes(v.validateProviderMessagePayload, { body: { note: "We have your documents." } });
  rejects(v.validateProviderMessagePayload, { body: { note: "   " } }, /message/);
  rejects(v.validateProviderMessagePayload, { body: {} }, /message/);
  rejects(v.validateProviderMessagePayload, { body: { note: "x".repeat(2001) } }, /2000/);

  passes(v.validateHandlerPayload, { body: { name: "Lerato" } });
  rejects(v.validateHandlerPayload, { body: { name: " " } }, /handler/);
  rejects(v.validateHandlerPayload, { body: { name: "x".repeat(121) } }, /120/);
});

test("compliance updates accept only known fields with the right types", () => {
  passes(v.validateComplianceUpdate, { body: { qualificationStatus: "qualified", isPoliticallyExposed: false } });
  rejects(v.validateComplianceUpdate, { body: {} }, /supported compliance fields/);
  rejects(v.validateComplianceUpdate, { body: { cpdStatus: "up_to_date" } }, /supported compliance fields/);
  rejects(v.validateComplianceUpdate, { body: { qualificationStatus: "bogus" } }, /qualificationStatus/);
  rejects(v.validateComplianceUpdate, { body: { isPoliticallyExposed: "no" } }, /boolean/);
  rejects(v.validateComplianceUpdate, { body: { pepDetails: "x".repeat(2001) } }, /2000/);
});

test("audit limit is a positive integer, defaulted and capped", () => {
  passes(v.validateAuditLimit, { query: {} });
  assert.ok(run(v.validateAuditLimit, { query: {} }).req.auditLimit > 0);
  for (const bad of ["0", "-1", "abc", "1.5", "1e3", ""]) rejects(v.validateAuditLimit, { query: { limit: bad } });
  const capped = run(v.validateAuditLimit, { query: { limit: "999999" } }).req.auditLimit;
  assert.ok(capped < 999999, "limit is capped");
});

test("screenings reject unknown fields and simulated flags in production", () => {
  passes(v.validateScreening, { body: { screeningType: "pep" } });
  rejects(v.validateScreening, { body: { screeningType: "credit" } }, /PEP or terrorism/);
  rejects(v.validateScreening, { body: { screeningType: "pep", extra: 1 } }, /PEP or terrorism/);
  rejects(v.validateScreening, { body: { screeningType: "pep", simulateFlag: "true" } }, /simulateFlag/);
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    rejects(v.validateScreening, { body: { screeningType: "pep", simulateFlag: true } }, /disabled in production/);
  } finally {
    if (env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = env;
  }
});

test("CPD records validate activity, hours and the completion date", () => {
  const good = { activity: "  Ethics course ", hours: 1.5, completedOn: "2026-01-15" };
  const out = run(v.validateCpdRecord, { body: { ...good } });
  assert.equal(out.nextCalled, true);
  assert.equal(out.req.body.activity, "Ethics course", "activity is trimmed");

  for (const bad of [
    { activity: "", hours: 1, completedOn: "2026-01-15" },
    { activity: "x".repeat(201), hours: 1, completedOn: "2026-01-15" },
    { activity: "A", hours: 0, completedOn: "2026-01-15" },
    { activity: "A", hours: 101, completedOn: "2026-01-15" },
    { activity: "A", hours: 1.234, completedOn: "2026-01-15" },
    { activity: "A", hours: "2", completedOn: "2026-01-15" },
    { activity: "A", hours: 1, completedOn: "2026-02-30" },
    { activity: "A", hours: 1, completedOn: "15-01-2026" },
    { activity: "A", hours: 1, completedOn: "2999-01-01" },
    { activity: "A", hours: 1, completedOn: "2026-01-15", actorName: "forged" },
  ]) {
    rejects(v.validateCpdRecord, { body: bad });
  }
});
