const { supabaseAdmin } = require("../config/supabaseClient");
const { fillTemplate, embedSignature } = require("../utils/pdfFiller");
const { DOCUMENT_TYPES } = require("../constants/documentTypes");

const TEMPLATES_BUCKET = process.env.DOCUMENT_TEMPLATES_BUCKET || "document-templates";
const DOCUMENTS_BUCKET = process.env.CLIENT_DOCUMENTS_BUCKET || "client-documents";
const CONSENT_VALIDITY_MONTHS = 12;
const SIGNED_URL_TTL_SECONDS = 60 * 10;

function docMeta(type) {
  return DOCUMENT_TYPES.find((d) => d.type === type);
}

async function getClient(clientId) {
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error) throw new Error(`Client not found: ${error.message}`);
  return data;
}

async function getDocumentRow(clientId, type) {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("client_id", clientId)
    .eq("document_type", type)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Returns all 5 document types for a client, merging any existing `documents`
// rows with a not_sent default for types that don't have a row yet.
async function listDocuments(clientId) {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("*")
    .eq("client_id", clientId);

  if (error) throw new Error(error.message);

  const byType = new Map((data || []).map((row) => [row.document_type, row]));

  return DOCUMENT_TYPES.map(({ type, label }) => {
    const row = byType.get(type);
    return {
      documentType: type,
      label,
      status: row?.status || "not_sent",
      id: row?.id || null,
      sentAt: row?.sent_at || null,
      signedAt: row?.signed_at || null,
      hasFilledFile: Boolean(row?.filled_file_url),
      hasSignedFile: Boolean(row?.signed_file_url),
    };
  });
}

function clientFillFields(client) {
  return {
    full_name: [client.first_name, client.second_name, client.surname].filter(Boolean).join(" "),
    first_name: client.first_name,
    surname: client.surname,
    id_number: client.id_number,
    date_of_birth: client.date_of_birth,
    nationality: client.nationality,
    marital_status: client.marital_status,
    occupation: client.occupation,
    employer_name: client.employer_name,
    contact_email: client.contact_email,
    contact_mobile: client.contact_mobile,
    physical_address: client.physical_address,
  };
}

async function generateFilledPdf(clientId, type) {
  const meta = docMeta(type);
  const client = await getClient(clientId);

  const { data: templateBytes, error: downloadError } = await supabaseAdmin.storage
    .from(TEMPLATES_BUCKET)
    .download(meta.templateFile);

  if (downloadError) {
    throw new Error(`Could not load template '${meta.templateFile}': ${downloadError.message}`);
  }

  const filledBytes = await fillTemplate(
    Buffer.from(await templateBytes.arrayBuffer()),
    clientFillFields(client)
  );

  const filledPath = `${clientId}/${type}/filled.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filledPath, filledBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  return { filledPath, filledBytes };
}

// Marks a document as sent: generates the filled (unsigned) PDF from the
// template + client data, stores it, and sets status='sent'/sent_at.
async function sendDocument(clientId, type) {
  const { filledPath } = await generateFilledPdf(clientId, type);
  const existing = await getDocumentRow(clientId, type);

  const payload = {
    client_id: clientId,
    document_type: type,
    status: "sent",
    filled_file_url: filledPath,
    sent_at: new Date().toISOString(),
  };

  const { data, error } = existing
    ? await supabaseAdmin.from("documents").update(payload).eq("id", existing.id).select().single()
    : await supabaseAdmin.from("documents").insert(payload).select().single();

  if (error) throw new Error(error.message);
  return data;
}

// Bakes the captured signature into the filled PDF (generating it first if
// the document was never explicitly sent) and stores it as the signed copy.
async function signDocument(clientId, type, { signature, signerName }) {
  let row = await getDocumentRow(clientId, type);
  let filledBytes;

  if (row?.filled_file_url) {
    const { data: existingFile, error: downloadError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .download(row.filled_file_url);
    if (downloadError) throw new Error(downloadError.message);
    filledBytes = Buffer.from(await existingFile.arrayBuffer());
  } else {
    const generated = await generateFilledPdf(clientId, type);
    filledBytes = generated.filledBytes;
  }

  const signedAt = new Date().toISOString();
  const signedBytes = await embedSignature(filledBytes, {
    signatureDataUrl: signature,
    signerName,
    signedAt,
  });

  const signedPath = `${clientId}/${type}/signed.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(signedPath, signedBytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const payload = {
    client_id: clientId,
    document_type: type,
    status: "signed",
    signed_file_url: signedPath,
    signature_data: signature,
    signed_at: signedAt,
  };

  const { data, error } = row
    ? await supabaseAdmin.from("documents").update(payload).eq("id", row.id).select().single()
    : await supabaseAdmin.from("documents").insert(payload).select().single();

  if (error) throw new Error(error.message);
  return data;
}

async function getDownloadUrl(clientId, type) {
  const row = await getDocumentRow(clientId, type);
  const meta = docMeta(type);

  if (row?.signed_file_url) {
    return signStorageUrl(DOCUMENTS_BUCKET, row.signed_file_url);
  }
  if (row?.filled_file_url) {
    return signStorageUrl(DOCUMENTS_BUCKET, row.filled_file_url);
  }
  return signStorageUrl(TEMPLATES_BUCKET, meta.templateFile);
}

async function signStorageUrl(bucket, path) {
  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

async function getConsentStatus(clientId) {
  const row = await getDocumentRow(clientId, "client_consent");

  if (!row || row.status !== "signed" || !row.signed_at) {
    return { signed: false, expired: null, valid: false, signedAt: null, expiresAt: null };
  }

  const signedAt = new Date(row.signed_at);
  const expiresAt = new Date(signedAt);
  expiresAt.setMonth(expiresAt.getMonth() + CONSENT_VALIDITY_MONTHS);

  const expired = Date.now() > expiresAt.getTime();

  return {
    signed: true,
    expired,
    valid: !expired,
    signedAt: row.signed_at,
    expiresAt: expiresAt.toISOString(),
  };
}

module.exports = {
  listDocuments,
  sendDocument,
  signDocument,
  getDownloadUrl,
  getConsentStatus,
};
