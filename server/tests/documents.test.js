const test = require("node:test");
const assert = require("node:assert/strict");

// --- Fake Supabase: an in-memory `documents` / `users` store with just the query shapes the service uses.
const state = { documents: [], users: [], uploads: [] };

function from(table) {
  let op = "select";
  let patch = null;
  const filters = [];
  const matches = (row) =>
    filters.every(([col, val, isIn]) => (isIn ? val.includes(row[col]) : row[col] === val));
  const exec = () => {
    const rows = state[table];
    if (op === "insert") {
      const row = { id: `${table}-${rows.length + 1}`, ...patch };
      rows.push(row);
      return [row];
    }
    const hit = rows.filter(matches);
    if (op === "update") hit.forEach((row) => Object.assign(row, patch));
    return hit;
  };
  const builder = {
    select: () => builder,
    eq: (col, val) => (filters.push([col, val]), builder),
    in: (col, val) => (filters.push([col, val, true]), builder),
    update: (p) => ((op = "update"), (patch = p), builder),
    insert: (p) => ((op = "insert"), (patch = p), builder),
    maybeSingle: async () => ({ data: exec()[0] || null, error: null }),
    single: async () => ({ data: exec()[0] || null, error: null }),
    then: (resolve, reject) => Promise.resolve({ data: exec(), error: null }).then(resolve, reject),
  };
  return builder;
}

const storage = {
  from: () => ({
    upload: async (path, bytes) => (state.uploads.push({ path, bytes }), { error: null }),
    download: async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(4) }, error: null }),
  }),
};

function stubModule(relativePath, exports) {
  const file = require.resolve(relativePath);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stubModule("../src/config/supabaseClient", { supabaseAdmin: { from, storage } });
stubModule("../src/utils/pdfFiller", {
  fillTemplate: async () => Buffer.from("%PDF-filled"),
  embedSignature: async () => Buffer.from("%PDF-embedded"),
});

const service = require("../src/services/documents.service");
const { validateSignedUpload } = require("../src/middleware/validate");
const { DOCUMENT_TYPE_VALUES } = require("../src/constants/documentTypes");

const CLIENT = "client-1";

function reset({ status = "onboarding", signed = [] } = {}) {
  state.uploads = [];
  state.users = [{ id: CLIENT, status }];
  state.documents = signed.map((type, i) => ({
    id: `documents-${i + 1}`,
    client_id: CLIENT,
    document_type: type,
    status: "signed",
  }));
}

const firstFour = DOCUMENT_TYPE_VALUES.slice(0, 4);
const fifth = DOCUMENT_TYPE_VALUES[4]; // fais_disclosure

test("uploading a signed PDF stores it as-is and marks the document signed", async () => {
  reset();
  const bytes = Buffer.from("%PDF-signed-by-hand");
  const doc = await service.uploadSignedDocument(CLIENT, "broker_appointment", bytes);

  assert.equal(doc.status, "signed");
  assert.equal(doc.signedFileUrl, `${CLIENT}/broker_appointment/signed.pdf`);
  assert.ok(doc.signedAt);
  assert.equal(state.uploads[0].bytes, bytes);
  assert.equal(state.users[0].status, "onboarding");
});

test("signing the 5th document moves an onboarding client to active", async () => {
  reset({ signed: firstFour });
  await service.uploadSignedDocument(CLIENT, fifth, Buffer.from("%PDF-x"));
  assert.equal(state.users[0].status, "active");
});

test("the acknowledge path (typed name, no signature image) also completes onboarding", async () => {
  reset({ signed: firstFour });
  state.documents.push({ id: "documents-9", client_id: CLIENT, document_type: "fais_disclosure", status: "sent", filled_file_url: "f.pdf" });
  const doc = await service.signDocument(CLIENT, "fais_disclosure", { signerName: "Test Client" });
  assert.equal(doc.status, "signed");
  assert.equal(state.users[0].status, "active");
});

test("the in-app signature path also completes onboarding", async () => {
  reset({ signed: firstFour });
  state.documents.push({ id: "documents-9", client_id: CLIENT, document_type: fifth, status: "sent", filled_file_url: "f.pdf" });
  await service.signDocument(CLIENT, fifth, { signature: "data:image/png;base64,AAAA", signerName: "Test Client" });
  assert.equal(state.users[0].status, "active");
});

test("four signed documents is not enough", async () => {
  reset({ signed: firstFour.slice(0, 3) });
  await service.uploadSignedDocument(CLIENT, firstFour[3], Buffer.from("%PDF-x"));
  assert.equal(state.users[0].status, "onboarding");
});

test("an already active or inactive client is never changed", async () => {
  for (const status of ["active", "inactive"]) {
    reset({ status, signed: firstFour });
    await service.uploadSignedDocument(CLIENT, fifth, Buffer.from("%PDF-x"));
    assert.equal(state.users[0].status, status);
  }
});

test("re-signing when everything is already signed is harmless", async () => {
  reset({ status: "active", signed: DOCUMENT_TYPE_VALUES });
  const doc = await service.uploadSignedDocument(CLIENT, "client_consent", Buffer.from("%PDF-x"));
  assert.equal(doc.status, "signed");
  assert.equal(state.users[0].status, "active");
});

// --- validateSignedUpload
function run(type, file) {
  const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let called = false;
  validateSignedUpload({ params: { type }, file }, res, () => { called = true; });
  return { res, called };
}

test("validateSignedUpload accepts a real PDF", () => {
  assert.equal(run("broker_appointment", { buffer: Buffer.from("%PDF-1.7 ...") }).called, true);
});

test("validateSignedUpload rejects a missing file, a non-PDF body, and the acknowledge-only type", () => {
  assert.equal(run("broker_appointment", undefined).res.statusCode, 400);
  assert.equal(run("broker_appointment", { buffer: Buffer.from("MZ not a pdf") }).res.statusCode, 400);
  assert.equal(run("fais_disclosure", { buffer: Buffer.from("%PDF-1.7") }).res.statusCode, 400);
});
