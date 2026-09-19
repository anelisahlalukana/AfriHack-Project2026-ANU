// End-to-end test of reminders + push against the REAL Supabase project in server/.env.
//
//   node scripts/e2e-reminders.js --yes
//
// It creates a throwaway advisor, a throwaway client (a login and a users row) and some
// reminders, drives the real Express router with real sign-ins and the real database
// functions, then deletes everything it created. Every advisor gets a copy of a client's
// notifications by design, so real advisors briefly receive test notifications too; those
// rows (all tied to the throwaway client) are deleted at the end.
//
// Push delivery is stubbed (no message leaves this machine); the subscription, claim,
// lease, retry and clean-up logic around it is the real code and the real database.
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env"), quiet: true });
const crypto = require("node:crypto");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { supabaseAdmin: db } = require("../src/config/supabaseClient");
const { createReminders } = require("../src/reminders");

if (!process.argv.includes("--yes")) {
  console.error("This writes temporary data to the live database (and removes it afterwards).\nRe-run with --yes to continue.");
  process.exit(2);
}

const tag = `e2e${Date.now().toString(36)}`;
const results = [];
const created = { authUsers: [], clientRowId: null };
const johannesburgToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`FAIL  ${name}\n        ${error.message}`);
  }
}
const check = (condition, message) => { if (!condition) throw new Error(message); };
const same = (actual, expected, label) => check(JSON.stringify(actual) === JSON.stringify(expected), `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

async function makeUser(email, appMetadata) {
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: appMetadata, user_metadata: { full_name: `E2E ${email.split("@")[0]}` } });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  created.authUsers.push(data.user.id);
  const session = await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    .auth.signInWithPassword({ email, password });
  if (session.error) throw new Error(`could not sign in ${email}: ${session.error.message}`);
  return { id: data.user.id, token: session.data.session.access_token };
}

async function cleanup() {
  const problems = [];
  const attempt = async (label, promise) => { const { error } = await promise; if (error) problems.push(`${label}: ${error.message}`); };
  const clientId = created.clientRowId;
  if (clientId) {
    await attempt("notifications", db.from("notifications").delete().eq("client_id", clientId));
    await attempt("reminders", db.from("reminders").delete().eq("client_id", clientId));
    await attempt("messages", db.from("client_messages").delete().eq("client_id", clientId));
    await attempt("snapshots", db.from("financial_snapshots").delete().eq("client_id", clientId));
    await attempt("documents", db.from("documents").delete().eq("client_id", clientId));
  }
  for (const id of created.authUsers) await attempt("subscriptions", db.from("push_subscriptions").delete().eq("user_id", id));
  if (clientId) await attempt("client row", db.from("users").delete().eq("id", clientId));
  for (const id of created.authUsers) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) problems.push(`auth user ${id}: ${error.message}`);
  }
  // Verify nothing is left behind.
  const left = [];
  if (clientId) {
    for (const table of ["notifications", "reminders", "client_messages", "financial_snapshots", "documents"]) {
      const { count } = await db.from(table).select("*", { count: "exact", head: true }).eq("client_id", clientId);
      if (count) left.push(`${table}: ${count}`);
    }
    const { count } = await db.from("users").select("*", { count: "exact", head: true }).eq("id", clientId);
    if (count) left.push(`users: ${count}`);
  }
  return { problems, left };
}

async function main() {
  const sent = [];
  let pushMode = "ok";
  const push = async (subscription, payload) => {
    sent.push({ endpoint: subscription.endpoint, payload });
    if (pushMode === "gone") throw Object.assign(new Error("gone"), { statusCode: 410 });
  };
  const reminders = createReminders({ push, pushPublicKey: "BE2E-TEST-PUBLIC-KEY" });
  const app = express();
  app.use("/api/reminders", express.json({ limit: "32kb" }), reminders.router);
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/reminders`;
  const call = async (token, path, { method = "GET", body } = {}) => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  let advisor, client, clientRow, today = johannesburgToday();
  try {
    console.log(`\nSetting up throwaway accounts (${tag})…`);
    advisor = await makeUser(`${tag}-advisor@example.com`, { role: "advisor" });
    client = await makeUser(`${tag}-client@example.com`, {});
    const { data, error } = await db.from("users").insert({ role_id: 1, first_name: "E2E", surname: `Client ${tag}`, contact_email: `${tag}-client@example.com`, status: "onboarding", advisor_id: advisor.id, auth_user_id: client.id }).select("id").single();
    if (error) throw new Error(`could not create the client record: ${error.message}`);
    clientRow = data;
    created.clientRowId = data.id;
    console.log("Ready. Running checks…\n");

    console.log("-- Sign-in and roles");
    await step("no token is rejected with 401", async () => same((await call(null, "/reminders")).status, 401, "status"));
    await step("a garbage token is rejected with 401", async () => same((await call("nope", "/reminders")).status, 401, "status"));
    await step("advisor login is recognised as an adviser", async () => { const r = await call(advisor.token, "/me"); same([r.status, r.body.role], [200, "adviser"], "me"); });
    await step("client login is recognised and linked to their client record (auth_user_id)", async () => { const r = await call(client.token, "/me"); same([r.status, r.body.role, r.body.clientId], [200, "client", clientRow.id], "me"); });
    await step("a login with no client record is refused", async () => { const stray = await makeUser(`${tag}-stray@example.com`, {}); same((await call(stray.token, "/reminders")).status, 403, "status"); });

    console.log("\n-- Advisor: clients, reminder types, scheduling");
    await step("advisor can list clients and sees the test client by full name", async () => { const r = await call(advisor.token, "/clients"); check(r.body.some(c => c.id === clientRow.id && c.name === `E2E Client ${tag}`), "test client missing or misnamed"); });
    await step("reminder types are available", async () => { const r = await call(advisor.token, "/rules"); check(r.status === 200 && r.body.some(x => x.id === "annual-review"), "rules missing"); });
    let recurring;
    await step("advisor schedules a recurring reminder (due today, both audiences, every 12 months)", async () => {
      const r = await call(advisor.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "annual-review", dueDate: today, audience: "both", repeatMonths: 12 } });
      same([r.status, r.body.status, r.body.dueDate], [201, "active", today], "created");
      recurring = r.body;
    });
    await step("bad input is rejected (invalid date, unknown type, unknown client)", async () => {
      same((await call(advisor.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "annual-review", dueDate: "2026-02-30" } })).status, 400, "bad date");
      same((await call(advisor.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "no-such-type", dueDate: today } })).status, 400, "bad rule");
      same((await call(advisor.token, "/reminders", { method: "POST", body: { clientId: crypto.randomUUID(), ruleId: "annual-review", dueDate: today } })).status, 404, "bad client");
    });
    await step("the reminder appears in the advisor's list", async () => { const r = await call(advisor.token, "/reminders"); check(r.body.some(x => x.id === recurring.id), "not listed"); });
    await step("the client can see it (audience includes the client) but cannot create or complete reminders", async () => {
      check((await call(client.token, "/reminders")).body.some(x => x.id === recurring.id), "client cannot see own reminder");
      same((await call(client.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "annual-review", dueDate: today } })).status, 403, "client create");
      same((await call(client.token, `/reminders/${recurring.id}/complete`, { method: "POST" })).status, 403, "client complete");
    });

    console.log("\n-- Push subscriptions");
    const keys = () => { const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys(); return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") }; };
    const advisorEndpoint = `https://fcm.googleapis.com/fcm/send/${tag}-advisor`, clientEndpoint = `https://fcm.googleapis.com/fcm/send/${tag}-client`;
    await step("push config is public and reports push as enabled", async () => { const r = await call(null, "/config"); same([r.status, r.body.push.enabled], [200, true], "config"); });
    await step("advisor and client can subscribe a device", async () => {
      same((await call(advisor.token, "/push/subscriptions", { method: "POST", body: { endpoint: advisorEndpoint, keys: keys() } })).status, 201, "advisor");
      same((await call(client.token, "/push/subscriptions", { method: "POST", body: { endpoint: clientEndpoint, keys: keys() } })).status, 201, "client");
      const { data } = await db.from("push_subscriptions").select("endpoint,user_id").in("endpoint", [advisorEndpoint, clientEndpoint]);
      check(data.length === 2 && data.find(s => s.endpoint === advisorEndpoint).user_id === advisor.id, "subscriptions not stored against the right users");
    });
    await step("unsafe or malformed subscriptions are refused", async () => {
      same((await call(advisor.token, "/push/subscriptions", { method: "POST", body: { endpoint: "http://fcm.googleapis.com/x", keys: keys() } })).status, 400, "http");
      same((await call(advisor.token, "/push/subscriptions", { method: "POST", body: { endpoint: "https://evil.example.com/x", keys: keys() } })).status, 400, "unknown host");
      same((await call(advisor.token, "/push/subscriptions", { method: "POST", body: { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: "short" } } })).status, 400, "bad keys");
    });

    console.log("\n-- Scheduler: due reminders become notifications and push");
    let tickError = "";
    await step("the scheduler runs against the real database functions", async () => {
      try { await reminders.service.tick(); } catch (error) {
        tickError = error.message || JSON.stringify(error);
        // The friendly 503 hides the cause, so ask the database directly (the due reminder is still waiting).
        const raw = await db.rpc("reminders_run_reminders");
        const cause = raw.error ? `${raw.error.code}: ${raw.error.message}` : tickError;
        throw new Error(/client_user_id/.test(cause) ? `the database still has the broken reminder functions (${cause}). Apply supabase/migrations/202609190011_reminders_fix_client_link.sql, then re-run.` : cause, { cause: error });
      }
    });
    await step("advisor receives the notification (with the reminder's title and due date)", async () => {
      const r = await call(advisor.token, "/notifications");
      const n = r.body.find(x => x.title === "Annual review meeting" && x.body.includes(today));
      check(n, `not in the advisor's inbox (inbox has ${r.body.length} item(s))`);
      check(!n.readAt && n.section === "reminders", "should be unread and in the reminders section");
    });
    await step("client receives their own notification, and only their own", async () => {
      const r = await call(client.token, "/notifications");
      check(r.body.some(x => x.title === "Annual review meeting"), "not in the client's inbox");
      const { data } = await db.from("notifications").select("recipient_user_id").eq("client_id", clientRow.id);
      check(data.every(row => row.recipient_user_id), "a notification has no recipient");
    });
    await step("the recurring reminder moved to next year and remembers when it last fired", async () => {
      const { data } = await db.from("reminders").select("trigger_date,anchor_date,last_sent_at,status").eq("id", recurring.id).single();
      const nextYear = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
      same([data.status, data.trigger_date, data.anchor_date], ["pending", nextYear, today], "reminder row");
      check(data.last_sent_at, "last_sent_at not set");
    });
    await step("push went out once per device with no private text and the right page to open", async () => {
      const advisorPush = sent.find(s => s.endpoint === advisorEndpoint), clientPush = sent.find(s => s.endpoint === clientEndpoint);
      check(advisorPush && clientPush, `expected a push for each device, got ${sent.length}`);
      same([advisorPush.payload.url, clientPush.payload.url], ["/reminders", "/account/reminders"], "deep links");
      check(!/E2E|Annual|review/.test(JSON.stringify([advisorPush.payload, clientPush.payload])), "private text leaked into the push payload");
      const { data } = await db.from("notifications").select("push_status,delivered_to,recipient_user_id").eq("client_id", clientRow.id).in("recipient_user_id", [advisor.id, client.id]);
      check(data.length === 2 && data.every(n => n.push_status === "sent" && n.delivered_to.length === 1), `push_status/delivered_to not recorded: ${JSON.stringify(data)}`);
    });
    await step("running the scheduler again sends nothing twice", async () => {
      const before = sent.length;
      await reminders.service.tick();
      same(sent.length, before, "extra pushes");
      const { count } = await db.from("notifications").select("*", { count: "exact", head: true }).eq("client_id", clientRow.id).eq("recipient", "advisor");
      check(count >= 1, "advisor notification vanished");
    });

    console.log("\n-- One-time, adviser-only reminder; read receipts; completion");
    let once;
    await step("a one-time adviser-only reminder notifies advisers only, then becomes 'notified'", async () => {
      const r = await call(advisor.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "retirement-fee", dueDate: today, audience: "adviser", repeatMonths: 0 } });
      once = r.body;
      const clientBefore = (await call(client.token, "/notifications")).body.length;
      await reminders.service.tick();
      const { data } = await db.from("reminders").select("status").eq("id", once.id).single();
      same(data.status, "notified", "status");
      same((await call(client.token, "/notifications")).body.length, clientBefore, "client inbox size");
      check((await call(advisor.token, "/notifications")).body.some(x => x.title === "Retirement fee renewal"), "advisor not notified");
    });
    await step("a notification can be marked read by its owner only", async () => {
      const mine = (await call(advisor.token, "/notifications")).body.find(x => x.title === "Retirement fee renewal");
      same((await call(client.token, `/notifications/${mine.id}/read`, { method: "PATCH" })).status, 404, "other user");
      const r = await call(advisor.token, `/notifications/${mine.id}/read`, { method: "PATCH" });
      check(r.status === 200 && r.body.readAt, "not marked read");
    });
    await step("advisor can mark a reminder done; a client cannot", async () => {
      const r = await call(advisor.token, `/reminders/${once.id}/complete`, { method: "POST" });
      same([r.status, r.body.status], [200, "completed"], "complete");
    });

    console.log("\n-- Push clean-up: an expired device is removed");
    await step("a 410 Gone from the push service removes that subscription", async () => {
      await call(advisor.token, "/reminders", { method: "POST", body: { clientId: clientRow.id, ruleId: "retirement-fee", dueDate: today, audience: "adviser", repeatMonths: 0 } });
      pushMode = "gone";
      await reminders.service.tick();
      pushMode = "ok";
      const { data } = await db.from("push_subscriptions").select("endpoint").eq("endpoint", advisorEndpoint);
      same(data.length, 0, "advisor subscription rows still present");
    });
    await step("a device can turn push off (DELETE)", async () => {
      same((await call(client.token, "/push/subscriptions", { method: "DELETE", body: { endpoint: clientEndpoint } })).status, 204, "status");
      const { data } = await db.from("push_subscriptions").select("endpoint").eq("endpoint", clientEndpoint);
      same(data.length, 0, "rows");
    });

    console.log("\n-- Messages and financial pull");
    await step("advisor and client can message each other, and the other side is notified", async () => {
      const r = await call(advisor.token, "/messages", { method: "POST", body: { clientId: clientRow.id, body: "Hello from the e2e test" } });
      same([r.status, r.status === 201 ? "" : r.body], [201, ""], "advisor send");
      check((await call(client.token, `/messages/${clientRow.id}`)).body.some(m => m.body === "Hello from the e2e test"), "client cannot read it");
      check((await call(client.token, "/notifications")).body.some(n => n.section === "messages"), "client not notified of the message");
      same((await call(client.token, "/messages", { method: "POST", body: { clientId: clientRow.id, body: "Reply" } })).status, 201, "client reply");
    });
    await step("financial data is refused without valid consent, and allowed once consent is signed", async () => {
      same((await call(advisor.token, `/financial-pull/${clientRow.id}`, { method: "POST" })).status, 403, "no consent");
      const signedAt = new Date().toISOString();
      const { error } = await db.from("documents").insert({ client_id: clientRow.id, document_type: "client_consent", status: "signed", signed_at: signedAt, expires_at: new Date(Date.now() + 86400000).toISOString() });
      if (error) throw new Error(error.message);
      const r = await call(advisor.token, `/financial-pull/${clientRow.id}`, { method: "POST" });
      same([r.status, r.body.simulated], [200, true], "with consent");
    });
  } finally {
    server.close();
    console.log("\nCleaning up test data…");
    const { problems, left } = await cleanup();
    if (problems.length) console.log("Clean-up problems:\n  " + problems.join("\n  "));
    console.log(left.length ? `LEFT BEHIND (remove by hand): ${left.join(", ")}` : "Clean-up verified: nothing left behind.");
    if (left.length || problems.length) results.push({ name: "clean-up", ok: false, detail: [...problems, ...left].join("; ") });
  }
}

main().catch(error => { console.error("\nThe test run could not complete:", error.message); results.push({ name: "run", ok: false, detail: error.message }); }).finally(() => {
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
});
