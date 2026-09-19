const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { sendTransactionalEmail } = require("../utils/brevoClient");
const { escapeHtml } = require("../utils/escapeHtml");
const { ACCOUNT_ROLES, PROVIDER_ROLE, PROVIDER_ROLE_ID } = require("../constants/roles");

const LIST_PAGE_SIZE = 200;

// Provider organisations (public.users rows with role_id 2), by id.
async function providerNames() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, organisation_name")
    .eq("role_id", PROVIDER_ROLE_ID);
  if (error) throw new Error(error.message);
  return new Map(data.map((p) => [p.id, p.organisation_name]));
}

// Staff and provider logins (admin/advisor/provider) — clients are added by an
// advisor (see clients.service.js) and aren't managed here.
async function listStaffUsers() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: LIST_PAGE_SIZE });
  if (error) throw new Error(error.message);
  const accounts = data.users.filter((u) => ACCOUNT_ROLES.includes(u.app_metadata?.role));
  const providers = accounts.some((u) => u.app_metadata.role === PROVIDER_ROLE) ? await providerNames() : new Map();

  return accounts
    .map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.user_metadata?.full_name || null,
      role: u.app_metadata?.role,
      organisation: u.app_metadata?.role === PROVIDER_ROLE ? providers.get(u.app_metadata.provider_id) || "Unknown provider" : null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at || null,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Generates a fresh Supabase recovery link (each one works once) and emails it
// via Brevo. `intro` is the sentence explaining why they're getting the email.
async function sendPasswordSetupEmail({ email, fullName, intro }) {
  const redirectTo =
    process.env.ADMIN_INVITE_REDIRECT_URL || "http://localhost:5173/reset-password";

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (linkError) throw new Error(linkError.message);

  const actionLink = linkData?.properties?.action_link || linkData?.action_link;

  await sendTransactionalEmail({
    to: email,
    toName: fullName,
    subject: "Set up your Royal Square Financial account",
    htmlContent: `
      <p>Hi ${escapeHtml(fullName)},</p>
      <p>${intro}</p>
      <p><a href="${actionLink}">Click here to set your password</a> and sign in.</p>
      <p>If you weren't expecting this, you can ignore this email.</p>
    `,
  });
}

// A provider login must point at a real provider organisation (public.users, role_id 2).
async function getProviderOrganisation(providerId) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, organisation_name")
    .eq("id", providerId)
    .eq("role_id", PROVIDER_ROLE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw Object.assign(new Error("That provider doesn't exist"), { status: 400 });
  return data;
}

// Creates a staff or provider account with no password the user ever sees, then
// emails them a Supabase recovery link (via Brevo) so they set their own password.
async function createStaffUser({ email, fullName, role, providerId }) {
  const organisation = role === PROVIDER_ROLE ? await getProviderOrganisation(providerId) : null;
  const appMetadata = organisation ? { role, provider_id: organisation.id } : { role };

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { full_name: fullName },
    app_metadata: appMetadata,
  });

  if (createError) throw new Error(createError.message);

  await sendPasswordSetupEmail({
    email,
    fullName,
    intro: organisation
      ? `An administrator created a provider portal account for you at Royal Square Financial, for ${escapeHtml(organisation.organisation_name)}.`
      : `An administrator created a ${escapeHtml(role)} account for you at Royal Square Financial.`,
  });

  return {
    id: created.user.id,
    email: created.user.email,
    fullName,
    role,
    organisation: organisation?.organisation_name || null,
    createdAt: created.user.created_at,
  };
}

// Sends a staff member a new password-setup link, e.g. when the original
// expired or was already used up (some email apps open links automatically).
// Only staff accounts qualify; anything else is reported as not found.
async function resendStaffInvite(userId) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  const user = data?.user;

  if (error && error.status !== 404) throw new Error(error.message);
  if (!user || !ACCOUNT_ROLES.includes(user.app_metadata?.role)) {
    throw Object.assign(new Error("Staff account not found"), { status: 404 });
  }

  await sendPasswordSetupEmail({
    email: user.email,
    fullName: user.user_metadata?.full_name || user.email,
    intro: "An administrator sent you a new link to set your password for Royal Square Financial.",
  });

  return { id: user.id, email: user.email };
}

module.exports = { listStaffUsers, createStaffUser, resendStaffInvite };
