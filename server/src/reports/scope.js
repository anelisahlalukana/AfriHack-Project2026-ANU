// Who is asking and which clients they may report on. Every query builder starts from
// scopedClients(), so an adviser only ever reaches rows that belong to their own clients.
// Scope comes from the verified Supabase user (req.user.app_metadata.role), never from
// request parameters or model output: an adviser's advisor_id parameter is ignored.
const { CLIENT_ROLE_ID, PROVIDER_ROLE_ID, ADVISOR_ROLE } = require("../constants/roles");
const { forbidden } = require("../utils/httpError");

const PAGE_SIZE = 1000; // PostgREST returns at most this many rows per request.
const IN_CHUNK = 100; // keeps .in() filters well inside URL length limits.

function resolveReportAccess(user) {
  const role = user?.app_metadata?.role;
  const label = user?.user_metadata?.full_name || user?.email || "Adviser";
  if (role === ADVISOR_ROLE) return { role: "advisor", userId: user.id, label };
  if (role === "admin") return { role: "admin", userId: user.id, label };
  throw forbidden("Reports are available to advisers and admins.");
}

// The adviser whose book is being reported on, or null for "everyone" (admin only).
function effectiveAdvisorId(access, params = {}) {
  if (access.role === "advisor") return access.userId;
  if (access.role === "admin") return params.advisor_id || null;
  throw forbidden();
}

async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Clients in scope. Only the columns reports need: never ID numbers, contact details or FNA health data.
async function scopedClients(db, access, params = {}) {
  const advisorId = effectiveAdvisorId(access, params);
  const clients = await fetchAll(() => {
    let query = db.from("users").select("id, advisor_id, first_name, surname, status, created_at").eq("role_id", CLIENT_ROLE_ID);
    if (advisorId) query = query.eq("advisor_id", advisorId);
    return query.order("id");
  });
  // Belt and braces: whatever the query layer returned, an adviser keeps only their own clients.
  return access.role === "advisor" ? clients.filter((c) => c.advisor_id === access.userId) : clients;
}

// Rows of `table` whose client_id is one of the scoped clients. `refine` adds extra filters.
async function forClients(db, table, columns, clientIds, refine = (q) => q, key = "client_id") {
  const ids = [...new Set(clientIds)];
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    rows.push(...(await fetchAll(() => refine(db.from(table).select(columns).in(key, chunk)).order("id"))));
  }
  const allowed = new Set(ids);
  return rows.filter((row) => allowed.has(row[key]));
}

async function providerNames(db, providerIds) {
  const ids = [...new Set(providerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await forClients(db, "users", "id, organisation_name, role_id", ids, (q) => q.eq("role_id", PROVIDER_ROLE_ID), "id");
  return new Map(rows.map((r) => [r.id, r.organisation_name || "Provider"]));
}

module.exports = { resolveReportAccess, effectiveAdvisorId, fetchAll, scopedClients, forClients, providerNames, IN_CHUNK };
