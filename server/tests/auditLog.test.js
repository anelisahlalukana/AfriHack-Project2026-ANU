const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuditLogService } = require("../src/services/auditLog.service");
const { validateAuditQuery } = require("../src/middleware/validate");

// Records what the service asked the database for. The scoping is the whole point
// of this service, so the tests assert on the filters rather than on fake rows.
function recordingDb({ rows = [], count = 0, failure = null } = {}) {
  const calls = [];
  const query = {
    filters: [],
    eq(column, value) { this.filters.push(["eq", column, value]); return this; },
    gte(column, value) { this.filters.push(["gte", column, value]); return this; },
    lte(column, value) { this.filters.push(["lte", column, value]); return this; },
    or(expression) { this.filters.push(["or", expression]); return this; },
    order(column, options) { this.orders = [...(this.orders || []), [column, options]]; return this; },
    limit(value) { this.limited = value; return this; },
    range(start, end) { this.ranged = [start, end]; return this; },
    then(resolve) { resolve(failure ? { data: null, error: failure, count: null } : { data: rows, error: null, count }); },
  };
  return {
    calls,
    query,
    from(table) {
      calls.push(table);
      return { select(columns, options) { query.selected = { columns, options }; return query; } };
    },
  };
}

const logger = { error() {} };
const admin = { id: "admin-1", app_metadata: { role: "admin" } };
const adviser = { id: "adviser-1", app_metadata: { role: "advisor" } };
const providerId = "11111111-2222-3333-4444-555555555555";
const provider = { id: "provider-user", app_metadata: { role: "provider", provider_id: providerId } };

function service(db) {
  return createAuditLogService({ db, logger });
}

function filterOf(query, kind, column) {
  return query.filters.find(([type, name]) => type === kind && (column === undefined || name === column));
}

test("an admin sees the whole log, unscoped", async () => {
  const db = recordingDb({ count: 3 });
  const result = await service(db).list(admin, { page: 1, pageSize: 25 });
  assert.equal(db.calls[0], "audit_events");
  assert.equal(filterOf(db.query, "or"), undefined);
  assert.equal(filterOf(db.query, "eq", "provider_id"), undefined);
  assert.equal(result.scope, "admin");
  assert.equal(result.total, 3);
});

test("an advisor sees only their own actions and their own clients' events", async () => {
  const db = recordingDb();
  await service(db).list(adviser, {});
  const [, expression] = filterOf(db.query, "or");
  assert.equal(expression, `owner_adviser_id.eq.${adviser.id},actor_id.eq.${adviser.id}`);
  // An advisor must never be narrowed to a single provider, nor widened past the or().
  assert.equal(filterOf(db.query, "eq", "provider_id"), undefined);
});

test("a provider sees only its own correspondence, never an internal note", async () => {
  const db = recordingDb();
  await service(db).list(provider, {});
  assert.deepEqual(filterOf(db.query, "eq", "provider_id"), ["eq", "provider_id", providerId]);
  // Restricting to the provider source is what keeps task_updates out of their view.
  assert.deepEqual(filterOf(db.query, "eq", "source"), ["eq", "source", "provider"]);
  assert.equal(filterOf(db.query, "or"), undefined);
});

test("a filter cannot widen a provider's or an advisor's scope", async () => {
  // A provider asking for the compliance source still only gets provider rows: the
  // scope is applied first and the filter can only narrow what is left.
  const db = recordingDb();
  await service(db).list(provider, { source: "compliance" });
  const sources = db.query.filters.filter(([type, name]) => type === "eq" && name === "source");
  assert.equal(sources[0][2], "provider");
});

test("a provider login with no organisation is refused rather than shown everything", async () => {
  const db = recordingDb();
  const broken = { id: "x", app_metadata: { role: "provider" } };
  await assert.rejects(service(db).list(broken, {}), error => error.status === 403);
  // Nothing should have been queried at all.
  assert.equal(db.calls.length, 0);
});

