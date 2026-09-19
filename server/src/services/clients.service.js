const crypto = require("crypto");
const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { supabaseAdmin } = require("../config/supabaseClient");
const { sendTransactionalEmail } = require("../utils/brevoClient");
const { escapeHtml } = require("../utils/escapeHtml");
const { CLIENT_ROLE_ID } = require("../constants/roles");

const ONBOARDING_STATUS = "onboarding";
const CODE_COOLDOWN_MS = 60 * 1000;

// Throttle on verification-code emails (auth user id -> last send time). The
// complete-registration endpoint is public, so without this anyone who knows a
// pending client's email could flood their inbox. Per server process, which is
// enough for a single-instance deployment.
const lastCodeSentAt = new Map();

// Failed ID-number sign-ins (ID number -> { count, since }). IDs are easy to
// find out, so the password is all that protects an account; this stops the
// login endpoint being used to guess it.
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginFailures = new Map();

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function clientAppUrl() {
  return process.env.CLIENT_APP_URL || "http://localhost:5173";
}

// ilike treats % and _ as wildcards, and _ is common in email addresses.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, "\\$&");
}

// Undoes a half-finished createClient so the adviser can simply retry.
async function rollbackNewClient(userRowId, authUserId) {
  if (authUserId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
    if (error) console.error("[clients.service] could not delete auth user", authUserId, error.message);
  }
  const { error } = await supabaseAdmin.from("users").delete().eq("id", userRowId);
  if (error) console.error("[clients.service] could not delete users row", userRowId, error.message);
}

// Adviser adds a client: creates the public.users row AND the client's login,
// links the two, and emails an invitation to finish registering. If any step
// fails, everything created so far is removed.
async function createClient({ advisorId, firstName, secondName, surname, email, mobile }) {
  const contactEmail = email.trim().toLowerCase();

  const { data: row, error: insertError } = await supabaseAdmin
    .from("users")
    .insert({
      role_id: CLIENT_ROLE_ID,
      first_name: firstName.trim(),
      second_name: secondName?.trim() || null,
      surname: surname.trim(),
      contact_email: contactEmail,
      contact_mobile: mobile?.trim() || null,
      status: ONBOARDING_STATUS,
      advisor_id: advisorId,
    })
    .select("id, first_name, second_name, surname, contact_email, contact_mobile, status")
    .single();

  if (insertError) throw new Error(insertError.message);

  let authUserId = null;

  try {
    // Same pattern as createStaffUser: a random password nobody ever sees. No
    // app_metadata.role, so lib/authRoles.js treats this login as a client.
    // email_confirm is false: the client proves the address later with a code.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: contactEmail,
      email_confirm: false,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { full_name: `${row.first_name} ${row.surname}` },
    });

    if (createError) {
      if (createError.code === "email_exists" || /already been registered/i.test(createError.message)) {
        throw httpError(409, "A login with that email address already exists.");
      }
      throw new Error(createError.message);
    }

    authUserId = created.user.id;

    const { error: linkError } = await supabaseAdmin
      .from("users")
      .update({ auth_user_id: authUserId })
      .eq("id", row.id);

    if (linkError) throw new Error(linkError.message);

    const registerUrl = `${clientAppUrl()}/complete-registration?email=${encodeURIComponent(contactEmail)}`;

    await sendTransactionalEmail({
      to: contactEmail,
      toName: `${row.first_name} ${row.surname}`,
      subject: "Complete your Royal Square Financial registration",
      htmlContent: `
        <p>Hi ${escapeHtml(row.first_name)},</p>
        <p>Your adviser at Royal Square Financial has set up your client profile.</p>
        <p><a href="${registerUrl}">Click here to complete your registration</a>. You'll be asked for your ID number and to choose a password, then we'll email you a verification code.</p>
        <p>If you weren't expecting this, you can ignore this email.</p>
      `,
    });
  } catch (err) {
    await rollbackNewClient(row.id, authUserId);
    throw err;
  }

  return { ...row, auth_user_id: authUserId };
}

