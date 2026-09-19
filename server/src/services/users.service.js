const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { sendTransactionalEmail } = require("../utils/brevoClient");
const { ROLES } = require("../constants/roles");

const LIST_PAGE_SIZE = 200;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Staff accounts only (admin/advisor) — clients self-register
// via signup and aren't managed here.
async function listStaffUsers() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: LIST_PAGE_SIZE });
  if (error) throw new Error(error.message);

  return data.users
    .filter((u) => ROLES.includes(u.app_metadata?.role))
    .map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.user_metadata?.full_name || null,
      role: u.app_metadata?.role,
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

// Creates a staff account with no password the user ever sees, then emails
// them a Supabase recovery link (via Brevo) so they set their own password.
async function createStaffUser({ email, fullName, role }) {
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
    user_metadata: { full_name: fullName },
    app_metadata: { role },
  });

  if (createError) throw new Error(createError.message);

  await sendPasswordSetupEmail({
    email,
    fullName,
    intro: `An administrator created a ${escapeHtml(role)} account for you at Royal Square Financial.`,
  });

  return {
    id: created.user.id,
    email: created.user.email,
    fullName,
    role,
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
  if (!user || !ROLES.includes(user.app_metadata?.role)) {
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