test("a client or an unknown role gets nothing", async () => {
  const db = recordingDb();
  for (const user of [{ id: "c", app_metadata: {} }, { id: "c" }, null]) {
    await assert.rejects(service(db).list(user, {}), error => error.status === 403);
  }
  assert.equal(db.calls.length, 0);
});

test("only whitelisted sort columns reach the database", async () => {
  const db = recordingDb();
  await service(db).list(admin, { sort: "occurred_at; drop table", direction: "asc" });
  assert.deepEqual(db.query.orders[0], ["occurred_at", { ascending: true, nullsFirst: false }]);
  // id breaks ties so paging stays stable across three sources sharing a timestamp.
  assert.deepEqual(db.query.orders[1], ["id", { ascending: true }]);
});

test("paging asks for the right slice and reports a real page count", async () => {
  const db = recordingDb({ count: 120 });
  const result = await service(db).list(admin, { page: 3, pageSize: 25 });
  assert.deepEqual(db.query.ranged, [50, 74]);
  assert.equal(result.pageCount, 5);
  assert.equal(result.page, 3);
});

test("a download asks for every matching row from the first one", async () => {
  const db = recordingDb({ count: 400 });
  const result = await service(db).list(admin, { page: 7, pageSize: 25, all: true });
  assert.equal(db.query.ranged[0], 0);
  assert.equal(result.page, 1);
  assert.equal(result.truncated, false);
});

test("search and date filters are passed through, with separators stripped from the search", async () => {
  const db = recordingDb();
  await service(db).list(admin, { search: "pay,out(2)", from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z" });
  const [, expression] = db.query.filters.filter(([type]) => type === "or").at(-1);
  assert.ok(!expression.includes("("), "parentheses would break out of the or() grouping");
  assert.ok(expression.includes("summary.ilike.%pay out 2%"));
  assert.deepEqual(filterOf(db.query, "gte", "occurred_at"), ["gte", "occurred_at", "2026-01-01T00:00:00Z"]);
  assert.deepEqual(filterOf(db.query, "lte", "occurred_at"), ["lte", "occurred_at", "2026-02-01T00:00:00Z"]);
});

test("a missing view names the migration to run and hides database internals", async () => {
  const db = recordingDb({ failure: { code: "PGRST205", message: "relation does not exist" } });
  await assert.rejects(service(db).list(admin, {}), error =>
    error.status === 503 &&
    error.message.includes("202609200001_audit_log.sql") &&
    !error.message.includes("relation does not exist"));
});

// ---------------------------------------------------------------------------
// Query string validation
// ---------------------------------------------------------------------------

function run(query) {
  let status, body, passed = false;
  const req = { query };
  const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
  validateAuditQuery(req, res, () => { passed = true; });
  return { status, body, passed, parsed: req.auditQuery };
}

test("the audit query string rejects anything it does not recognise", () => {
  for (const query of [
    { page: "0" }, { page: "-1" }, { page: "two" },
    { size: "7" }, { sort: "metadata" }, { dir: "sideways" },
    { source: "everything" }, { from: "not-a-date" },
    { from: "2026-02-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    { clientId: "not-a-uuid" }, { all: "yes" },
    { q: "x".repeat(121) }, { somethingElse: "1" },
    { size: ["25", "50"] },
  ]) {
    const { status, body, passed } = run(query);
    assert.equal(status, 400, JSON.stringify(query));
    assert.equal(typeof body.error, "string");
    assert.equal(passed, false);
  }
});

test("the audit query string defaults to the newest page and keeps valid filters", () => {
  const empty = run({});
  assert.equal(empty.passed, true);
  assert.deepEqual(
    { page: empty.parsed.page, sort: empty.parsed.sort, direction: empty.parsed.direction, all: empty.parsed.all },
    { page: 1, sort: "occurredAt", direction: "desc", all: false },
  );

  const full = run({ page: "2", size: "50", sort: "actorName", dir: "asc", q: "consent", source: "compliance", all: "1" });
  assert.equal(full.passed, true);
  assert.equal(full.parsed.pageSize, 50);
  assert.equal(full.parsed.sort, "actorName");
  assert.equal(full.parsed.search, "consent");
  assert.equal(full.parsed.all, true);
});
