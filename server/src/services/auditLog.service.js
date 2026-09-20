const { supabaseAdmin } = require("../config/supabaseClient");
const { ADVISOR_ROLE, PROVIDER_ROLE } = require("../constants/roles");
const { SORTABLE, DEFAULT_SORT, DEFAULT_DIRECTION, DEFAULT_PAGE_SIZE, EXPORT_MAX_ROWS, FACET_SCAN_ROWS } = require("../constants/auditLog");
const { HttpError, forbidden } = require("../utils/httpError");

const COLUMNS = [
  "id", "occurred_at", "source", "category", "summary", "result",
  "actor_name", "actor_type", "actor_id", "client_id", "client_name",
  "owner_adviser_id", "provider_id", "provider_name", "task_id",
  "task_reference", "internal_only", "metadata",
].join(",");

// Postgres treats a comma as the separator inside PostgREST's or() filter, so any
// value placed in one has to be free of commas and quotes. Every value we put there
// is a uuid we have already validated, but escape defensively rather than trusting that.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createAuditLogService({ db = supabaseAdmin, logger = console } = {}) {
  function fail(error) {
    logger.error("[Audit log] Database operation failed:", error.code || "unknown");
    if (["PGRST205", "PGRST202", "PGRST204", "42P01", "42703", "42883"].includes(error.code)) {
      throw new HttpError(503, "The audit log view is missing. Run 202609200001_audit_log.sql in this Supabase project's SQL Editor, then refresh.");
    }
    throw new HttpError(503, "Audit log data is unavailable. Check the audit migration and try again.");
  }

  // Who the caller is allowed to see. Returns the scope applied to every query, so a
  // single place decides visibility for all three roles.
  function scopeFor(user) {
    const role = user?.app_metadata?.role;
    if (role === "admin") return { role: "admin" };
    if (role === ADVISOR_ROLE) return { role: ADVISOR_ROLE, adviserId: user.id };
    if (role === PROVIDER_ROLE) {
      const providerId = user.app_metadata?.provider_id;
      // A provider login with no organisation must see nothing rather than everything.
      if (!UUID.test(String(providerId || ""))) throw forbidden("This provider login has no organisation linked to it.");
      return { role: PROVIDER_ROLE, providerId };
    }
    throw forbidden();
  }

  function applyScope(query, scope) {
    if (scope.role === "admin") return query;
    if (scope.role === ADVISOR_ROLE) {
      // Their own actions, plus everything that happened on a client assigned to them.
      return query.or(`owner_adviser_id.eq.${scope.adviserId},actor_id.eq.${scope.adviserId}`);
    }
    // Providers see only their own correspondence, never an internal Royal Square note.
    return query.eq("provider_id", scope.providerId).eq("source", "provider");
  }

  function applyFilters(query, filters) {
    const { search, source, category, actorType, from, to, clientId, taskId } = filters;
    if (source) query = query.eq("source", source);
    if (category) query = query.eq("category", category);
    if (actorType) query = query.eq("actor_type", actorType);
    if (clientId) query = query.eq("client_id", clientId);
    if (taskId) query = query.eq("task_id", taskId);
    if (from) query = query.gte("occurred_at", from);
    if (to) query = query.lte("occurred_at", to);
    if (search) {
      // Commas and parentheses would break out of the or() grouping, so drop them.
      const needle = search.replace(/[,()*]/g, " ").trim();
      if (needle) {
        query = query.or(
          ["summary", "actor_name", "client_name", "provider_name", "task_reference", "category"]
            .map(column => `${column}.ilike.%${needle}%`)
            .join(","),
        );
      }
    }
    return query;
  }

  function shape(row) {
    return {
      id: row.id,
      occurredAt: row.occurred_at,
      source: row.source,
      category: row.category,
      summary: row.summary,
      result: row.result,
      actorName: row.actor_name,
      actorType: row.actor_type,
      clientId: row.client_id,
      clientName: row.client_name,
      providerName: row.provider_name,
      taskId: row.task_id,
      taskReference: row.task_reference,
      internalOnly: row.internal_only,
      metadata: row.metadata || {},
    };
  }

  // One page of the feed, already scoped, filtered and sorted in the database.
  // `total` is the count of everything matching, so the pager can show a real range.
  async function list(user, options = {}) {
    const scope = scopeFor(user);
    const {
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      sort = DEFAULT_SORT,
      direction = DEFAULT_DIRECTION,
      all = false,
      ...filters
    } = options;

    const column = SORTABLE[sort] || SORTABLE[DEFAULT_SORT];
    const ascending = direction === "asc";
    const size = all ? EXPORT_MAX_ROWS : pageSize;
    const offset = all ? 0 : (Math.max(1, page) - 1) * pageSize;

    let query = applyFilters(applyScope(db.from("audit_events").select(COLUMNS, { count: "exact" }), scope), filters)
      .order(column, { ascending, nullsFirst: false })
      // occurred_at is not unique across three sources, so id keeps paging stable.
      .order("id", { ascending })
      .range(offset, offset + size - 1);

    const { data, error, count } = await query;
    if (error) fail(error);

    const total = count ?? data.length;
    return {
      entries: data.map(shape),
      page: all ? 1 : Math.max(1, page),
      pageSize: size,
      total,
      pageCount: Math.max(1, Math.ceil(total / size)),
      truncated: all && total > EXPORT_MAX_ROWS,
      scope: scope.role,
    };
  }

  // The distinct values actually present in what this caller can see, so the filter
  // dropdowns never offer a category that would return nothing.
  async function facets(user) {
    const scope = scopeFor(user);
    const { data, error } = await applyScope(db.from("audit_events").select("source,category,actor_type"), scope)
      .order("occurred_at", { ascending: false })
      .limit(FACET_SCAN_ROWS);
    if (error) fail(error);
    const unique = key => [...new Set(data.map(row => row[key]).filter(Boolean))].sort();
    return { sources: unique("source"), categories: unique("category"), actorTypes: unique("actor_type") };
  }

  return { list, facets, scopeFor };
}

module.exports = { ...createAuditLogService(), createAuditLogService };
