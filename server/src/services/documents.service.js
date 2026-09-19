const { supabaseAdmin } = require("../config/supabaseClient");
const { fillTemplate, embedSignature } = require("../utils/pdfFiller");
const {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_VALUES,
  ACKNOWLEDGE_ONLY_TYPES,
  CONSENT_VALIDITY_MONTHS,
} = require("../constants/documentTypes");
const { ONBOARDING_STATUS, ACTIVE_STATUS } = require("../constants/clientStatuses");
const { notifyClient, notifyAdviser } = require("./notifications.service");

const TEMPLATES_BUCKET = process.env.DOCUMENT_TEMPLATES_BUCKET || "document-templates";
const DOCUMENTS_BUCKET = process.env.CLIENT_DOCUMENTS_BUCKET || "client-documents";
const { addConsentMonths } = require("../utils/complianceRules");
const { getConsentStatus } = require("./consent.service");
const { logConsentSigning } = require("./complianceAudit.service");
const SIGNED_URL_TTL_SECONDS = 60 * 10;

function docMeta(type) {
  return DOCUMENT_TYPES.find((d) => d.type === type);
}

// Excludes signature_data (base64 image data) — nothing consumes it and
// there's no reason to echo a large blob back on every send/sign response.
function toCamelDocument(row) {
  if (!row) return null;

  return {
    id: row.id,
    clientId: row.client_id,
    documentType: row.document_type,
    status: row.status,
    templateFileUrl: row.template_file_url,
    filledFileUrl: row.filled_file_url,
    signedFileUrl: row.signed_file_url,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function getClient(clientId) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*, roles!inner(name)")
    .eq("roles.name", "client")
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

function fullName(client) {
  return [client.first_name, client.second_name, client.surname].filter(Boolean).join(" ");
}

function clientFillFields(client) {
  return {
    full_name: fullName(client),
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
    bank_name: client.bank_name,
    bank_account_number: client.bank_account_number,
    bank_account_type: client.bank_account_type,
    debit_order_day: client.debit_order_day,
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

  await notifyClient(clientId, {
    title: `${docMeta(type).label} is ready for you to review and sign.`,
    body: "Open your Documents to review and sign it.",
  });
  return toCamelDocument(data);
}

// Bakes the captured signature into the filled PDF (generating it first if
// the document was never explicitly sent) and stores it as the signed copy.
async function signDocument(clientId, type, { signature, signerName }, actor) {
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

  return saveSignedCopy({ clientId, type, row, bytes: signedBytes, signature, signedAt });
}

// A client signed outside the app (print/scan or a PDF editor) and uploaded the result, so
// there is nothing to embed: the uploaded file is stored as-is as the signed copy.
async function uploadSignedDocument(clientId, type, fileBytes) {
  const row = await getDocumentRow(clientId, type);
  return saveSignedCopy({
    clientId,
    type,
    row,
    bytes: fileBytes,
    signature: null,
    signedAt: new Date().toISOString(),
  });
}

// Shared by every route to 'signed': stores the signed PDF, marks the document signed, and
// then checks whether that completes the client's onboarding documents.
async function saveSignedCopy({ clientId, type, row, bytes, signature, signedAt }) {
  const signedPath = `${clientId}/${type}/signed.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(signedPath, bytes, { contentType: "application/pdf", upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  const payload = {
    client_id: clientId,
    document_type: type,
    status: "signed",
    signed_file_url: signedPath,
    signature_data: signature || null,
    signed_at: signedAt,
    expires_at: type === "client_consent" ? addConsentMonths(signedAt) : null,
  };

  const { data, error } = row
    ? await supabaseAdmin.from("documents").update(payload).eq("id", row.id).select().single()
    : await supabaseAdmin.from("documents").insert(payload).select().single();

  if (error) throw new Error(error.message);
  if (type === "client_consent") await logConsentSigning(clientId, data, row, actor);
  return toCamelDocument(data);
}

async function getNotificationTarget(clientId) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("first_name, second_name, surname, advisor_id")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Tells the client's adviser that a document was signed or acknowledged and, when this was
// the one that completed all 5, tells both sides that onboarding paperwork is done. Best
// effort: nothing here may fail the signature that has already been saved.
async function notifyDocumentSigned(clientId, type, { completedOnboarding }) {
  try {
    const client = await getNotificationTarget(clientId);
    if (!client) return;

    const name = fullName(client);
    const { label } = docMeta(type);
    const verb = ACKNOWLEDGE_ONLY_TYPES.includes(type) ? "acknowledged" : "signed";

    await notifyAdviser(client.advisor_id, clientId, {
      title: `${name} ${verb} ${label}.`,
      body: "Open their profile to view it.",
    });

    if (completedOnboarding) {
      await notifyClient(clientId, {
        title: "All onboarding documents complete",
        body: "You've signed all 5 of your onboarding documents. Thank you.",
      });
      await notifyAdviser(client.advisor_id, clientId, {
        title: `${name}: all onboarding documents complete`,
        body: "All 5 onboarding documents are now signed.",
      });
    }
  } catch (err) {
    console.error(`[documents.service] could not notify about ${type} for client ${clientId}:`, err.message);
  }
}

// Once all 5 document types are signed, an 'onboarding' client becomes 'active'. The update
// is conditional on status = 'onboarding', so an already 'active' or 'inactive' client is
// never touched. The document is already saved by now, so a failure here is logged rather
// than failing the signature. Returns whether all 5 documents are signed.
async function activateClientIfAllSigned(clientId) {
  let allSigned = false;
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("document_type")
      .eq("client_id", clientId)
      .eq("status", "signed")
      .in("document_type", DOCUMENT_TYPE_VALUES);

    if (error) throw new Error(error.message);

    const signed = new Set((data || []).map((row) => row.document_type));
    if (!DOCUMENT_TYPE_VALUES.every((type) => signed.has(type))) return false;
    allSigned = true;

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ status: ACTIVE_STATUS })
      .eq("id", clientId)
      .eq("status", ONBOARDING_STATUS);

    if (updateError) throw new Error(updateError.message);
  } catch (err) {
    console.error(`[documents.service] could not update status for client ${clientId}:`, err.message);
  }
  return allSigned;
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

module.exports = {
  listDocuments,
  sendDocument,
  signDocument,
  uploadSignedDocument,
  getDownloadUrl,
  getConsentStatus,
};