// Public step of client registration (this IS the auth step): saves the client's
// ID number, sets their real password, and emails a 6-digit code that the
// browser then checks with supabase.auth.verifyOtp(type: 'email').
async function completeRegistration({ email, idNumber, password }) {
  const contactEmail = email.trim().toLowerCase();

  const { data: rows, error: findError } = await supabaseAdmin
    .from("users")
    .select("id, auth_user_id, first_name")
    .eq("role_id", CLIENT_ROLE_ID)
    .eq("status", ONBOARDING_STATUS)
    .ilike("contact_email", escapeLike(contactEmail))
    .limit(2);

  if (findError) throw new Error(findError.message);

  if (!rows.length || !rows[0].auth_user_id) {
    throw httpError(
      404,
      "We couldn't find a pending registration for that email address. Ask your adviser to send a new invitation."
    );
  }
  if (rows.length > 1) {
    throw httpError(409, "More than one client profile uses this email address. Please contact your adviser.");
  }

  const client = rows[0];

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(client.auth_user_id);

  if (authError || !authData?.user) {
    throw httpError(404, "We couldn't find a login for this registration. Please contact your adviser.");
  }

  const authUser = authData.user;

  // Once the email is verified this endpoint must stop working; otherwise anyone
  // who knows the address could reset a finished client's password.
  if (authUser.email_confirmed_at) {
    throw httpError(409, "This registration is already complete. Please sign in.");
  }

  const lastSent = lastCodeSentAt.get(authUser.id);
  if (lastSent && Date.now() - lastSent < CODE_COOLDOWN_MS) {
    throw httpError(429, "A code was sent a moment ago. Please wait a minute before asking for another.");
  }

  // Clients sign in with their ID number, so it must identify exactly one client.
  const { data: sameId, error: sameIdError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("role_id", CLIENT_ROLE_ID)
    .eq("id_number", idNumber.trim())
    .neq("id", client.id)
    .limit(1);

  if (sameIdError) throw new Error(sameIdError.message);
  if (sameId.length) {
    throw httpError(409, "That ID number is already registered to another client. Please check it, or contact your adviser.");
  }

  const { error: idError } = await supabaseAdmin
    .from("users")
    .update({ id_number: idNumber.trim() })
    .eq("id", client.id);

  if (idError) throw new Error(idError.message);

  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password });

  if (passwordError) throw httpError(400, passwordError.message);

  // generateLink returns the raw code alongside the link. We email the code
  // through Brevo (like the other account emails) and ignore the link.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: authUser.email,
  });

  if (linkError) throw new Error(linkError.message);

  const code = linkData?.properties?.email_otp;
  if (!code) throw new Error("Couldn't generate a verification code. Please try again.");

  await sendTransactionalEmail({
    to: authUser.email,
    toName: client.first_name,
    subject: "Your Royal Square Financial verification code",
    htmlContent: `
      <p>Hi ${escapeHtml(client.first_name)},</p>
      <p>Your verification code is:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p>
      <p>Enter it on the registration page to finish setting up your account. The code expires soon, so use it right away.</p>
      <p>If you weren't expecting this, you can ignore this email.</p>
    `,
  });

  lastCodeSentAt.set(authUser.id, Date.now());
}

// Client sign-in. Supabase signs users in by email, so we find the client's login
// from their ID number, sign in on their behalf, and hand back only the session
// tokens. The email is never sent to the browser, and every failure reads the
// same so the endpoint can't be used to discover which ID numbers are registered.
async function loginWithIdNumber({ idNumber, password }) {
  const id = idNumber.trim();

  const failures = loginFailures.get(id);
  if (failures && Date.now() - failures.since > LOGIN_LOCKOUT_MS) loginFailures.delete(id);
  if ((loginFailures.get(id)?.count ?? 0) >= MAX_LOGIN_FAILURES) {
    throw httpError(429, "Too many failed sign-in attempts. Please try again in 15 minutes.");
  }

  const rejected = () => {
    const previous = loginFailures.get(id);
    loginFailures.set(id, { count: (previous?.count ?? 0) + 1, since: previous?.since ?? Date.now() });
    return httpError(401, "Invalid ID number or password.");
  };

  const { data: rows, error: findError } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("role_id", CLIENT_ROLE_ID)
    .eq("id_number", id)
    .limit(2);

  if (findError) throw new Error(findError.message);
  if (rows.length !== 1 || !rows[0].auth_user_id) throw rejected();

  const { data: authData } = await supabaseAdmin.auth.admin.getUserById(rows[0].auth_user_id);
  const email = authData?.user?.email;
  if (!email) throw rejected();

  // A throwaway client, so no user session ever sits on the shared admin client.
  const signInClient = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: signInError } = await signInClient.auth.signInWithPassword({ email, password });

  if (signInError || !data?.session) {
    // Only reachable with the right password, so it's safe to be specific.
    if (signInError?.code === "email_not_confirmed") {
      throw httpError(403, "Your registration isn't finished yet. Use the link in your invitation email to complete it.");
    }
    throw rejected();
  }

  loginFailures.delete(id);
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

module.exports = { createClient, completeRegistration, loginWithIdNumber };
